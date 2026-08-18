"""
Locust load generator for the multi-tenant search SaaS platform.

Talks ONLY to the public Fastify control-plane HTTP API (CONTRACT.md
section 3) -- never to Go/Meilisearch/Postgres/Redis directly. All tenant
identity comes from the JWT + org slug issued by that API; no client ever
sets X-Tenant-ID itself (Fastify ignores/overwrites it anyway per the trust
boundary in CONTRACT.md section 2).

Prerequisite: run `python3 load/seed.py` once against the target host to
create/seed the 5 synthetic tenants and write load/tenant_state.json. This
file loads that state at import time.

Scenario selection (env var SCENARIO, default "baseline"):
  baseline    - all 5 tenants issue steady search traffic.
  noisy       - T1 (large-webshop) sustains high-rate traffic; T2-T5 stable.
  burst       - T3 (recommendations) periodically spikes its request rate;
                everyone else stable.
  indexquery  - T2 (medium-webshop) indexes new documents continuously while
                all 5 tenants keep searching.

Run examples are in load/README.md.
"""
import json
import os
import random
import time
from pathlib import Path

import gevent
from locust import HttpUser, LoadTestShape, between, events, task

from tenants import tenant_by_key, build_document, sample_query_terms

STATE_PATH = Path(__file__).parent / "tenant_state.json"
SCENARIO = os.environ.get("SCENARIO", "baseline").lower()
INDEX_TENANT_KEY = os.environ.get("INDEX_TENANT_KEY", "T2")
BURST_TENANT_KEY = os.environ.get("BURST_TENANT_KEY", "T3")
NOISY_TENANT_KEY = os.environ.get("NOISY_TENANT_KEY", "T1")

BURST_ON_SECONDS = float(os.environ.get("BURST_ON_SECONDS", "8"))
BURST_OFF_SECONDS = float(os.environ.get("BURST_OFF_SECONDS", "17"))

if not STATE_PATH.exists():
    raise RuntimeError(
        f"{STATE_PATH} not found. Run `python3 load/seed.py` against your "
        "target host first (see load/README.md)."
    )

_STATE = json.loads(STATE_PATH.read_text())
TENANT_STATE = _STATE["tenants"]

# Shared, process-local flag flipped on/off by a background greenlet so the
# "burst" tenant's wait_time collapses periodically without needing a custom
# LoadTestShape (which controls *global* user count, not one tenant's rate).
_burst_active = {"on": False}


def _burst_duty_cycle():
    while True:
        gevent.sleep(BURST_OFF_SECONDS)
        _burst_active["on"] = True
        gevent.sleep(BURST_ON_SECONDS)
        _burst_active["on"] = False


# 429s are EXPECTED (mostly on FREE tenants) -- they mean the per-org quota
# in Redis is doing its job, not that the platform is broken. We still mark
# them as successful samples (see catch_response blocks below) so Locust's
# failure-rate/percentiles reflect real errors only, but we tally them here
# per tenant so the results table can report them explicitly.
RATE_LIMIT_COUNTS = {key: 0 for key in TENANT_STATE}


@events.test_start.add_listener
def _on_test_start(environment, **kwargs):
    print(f"[locust] scenario={SCENARIO} host={environment.host}")
    for key, t in TENANT_STATE.items():
        print(f"[locust]   {key} ({t['name']}, {t['plan']}): slug={t['slug']} docs={t['doc_count']}")
    if SCENARIO == "burst":
        gevent.spawn(_burst_duty_cycle)


@events.test_stop.add_listener
def _on_test_stop(environment, **kwargs):
    print("[locust] 429 (quota exhausted) counts per tenant:")
    for key, count in RATE_LIMIT_COUNTS.items():
        plan = TENANT_STATE[key]["plan"]
        print(f"[locust]   {key} ({plan}): {count}")


def auth_headers():
    return {"Authorization": f"Bearer {_STATE['auth_token']}"}


