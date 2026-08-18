# Catalog data

Two catalogs live here, both shaped for `POST /organizations/{slug}/documents/batch`:

| File | Size | Committed? | Source |
|---|---|---|---|
| `real-catalog.json` | 194 products | yes | DummyJSON (small demo/dev seed) |
| `catalog/catalog.json` | ~10,000 products | **no** (git-ignored; staged in GCS) | Kaggle Amazon dataset |
| `catalog/suggestions.json` | 10 queries | yes | Kaggle ESCI shopping queries |

Document shape (both catalogs):

```json
{ "id": "prod-<id>", "title": "...", "body": "...", "category": "...",
  "tags": ["..."], "price": 24.99, "imageUrl": "https://..." }
```

`price` and `imageUrl` are first-class: `price` is searchable-index filterable +
sortable (`internal/adapters/meilisearch.go`), and both round-trip into search
hits (the Go tenant path is loosely typed, so extra fields pass through). The
control-plane zod schema (`apps/control-plane/src/routes/organizations.ts`)
validates them.

---

## The ~10k Amazon catalog (Kaggle pipeline)

### 1. Download the raw data (needs a Kaggle API token)

Get an API token at kaggle.com → *Settings → API → Create New Token*. Use it as
a bearer token — **never commit or echo it**; keep it in an out-of-repo file:

```bash
# store the token once, privately
umask 077; printf '%s' 'KGAT_xxxxxxxx' > "$HOME/.config/kaggle-saas-token"

TOKEN=$(cat "$HOME/.config/kaggle-saas-token")
CA=/opt/uber/sase/zscaler_root_ca.pem            # corp proxy CA (omit --cacert off-corp)
RAW=/tmp/kaggle-scratch; mkdir -p "$RAW"; cd "$RAW"

# products (1.4M) + categories, from asaniczka/amazon-products-dataset-2023-1-4m-products
base="https://www.kaggle.com/api/v1/datasets/download/asaniczka/amazon-products-dataset-2023-1-4m-products"
curl -sSL --cacert "$CA" -H "Authorization: Bearer $TOKEN" "$base?file_name=amazon_products.csv"  -o products.zip
curl -sSL --cacert "$CA" -H "Authorization: Bearer $TOKEN" "$base?file_name=amazon_categories.csv" -o amazon_categories.csv
unzip -o products.zip                              # -> amazon_products.csv (~375 MB)
```

### 2. Preprocess → `catalog/catalog.json`

```bash
cd <repo-root>
node scripts/kaggle-preprocess.mjs        # RAW_DIR=/tmp/kaggle-scratch, TARGET_COUNT=10000
```

Dependency-free (Node 18+), streams the CSV. It keeps only rows with a usable
title, an http(s) image, a positive price + stars, and `boughtInLastMonth > 0`
(popularity signal), joins `category_id → category_name`, drops the
`Sexual Wellness Products` category (not brand-safe for the demo), then takes a
deterministic, category-diverse, popularity-weighted sample down to
`TARGET_COUNT`. Prints coverage stats + a 3-doc sample.

### 3. Suggestions → `catalog/suggestions.json`

10 real, content-filtered US shopping queries sampled from
`abhishekmungoli/amazon-query-product-search` (ESCI `examples` parquet). The
committed file is ready to use; to regenerate you need a parquet reader
(`pip install --user duckdb`) — the parquet has no CSV equivalent:

```bash
# download the examples parquet (~21 MB zip)
qbase="https://www.kaggle.com/api/v1/datasets/download/abhishekmungoli/amazon-query-product-search"
curl -sSL --cacert "$CA" -H "Authorization: Bearer $TOKEN" \
  "$qbase?file_name=shopping_queries_dataset_examples.parquet" -o q.zip && unzip -o q.zip

python3 - <<'PY'
import duckdb, json
f="shopping_queries_dataset_examples.parquet"
block=['sex','clit','porn','anal','dildo','vibrator','condom','erotic','lingerie','fetish','nude']
notlike=" and ".join(f"query not like '%{w}%'" for w in block)
rows=duckdb.sql(f"""
  select query, count(*) c from read_parquet('{f}')
  where product_locale='us' and length(query) between 12 and 26
    and regexp_matches(query, '^[a-z][a-z0-9]*( [a-z0-9]+){{1,3}}$') and {notlike}
  group by query having count(*)>=12 order by md5(query) limit 10
""").fetchall()
print(json.dumps([r[0] for r in rows], indent=2))
PY
```

