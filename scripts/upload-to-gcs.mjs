#!/usr/bin/env node
// Upload the preprocessed catalog + suggestion artifacts to the private GCS
// bucket provisioned by infra/terraform/storage.tf.
//
// Dependency-free (Node 18+). Authenticates with Application Default
// Credentials (the gcloud user ADC file, type "authorized_user"): it mints a
// short-lived access token from the refresh token and talks to the GCS JSON
// API directly — no gcloud/gsutil binary required.
//
// Behind a TLS-intercepting corporate proxy, run with the corp root CA:
//   NODE_EXTRA_CA_CERTS=/opt/uber/sase/zscaler_root_ca.pem \
//   CATALOG_BUCKET=<bucket> node scripts/upload-to-gcs.mjs
//
// Env:
//   CATALOG_BUCKET   (required) target bucket name (terraform output: catalog_bucket)
//   ADC_PATH         ADC file (default: $GOOGLE_APPLICATION_CREDENTIALS or
//                    ~/.config/gcloud/application_default_credentials.json)
//   CATALOG_FILE     local catalog json  (default: data/catalog/catalog.json)
//   SUGGESTIONS_FILE local suggestions   (default: data/catalog/suggestions.json)
//   CATALOG_OBJECT / SUGGESTIONS_OBJECT  destination object names
//                    (defaults: catalog/catalog.json, suggestions/suggestions.json)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUCKET = process.env.CATALOG_BUCKET;
if (!BUCKET) {
  console.error('Missing required env var: CATALOG_BUCKET (terraform output: catalog_bucket)');
  process.exit(1);
}
const ADC_PATH =
  process.env.ADC_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');

const uploads = [
  {
    file: process.env.CATALOG_FILE || path.resolve(process.cwd(), 'data', 'catalog', 'catalog.json'),
    object: process.env.CATALOG_OBJECT || 'catalog/catalog.json',
  },
  {
    file: process.env.SUGGESTIONS_FILE || path.resolve(process.cwd(), 'data', 'catalog', 'suggestions.json'),
    object: process.env.SUGGESTIONS_OBJECT || 'suggestions/suggestions.json',
  },
];

async function getAccessToken() {
  if (!fs.existsSync(ADC_PATH)) {
    throw new Error(`ADC file not found at ${ADC_PATH}. Run: gcloud auth application-default login`);
  }
  const adc = JSON.parse(fs.readFileSync(ADC_PATH, 'utf8'));
  if (adc.type && adc.type !== 'authorized_user') {
    throw new Error(
      `ADC type "${adc.type}" is not supported by this script (expected "authorized_user"). ` +
        'Use a user ADC from `gcloud auth application-default login`.',
    );
  }
  const params = new URLSearchParams({
    client_id: adc.client_id,
    client_secret: adc.client_secret,
    refresh_token: adc.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Failed to mint access token (${res.status}): ${await res.text()}`);
  }
  const { access_token } = await res.json();
  if (!access_token) throw new Error('Token endpoint returned no access_token');
  return access_token;
}

async function uploadOne(token, { file, object }) {
  if (!fs.existsSync(file)) throw new Error(`Local file not found: ${file}`);
  const data = fs.readFileSync(file);
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(BUCKET)}/o` +
    `?uploadType=media&name=${encodeURIComponent(object)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: data,
  });
  if (!res.ok) {
    throw new Error(`Upload of ${object} failed (${res.status}): ${await res.text()}`);
  }
  const meta = await res.json();
  console.log(`  uploaded gs://${BUCKET}/${object}  (${(data.length / 1e6).toFixed(2)} MB, gen ${meta.generation})`);
}

async function listObjects(token) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(BUCKET)}/o`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`List failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return body.items || [];
}

async function main() {
  console.log(`Authenticating via ADC (${ADC_PATH})…`);
  const token = await getAccessToken();
  console.log(`Uploading ${uploads.length} artifact(s) to gs://${BUCKET}/ …`);
  for (const u of uploads) await uploadOne(token, u);

  console.log('\nVerifying bucket contents:');
  const items = await listObjects(token);
  for (const it of items) {
    console.log(`  - ${it.name}  (${(Number(it.size) / 1e6).toFixed(2)} MB)`);
  }
  console.log('\nDone. Bucket is private (uniform access + public-access-prevention enforced).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
