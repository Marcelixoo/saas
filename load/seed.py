#!/usr/bin/env python3
"""
Seed the five synthetic tenants used by the load generator, exclusively
through the public Fastify control-plane HTTP API (CONTRACT.md section 3).

This script never talks to Go/Meilisearch/Postgres/Redis directly. It:
  1. Registers (or logs in, if already registered) an allow-listed user.
  2. Creates (or reuses) one organization per tenant.
  3. Sets each organization's plan via PATCH /organizations/:slug/plan.
  4. Seeds each organization's catalog via POST /documents/batch, in chunks.
  5. Writes load/tenant_state.json with each tenant's slug + org id, so that
     locustfile.py can pick up where seeding left off without re-deriving
     auth/org state itself.

Re-running this script is safe: organizations are looked up by name before
creation, and document IDs are deterministic, so batches upsert rather than
duplicate.

Usage:
    LOCUST_HOST=http://localhost:8080 \
    E2E_EMAIL=assessor+loadgen@e2e.test \
    E2E_PASSWORD='LoadGen123!' \
    CATALOG_SCALE=0.05 \
    python3 load/seed.py
"""
import json
import os
import sys
import time
from pathlib import Path

import requests

from tenants import TENANTS, build_document

API_URL = os.environ.get("LOCUST_HOST", os.environ.get("E2E_API_URL", "http://localhost:8080")).rstrip("/")
EMAIL = os.environ.get("E2E_EMAIL", "assessor+loadgen@e2e.test")
PASSWORD = os.environ.get("E2E_PASSWORD", "LoadGen123!")
NAME = os.environ.get("E2E_NAME", "Load Generator")
CATALOG_SCALE = float(os.environ.get("CATALOG_SCALE", "1.0"))
SEED_BATCH_SIZE = int(os.environ.get("SEED_BATCH_SIZE", "200"))
STATE_PATH = Path(__file__).parent / "tenant_state.json"

session = requests.Session()


def _raise_for_status(resp, context):
    if not resp.ok:
        raise RuntimeError(
            f"{context} failed: {resp.status_code} {resp.text[:500]}"
        )


def register_or_login() -> str:
    resp = session.post(
        f"{API_URL}/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "name": NAME},
        timeout=10,
    )
    if resp.status_code == 201:
        print(f"[seed] registered new user {EMAIL}")
        return resp.json()["token"]

    # Already registered (or any other non-fatal register failure) -> login.
    resp = session.post(
        f"{API_URL}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=10,
    )
    _raise_for_status(resp, "login")
    print(f"[seed] logged in as existing user {EMAIL}")
    return resp.json()["token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_or_create_org(token: str, name: str) -> dict:
    resp = session.get(f"{API_URL}/organizations", headers=auth_headers(token), timeout=10)
    _raise_for_status(resp, "GET /organizations")
    for org in resp.json():
        if org["name"] == name:
            print(f"[seed] reusing existing org '{name}' ({org['slug']})")
            return org

    resp = session.post(
        f"{API_URL}/organizations",
        json={"name": name},
        headers=auth_headers(token),
        timeout=10,
    )
    _raise_for_status(resp, f"POST /organizations ({name})")
    org = resp.json()
    print(f"[seed] created org '{name}' ({org['slug']})")
    return org


def set_plan(token: str, slug: str, plan: str) -> None:
    resp = session.patch(
        f"{API_URL}/organizations/{slug}/plan",
        json={"plan": plan},
        headers=auth_headers(token),
        timeout=10,
    )
    _raise_for_status(resp, f"PATCH /organizations/{slug}/plan")
    print(f"[seed] {slug} plan -> {plan}")


def seed_catalog(token: str, slug: str, tenant: dict, count: int) -> int:
    accepted_total = 0
    for start in range(0, count, SEED_BATCH_SIZE):
        chunk = [
            build_document(tenant, i)
            for i in range(start, min(start + SEED_BATCH_SIZE, count))
        ]
        resp = session.post(
            f"{API_URL}/organizations/{slug}/documents/batch",
            json={"documents": chunk},
            headers=auth_headers(token),
            timeout=30,
        )
        _raise_for_status(resp, f"POST /organizations/{slug}/documents/batch")
        accepted_total += resp.json().get("accepted", len(chunk))
        print(f"[seed]   {slug}: indexed {min(start + SEED_BATCH_SIZE, count)}/{count}")
    return accepted_total


def main():
    print(f"[seed] target API: {API_URL}")
    print(f"[seed] catalog scale factor: {CATALOG_SCALE}")

    token = register_or_login()
    state = {"api_url": API_URL, "seeded_at": time.time(), "tenants": {}}

    for tenant in TENANTS:
        org = get_or_create_org(token, tenant["name"])
        set_plan(token, org["slug"], tenant["plan"])

        scaled_count = max(1, int(tenant["docs"] * CATALOG_SCALE))
        accepted = seed_catalog(token, org["slug"], tenant, scaled_count)

        state["tenants"][tenant["key"]] = {
            "name": tenant["name"],
            "slug": org["slug"],
            "org_id": org["id"],
            "plan": tenant["plan"],
            "doc_count": scaled_count,
            "documents_accepted": accepted,
        }

    state["auth_token"] = token
    STATE_PATH.write_text(json.dumps(state, indent=2))
    print(f"[seed] wrote {STATE_PATH}")
    print("[seed] done.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - top-level CLI entry point
        print(f"[seed] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
