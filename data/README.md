# Real catalog data

`real-catalog.json` is a real (non-synthetic) e-commerce product catalog,
transformed into the shape expected by
`POST /organizations/{slug}/documents/batch`:

```json
{ "id": "prod-<id>", "title": "...", "body": "...", "brand": "...", "category": "...", "tags": ["...", "..."] }
```

## Source

Fetched from the public, license-free [DummyJSON](https://dummyjson.com) API:

```
curl --cacert /opt/uber/sase/zscaler_root_ca.pem "https://dummyjson.com/products?limit=0"
```

This returned 194 products with realistic titles, descriptions, brands,
categories, and tags across categories like beauty, fragrances, furniture,
groceries, and electronics. Each DummyJSON `description` was mapped to our
`body` field, and `tags` were carried through unchanged — both fields are
new in this PR (previously only `id`, `title`, `brand`, `category` made it
through the batch-index path).

## Regenerating

```bash
curl -s --cacert /opt/uber/sase/zscaler_root_ca.pem "https://dummyjson.com/products?limit=0" \
  | node -e '
      const fs = require("fs");
      const d = JSON.parse(fs.readFileSync(0, "utf8"));
      const out = d.products.map(p => ({
        id: "prod-" + p.id,
        title: p.title,
        body: p.description,
        brand: p.brand || undefined,
        category: p.category,
        tags: Array.isArray(p.tags) ? p.tags : [],
      }));
      fs.writeFileSync("data/real-catalog.json", JSON.stringify(out, null, 2));
      console.log("wrote", out.length, "products");
    '
```

## Importing into a live control-plane

Use `scripts/import-catalog.mjs` (no dependencies, Node 18+):

```bash
E2E_API_URL=http://api.localtest.me:8088 \
IMPORT_EMAIL=store-demo@code.berlin \
IMPORT_PASSWORD='<password>' \
IMPORT_NAME='Store Demo' \
IMPORT_ORG_NAME='Nimbus Store' \
node scripts/import-catalog.mjs
```

It registers (or logs in) the given user, creates the organization if it
doesn't already exist, and POSTs the catalog in chunks of ~200 documents to
`/organizations/{slug}/documents/batch`. Pass an alternate catalog file as
the first positional argument to import something other than
`data/real-catalog.json`.
