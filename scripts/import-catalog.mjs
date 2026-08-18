#!/usr/bin/env node
// Reusable, dependency-free importer for bulk-loading a product catalog into
// a control-plane organization's search index.
//
// Usage:
//   E2E_API_URL=http://api.localtest.me:8088 \
//   IMPORT_EMAIL=store-demo@code.berlin \
//   IMPORT_PASSWORD='supersecret123' \
//   IMPORT_NAME='Store Demo' \
//   IMPORT_ORG_NAME='Nimbus Store' \
//   node scripts/import-catalog.mjs [path/to/catalog.json]
//
// Behavior:
//   1. Registers the demo user (IMPORT_EMAIL/IMPORT_PASSWORD/IMPORT_NAME) if
//      not already registered, then logs in either way.
//   2. Creates the organization (IMPORT_ORG_NAME) if it doesn't already
//      exist for that user, reusing an existing one with the same name.
//   3. Reads the catalog file (default: data/real-catalog.json, relative to
//      the repo root) and POSTs it in chunks of ~200 documents to
//      /organizations/{slug}/documents/batch.
//
// No third-party dependencies; uses the global fetch available in Node 18+.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_URL = process.env.E2E_API_URL || 'http://api.localtest.me:8088';
const EMAIL = process.env.IMPORT_EMAIL;
const PASSWORD = process.env.IMPORT_PASSWORD;
const NAME = process.env.IMPORT_NAME || 'Catalog Importer';
const ORG_NAME = process.env.IMPORT_ORG_NAME;
const CHUNK_SIZE = Number(process.env.IMPORT_CHUNK_SIZE || 200);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, '..', 'data', 'real-catalog.json');

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 500)}`);
  }
}

async function registerOrLogin() {
  const registerRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
  });

  if (registerRes.status === 201) {
    const body = await json(registerRes);
    console.log(`Registered new user ${EMAIL}`);
    return body.token;
  }

  // 409 = already registered, or 400 duplicate; fall back to login either way.
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (loginRes.status !== 200) {
    const body = await json(loginRes).catch(() => ({}));
    throw new Error(`Failed to register or log in ${EMAIL}: ${loginRes.status} ${JSON.stringify(body)}`);
  }
  const body = await json(loginRes);
  console.log(`Logged in as existing user ${EMAIL}`);
  return body.token;
}

async function findOrCreateOrg(token) {
  const listRes = await fetch(`${API_URL}/organizations`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (listRes.status !== 200) {
    throw new Error(`Failed to list organizations: ${listRes.status}`);
  }
  const orgs = await json(listRes);
  const existing = orgs.find((o) => o.name === ORG_NAME);
  if (existing) {
    console.log(`Reusing existing organization "${ORG_NAME}" (slug=${existing.slug})`);
    return existing;
  }

  const createRes = await fetch(`${API_URL}/organizations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: ORG_NAME }),
  });
  if (createRes.status !== 201) {
    const body = await json(createRes).catch(() => ({}));
    throw new Error(`Failed to create organization "${ORG_NAME}": ${createRes.status} ${JSON.stringify(body)}`);
  }
  const org = await json(createRes);
  console.log(`Created organization "${ORG_NAME}" (slug=${org.slug})`);
  return org;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function importCatalog(token, slug, documents) {
  const batches = chunk(documents, CHUNK_SIZE);
  let accepted = 0;
  for (const [i, batch] of batches.entries()) {
    const res = await fetch(`${API_URL}/organizations/${slug}/documents/batch`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ documents: batch }),
    });
    if (res.status !== 202) {
      const body = await json(res).catch(() => ({}));
      throw new Error(`Batch ${i + 1}/${batches.length} failed: ${res.status} ${JSON.stringify(body)}`);
    }
    const body = await json(res);
    accepted += body.accepted;
    console.log(`Batch ${i + 1}/${batches.length}: accepted ${body.accepted} documents`);
  }
  return accepted;
}

async function main() {
  requireEnv('IMPORT_EMAIL', EMAIL);
  requireEnv('IMPORT_PASSWORD', PASSWORD);
  requireEnv('IMPORT_ORG_NAME', ORG_NAME);

  const documents = JSON.parse(readFileSync(catalogPath, 'utf8'));
  console.log(`Loaded ${documents.length} documents from ${catalogPath}`);

  const token = await registerOrLogin();
  const org = await findOrCreateOrg(token);
  const accepted = await importCatalog(token, org.slug, documents);

  console.log(`\nDone. Imported ${accepted}/${documents.length} documents into "${ORG_NAME}" (slug=${org.slug}).`);
  console.log(`Try searching: GET ${API_URL}/organizations/${org.slug}/search?q=<term>`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
