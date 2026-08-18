# `/docs`

Documentation for the multi-tenant search SaaS platform.

## Current submission

- **[`SUBMISSION_RUNBOOK.md`](SUBMISSION_RUNBOOK.md)** — start here.
  Bring-up steps for Docker Compose and local Kubernetes (k3d), CI/CD, the
  Playwright acceptance suite, the load generator, test commands, assessor
  account setup, a security-control summary, known limitations, and a
  five-minute demo script.
- **[`load-test-results.md`](load-test-results.md)** — a sample load-test
  validation run's numbers (not a performance benchmark or capacity claim;
  see `../load/README.md` to run your own).

See also, at the repo root: [`../README.md`](../README.md) (overview),
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) (components, trust boundary, data
model), [`../CONTRACT.md`](../CONTRACT.md) (frozen cross-component contract),
and [`../infra/README.md`](../infra/README.md) (Kubernetes runtime details).

## Legacy (pre-multi-tenant) — retained for history

The following describe an earlier, single-service iteration of this project
(a standalone Go "Fashion Catalog API" on Cloud Run, before the control
plane, tenancy, and Kubernetes runtime existed). They are **not** an
accurate description of the current submission — use `ARCHITECTURE.md` and
`CONTRACT.md` instead:

- `ARCHITECTURE_DIAGRAMS.md`
- `SWAGGER_UI_GUIDE.md`
- `swagger.yaml`, `specs/swagger.json`
- `src/setup-ci.md`
