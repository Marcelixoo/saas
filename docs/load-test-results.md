# Load test results (sample validation run)

This is a snapshot from a short local validation run of the `load/`
generator against a full local stack (control-plane + Go search-api +
Meilisearch + Postgres + Redis), brought up on 2026-08-17. It exists to
demonstrate the generator produces the required metrics, not as a
performance benchmark or capacity claim -- see `load/README.md` for how to
run your own.

## Environment

- Target: local stack, control-plane on `http://localhost:8080`
  (control-plane and Go search-api run as host processes; Postgres, Redis,
  Meilisearch via `docker compose`, since this sandbox's container network
  could not complete a Go module / npm registry fetch during `docker build`
  for `search-api`/`control-plane` -- see "Known blocker" below. All traffic
  still went exclusively through the public Fastify HTTP contract).
- Rate limits: defaults from `CONTRACT.md` section 6 (`FREE=30/min`,
  `PRO=300/min`).
- `CATALOG_SCALE=0.02` (i.e. 2% of full-scale doc counts, ratio preserved):

  | Tenant | Org               | Plan | Docs seeded |
  |--------|-------------------|------|-------------|
  | T1     | large-webshop     | PRO  | 200         |
  | T2     | medium-webshop    | PRO  | 60          |
  | T3     | recommendations   | FREE | 100         |
  | T4     | merchandising     | FREE | 20          |
  | T5     | analytics         | FREE | 40          |

- Each scenario run: 30-40s headless, 10-15 users, spawn rate 2-5/s.

## Results

| Scenario     | Requests | RPS   | p50 (ms) | p95 (ms) | Error rate | 429s (by tenant)                          |
|--------------|---------:|------:|---------:|---------:|-----------:|--------------------------------------------|
| `baseline`   | 148      | 5.15  | 13       | 16       | 0.00%      | T1:0 T2:0 T3:1 T4:0 T5:0                   |
| `noisy`      | 805      | 27.72 | 9        | 15       | 0.00%      | T1:122 T2:0 T3:15 T4:15 T5:16              |
| `burst`      | 543      | 13.88 | 8        | 15       | 0.00%      | T1:49 T2:0 T3:329 T4:29 T5:27              |
| `indexquery` | 168      | 5.80  | 10       | 18       | 0.00%      | T1:0 T2:0 T3:21 T4:6 T5:7                  |

Notes:

- **Error rate** counts only unexpected (non-429) HTTP failures; there were
  none in any run. `429 Too Many Requests` is treated as an expected,
  successful sample (the quota system working as designed per
  `CONTRACT.md` section 6), and tallied separately per tenant in the table
  above instead.
- **`baseline`**: all 5 tenants at a steady ~1 req/s each; only a single
  stray 429 (T3, FREE) as its rate briefly exceeded 30/min at ramp-up.
- **`noisy`**: T1 (large-webshop, PRO) drove 651/805 (81%) of all requests
  at a sustained high rate, enough to exceed even its 300/min PRO quota
  (122 429s) while T2-T5 (each ~43-45 requests) stayed comfortably under
  their own limits, with light 429s on the FREE tenants from background
  contention.
- **`burst`**: T3 (recommendations, FREE) produced 351/543 (65%) of all
  requests via periodic rapid-fire windows (8s on / 17s off duty cycle),
  driving heavy 429s on its own FREE quota (329) once a burst window
  started, while T1/T2/T4/T5 stayed flat.
- **`indexquery`**: T2 (medium-webshop) continuously appended 20-document
  batches via `POST /organizations/:slug/documents/batch` (19 index calls)
  while all 5 tenants kept searching concurrently, with no errors or
  slowdown attributable to concurrent indexing.

Raw Locust CSV exports for each run (`*_stats.csv`, `*_stats_history.csv`)
were produced with `--csv=<scenario>` per the invocations in
`load/README.md`.

## Known blocker: `docker compose --profile full up --build`

This sandbox's Docker daemon could reach public registries for plain image
`pull`s (e.g. `getmeili/meilisearch`, `postgres`, `redis`, `locustio/locust`
all pulled fine), but outbound HTTPS *from inside a build container*
(`go mod download` inside the `search-api` build, `npm ci` inside the
`control-plane`/`web` builds) failed TLS verification
(`x509: certificate signed by unknown authority`) against
`proxy.golang.org` / npm registries -- consistent with a MITM proxy at the
container-build network layer whose CA isn't trusted by the base images.
This is an environment/network restriction, not an application bug, and is
outside this agent's lane (`docker-compose.yml`, `Dockerfile`s, Go/Node code
are owned by other agents).

To still validate the load generator end-to-end without touching any
out-of-lane files, this run used `docker compose` only for the
already-published images (`postgres`, `redis`, `meilisearch`, with
Meilisearch's host port remapped via an ad hoc, uncommitted compose
override to avoid colliding with another concurrently-running agent's stack
on port 7700), and ran `search-api` (`go build` + the resulting binary) and
`control-plane` (`npm install`/`tsc`/`prisma migrate deploy` + `node
dist/server.js`) directly as host processes -- both build fully offline
once dependencies are fetched over plain host networking (which, unlike the
container build network, could reach `proxy.golang.org` and
`registry.npmjs.org`). All Locust traffic still went exclusively through
the public Fastify HTTP contract on `http://localhost:8080`, so this
validates the load generator itself rather than a full containerized
deployment.