def make_search_user(tenant_key: str, wait_fn):
    """Build an HttpUser subclass that searches one tenant's catalog."""
    tenant = tenant_by_key(tenant_key)
    state = TENANT_STATE[tenant_key]
    terms = sample_query_terms(tenant)

    class _TenantSearchUser(HttpUser):
        wait_time = wait_fn
        weight = 1

        @task
        def search(self):
            q = random.choice(terms)
            with self.client.get(
                f"/organizations/{state['slug']}/search",
                params={"q": q},
                headers=auth_headers(),
                name=f"/organizations/:slug/search [{tenant_key}]",
                catch_response=True,
            ) as resp:
                if resp.status_code == 429:
                    # Expected once quota is exhausted -- the rate limiter
                    # working as designed, not a failure. Mark the sample
                    # successful so Locust's failure rate reflects real
                    # errors only; tally it separately for the report.
                    RATE_LIMIT_COUNTS[tenant_key] += 1
                    resp.success()
                elif not resp.ok:
                    resp.failure(f"unexpected status {resp.status_code}: {resp.text[:200]}")
                else:
                    resp.success()

    _TenantSearchUser.__name__ = f"Search_{tenant_key}"
    return _TenantSearchUser


def stable_wait():
    return between(1.0, 3.0)


def noisy_wait():
    return between(0.05, 0.2)


def bursty_wait():
    def _wait(self):
        return random.uniform(0.02, 0.1) if _burst_active["on"] else random.uniform(1.0, 3.0)

    return _wait


def wait_for(tenant_key: str):
    if SCENARIO == "noisy" and tenant_key == NOISY_TENANT_KEY:
        return noisy_wait()
    if SCENARIO == "burst" and tenant_key == BURST_TENANT_KEY:
        return bursty_wait()
    return stable_wait()


# One HttpUser class per tenant, always present so every scenario keeps all
# 5 tenants searching (per-scenario differences live in wait_for()/tasks).
for _key in TENANT_STATE:
    globals()[f"Search_{_key}"] = make_search_user(_key, wait_for(_key))


if SCENARIO == "indexquery":
    _index_tenant = tenant_by_key(INDEX_TENANT_KEY)
    _index_state = TENANT_STATE[INDEX_TENANT_KEY]
    _index_cursor = {"next": _index_state["doc_count"]}

    class IndexingUser(HttpUser):
        """Continuously appends new documents to one org while everyone
        else (including that org's own Search_<key> user) keeps searching."""

        wait_time = between(2.0, 5.0)
        weight = 1

        @task
        def index_batch(self):
            start = _index_cursor["next"]
            batch = [build_document(_index_tenant, i) for i in range(start, start + 20)]
            _index_cursor["next"] = start + 20
            with self.client.post(
                f"/organizations/{_index_state['slug']}/documents/batch",
                json={"documents": batch},
                headers=auth_headers(),
                name=f"/organizations/:slug/documents/batch [{INDEX_TENANT_KEY}]",
                catch_response=True,
            ) as resp:
                if resp.status_code == 429:
                    RATE_LIMIT_COUNTS[INDEX_TENANT_KEY] += 1
                    resp.success()
                elif not resp.ok:
                    resp.failure(f"unexpected status {resp.status_code}: {resp.text[:200]}")
                else:
                    resp.success()


class StagedRampShape(LoadTestShape):
    """Optional ramp: a short warm-up at low concurrency, then a steady
    plateau at the target user count for the remainder of the run. Opt in
    with USE_SHAPE=1; otherwise Locust uses the -u/-r/-t CLI flags directly.

    Kept simple on purpose -- per-tenant burst/noisy behavior above is what
    drives the required traffic *shapes*; this just avoids a cold thundering
    herd of first requests hitting the target at t=0.
    """

    warmup_seconds = float(os.environ.get("SHAPE_WARMUP_SECONDS", "15"))
    warmup_users = int(os.environ.get("SHAPE_WARMUP_USERS", "2"))
    target_users = int(os.environ.get("LOCUST_USERS", "10"))
    spawn_rate = float(os.environ.get("LOCUST_SPAWN_RATE", "2"))
    total_seconds = float(os.environ.get("SHAPE_TOTAL_SECONDS", "60"))

    def tick(self):
        run_time = self.get_run_time()
        if run_time > self.total_seconds:
            return None
        if run_time < self.warmup_seconds:
            return (self.warmup_users, self.spawn_rate)
        return (self.target_users, self.spawn_rate)


if os.environ.get("USE_SHAPE") != "1":
    # Locust only activates a LoadTestShape subclass if one is defined in the
    # locustfile; deleting it here lets plain -u/-r/-t flags drive the run.
    del StagedRampShape
