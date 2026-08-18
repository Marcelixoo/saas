# Load generator

Synthetic multi-tenant load generator for the search SaaS platform, built with
[Locust](https://locust.io/). It talks **only** to the public Fastify
control-plane HTTP API described in `CONTRACT.md` section 3 -- it never
touches Go/Meilisearch/Postgres/Redis directly.

## What it does

1. `seed.py` registers/logs in an allow-listed user, creates 5 synthetic
   organizations (or reuses them if already created), sets their plans, and
   seeds their catalogs via `POST /organizations/:slug/documents/batch`.
2. `locustfile.py` reads the resulting `tenant_state.json` and runs
   tenant-scoped search traffic (and, in one scenario, indexing traffic)
   through `GET /organizations/:slug/search`.

| Tenant | Org name           | Plan | Full-scale docs |
|--------|--------------------|------|------------------|
| T1     | large-webshop      | PRO  | 10,000           |
| T2     | medium-webshop     | PRO  | 3,000            |
| T3     | recommendations    | FREE | 5,000            |
| T4     | merchandising      | FREE | 1,000            |
| T5     | analytics          | FREE | 2,000            |

Doc counts scale down together via `CATALOG_SCALE` (e.g. `0.02` for a quick
local run) while preserving the 10:3:5:1:2 ratio between tenants.

## Scenarios

Selected via the `SCENARIO` env var (default `baseline`):

- **`baseline`** -- all 5 tenants issue steady search traffic (uniform
  1-3s think time).
- **`noisy`** -- T1 (large-webshop, PRO) sustains high-rate traffic
  (0.05-0.2s think time) while T2-T5 stay stable.
- **`burst`** -- T3 (recommendations, FREE) alternates between a stable rate
  and a rapid-fire burst window on a duty cycle (`BURST_ON_SECONDS` /
  `BURST_OFF_SECONDS`, default 8s on / 17s off); everyone else stays stable.
- **`indexquery`** -- T2 (medium-webshop) continuously appends new documents
  via `POST /documents/batch` while all 5 tenants keep searching.

429s are **expected**, especially for FREE tenants -- that's the per-org
Redis quota (`CONTRACT.md` section 6) working correctly, not a bug. They are
counted separately per tenant (printed at the end of the run, and reflected
in `docs/load-test-results.md`) rather than treated as request failures.

## Configuration

| Env var           | Default                  | Meaning |
|--------------------|--------------------------|---------|
| `LOCUST_HOST`       | `http://localhost:8080`  | Control-plane base URL (also Locust's own `--host` default) |
| `E2E_EMAIL`         | `assessor+loadgen@e2e.test` | Allow-listed signup email (`ALLOWED_SIGNUP_EMAILS`) |
| `E2E_PASSWORD`      | *(required, no default)*  | Password for that user -- pick your own test-only value |
| `CATALOG_SCALE`     | `1.0`                     | Multiplier applied to each tenant's doc count |
| `SEED_BATCH_SIZE`   | `200`                     | Docs per `/documents/batch` call while seeding |
| `SCENARIO`          | `baseline`                | `baseline` \| `noisy` \| `burst` \| `indexquery` |
| `BURST_ON_SECONDS`  | `8`                       | Burst-scenario: seconds of rapid-fire per cycle |
| `BURST_OFF_SECONDS` | `17`                      | Burst-scenario: seconds of stable rate per cycle |
| `INDEX_TENANT_KEY`  | `T2`                      | Which tenant indexes in the `indexquery` scenario |
| `USE_SHAPE`         | unset                     | Set to `1` to opt into `StagedRampShape` (short warm-up, then a plateau at `LOCUST_USERS`/`LOCUST_SPAWN_RATE` for `SHAPE_TOTAL_SECONDS`) instead of plain `-u/-r/-t` flags |

## Running

### 1. Bring up a target

Point at any running control-plane, e.g. the local dev stack from the repo
root (`docker compose --profile full up -d --build`, control-plane on host
port 8080). Make sure its `ALLOWED_SIGNUP_EMAILS` allows your `E2E_EMAIL`
(the compose default `@e2e.test` already does).

### 2. Install dependencies

```bash
pip install -r load/requirements.txt
# or, if the default index is blocked:
pip install --index-url https://pypi.org/simple/ -r load/requirements.txt
```

### 3. Seed the 5 tenants

```bash
cd load
LOCUST_HOST=http://localhost:8080 \
E2E_EMAIL=assessor+loadgen@e2e.test \
E2E_PASSWORD='<pick-your-own-test-password>' \
CATALOG_SCALE=0.02 \
python3 seed.py
```

Re-running this is safe: organizations are looked up by name before
creation, and document IDs are deterministic, so re-seeding upserts instead
of piling up duplicates.

### 4. Run a scenario, headless

```bash
cd load
LOCUST_HOST=http://localhost:8080 SCENARIO=baseline \
  locust -f locustfile.py --headless -u 10 -r 2 -t 60s \
  --csv=results/baseline --html=results/baseline.html
```

Swap `SCENARIO=noisy|burst|indexquery` for the other required shapes. `-u`
(users), `-r` (spawn rate) and `-t` (run time) are plain Locust flags.

### 5. Run with the Locust web UI

```bash
cd load
LOCUST_HOST=http://localhost:8080 SCENARIO=burst locust -f locustfile.py
# then open http://localhost:8089
```

### Docker option

If a local Python/pip isn't available or is blocked, use the official
Locust image. Mount the `load/` directory (which must already contain
`tenant_state.json` from step 3, run separately with plain `python3`) and
point at a host reachable from inside the container:

```bash
docker run --rm -it \
  -v "$(pwd)/load:/mnt/locust" \
  -e SCENARIO=baseline \
  --network host \
  locustio/locust \
  -f /mnt/locust/locustfile.py --headless -u 10 -r 2 -t 60s \
  --host http://localhost:8080
```

(`--network host` is the simplest way for the container to reach a
control-plane bound to the host's `localhost`; on Docker Desktop for
Mac/Windows use `--host http://host.docker.internal:8080` instead, since
`--network host` isn't fully supported there.)

## What's recorded

Each run's Locust CSV/HTML export (`--csv`, `--html`) captures request
count, RPS, p50/p95 latency and failure rate per endpoint. 429 counts per
tenant are printed to stdout at the end of the run (see the `test_stop`
handler in `locustfile.py`) since they're intentionally excluded from the
"failure" count. See `docs/load-test-results.md` for a sample run's numbers.

## Files

- `tenants.py` -- tenant definitions + synthetic document/query generation.
- `seed.py` -- one-shot seeding script (API-only, idempotent).
- `locustfile.py` -- the Locust user classes / scenarios.
- `tenant_state.json` -- generated by `seed.py`; gitignored, not checked in
  (it embeds a live JWT for the seeded run).