### 4. Upload artifacts to the private GCS bucket

The bucket is provisioned by `infra/terraform/storage.tf` (private: uniform
access + public-access-prevention enforced). Upload with ADC (no gsutil needed):

```bash
BUCKET=$(terraform -chdir=infra/terraform output -raw catalog_bucket)
NODE_EXTRA_CA_CERTS=/opt/uber/sase/zscaler_root_ca.pem \
CATALOG_BUCKET="$BUCKET" node scripts/upload-to-gcs.mjs
# -> gs://<bucket>/catalog/catalog.json, gs://<bucket>/suggestions/suggestions.json
```

Application pods have **no** runtime GCS identity — the artifacts are read by an
operator/CI via ADC and seeded through the control-plane import API (below).

---

## Admin UI "Seed sample catalog" button

The Admin UI seeds from a committed 500-product slice of the real catalog,
`apps/web/lib/sample-catalog.ts` (bundled with the web app; ~260 KB, with real
prices + product images). The button imports it in ~200-doc chunks. Regenerate
it from the full catalog (the first 500 are the most-popular product in each
category, so the sample stays diverse):

```bash
node -e '
  const fs=require("fs");
  const sub=JSON.parse(fs.readFileSync("data/catalog/catalog.json","utf8")).slice(0,500);
  const head=`export type SampleProduct = { id: string; title: string; body?: string; category?: string; tags?: string[]; price?: number; imageUrl?: string };\nexport const SAMPLE_CATALOG: SampleProduct[] = `;
  fs.writeFileSync("apps/web/lib/sample-catalog.ts", head + JSON.stringify(sub) + ";\n");
  console.log("wrote", sub.length, "products");'
```

The e2e test `tests/e2e/platform-onboarding-and-search.spec.ts` searches for a
brand present in this sample (currently "Samsung") — keep an anchor term in sync
if you change the sample.

## Seeding a control-plane (on demand)

Use `scripts/import-catalog.mjs` (no dependencies, Node 18+). Pass an alternate
catalog file as the first positional argument:

```bash
# local k3d
E2E_API_URL=http://api.localtest.me:8088 \
IMPORT_EMAIL=store-demo@code.berlin IMPORT_PASSWORD='<password>' \
IMPORT_NAME='Store Demo' IMPORT_ORG_NAME='Nimbus Store' \
node scripts/import-catalog.mjs data/catalog/catalog.json

# production (after fetching catalog.json from GCS): set E2E_API_URL=https://api.criticalmars.me
```

It registers/logs in the user, creates the org if needed, and POSTs the catalog
in ~200-doc chunks. Default file (no argument) is `data/real-catalog.json`.

---

## `real-catalog.json` (small DummyJSON seed)

194 products from the public [DummyJSON](https://dummyjson.com) API. Regenerate:

```bash
curl -s --cacert /opt/uber/sase/zscaler_root_ca.pem "https://dummyjson.com/products?limit=0" \
  | node -e '
      const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8"));
      const out=d.products.map(p=>({ id:"prod-"+p.id, title:p.title, body:p.description,
        brand:p.brand||undefined, category:p.category, tags:Array.isArray(p.tags)?p.tags:[],
        price:typeof p.price==="number"?p.price:undefined, imageUrl:p.thumbnail||undefined }));
      fs.writeFileSync("data/real-catalog.json", JSON.stringify(out,null,2));
      console.log("wrote", out.length, "products");'
```
