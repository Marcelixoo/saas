#!/usr/bin/env node
// Preprocess the Kaggle "Amazon Products 2023 (1.4M)" dataset into the
// batch-index document shape consumed by
// POST /organizations/{slug}/documents/batch, downsized to a manageable,
// high-quality sample.
//
// This script is dependency-free (Node 18+) and streams the ~375 MB products
// CSV so it never loads the whole file into memory. It does NOT download the
// data or touch any credentials — point it at already-downloaded raw files
// (see data/README.md for the `curl` download recipe using KAGGLE_API_TOKEN).
//
// Input (env, with defaults):
//   RAW_DIR         directory holding the raw CSVs        (default: /tmp/kaggle-scratch)
//   PRODUCTS_CSV    path to amazon_products.csv           (default: $RAW_DIR/amazon_products.csv)
//   CATEGORIES_CSV  path to amazon_categories.csv         (default: $RAW_DIR/amazon_categories.csv)
//   TARGET_COUNT    number of products to keep            (default: 10000)
//   PER_CATEGORY    max candidates retained per category  (default: 120)
//   OUT_FILE        output catalog path                   (default: data/catalog/catalog.json)
//
// Output: OUT_FILE — a JSON array of documents:
//   { id, title, body, category, tags[], price, imageUrl }
//
// Selection: keep only rows with a usable title, an http(s) image URL, a
// positive price, positive stars, and boughtInLastMonth > 0 (a real
// popularity signal). Within each category retain the top PER_CATEGORY by
// (boughtInLastMonth, stars, reviews, asin), then round-robin across
// categories (sorted by name) taking the best remaining item until
// TARGET_COUNT is reached. This yields a deterministic, category-diverse,
// popularity-weighted catalog.

import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const RAW_DIR = process.env.RAW_DIR || '/tmp/kaggle-scratch';
const PRODUCTS_CSV = process.env.PRODUCTS_CSV || path.join(RAW_DIR, 'amazon_products.csv');
const CATEGORIES_CSV = process.env.CATEGORIES_CSV || path.join(RAW_DIR, 'amazon_categories.csv');
const TARGET_COUNT = Number(process.env.TARGET_COUNT || 10000);
const PER_CATEGORY = Number(process.env.PER_CATEGORY || 120);
const OUT_FILE = process.env.OUT_FILE || path.resolve(process.cwd(), 'data', 'catalog', 'catalog.json');

const MAX_TITLE = 160;

// Categories excluded from the demo catalog (not brand-safe for a generic
// storefront demo). Matched case-insensitively against the category name.
const EXCLUDED_CATEGORIES = new Set(['sexual wellness products']);

/**
 * Streaming RFC-4180 CSV parser. Calls onRow(fields[]) for each record,
 * correctly handling quoted fields containing commas, embedded newlines,
 * and escaped ("") quotes. Returns a promise that resolves when done.
 */
function parseCsv(filePath, onRow) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
    let field = '';
    let row = [];
    let inQuotes = false;
    let prevQuoteInQuotes = false; // saw a '"' while inQuotes (pending: escape or close)

    const endField = () => {
      row.push(field);
      field = '';
    };
    const endRow = () => {
      endField();
      // Skip fully-empty trailing lines
      if (!(row.length === 1 && row[0] === '')) onRow(row);
      row = [];
    };

    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (inQuotes) {
          if (prevQuoteInQuotes) {
            prevQuoteInQuotes = false;
            if (c === '"') {
              field += '"'; // escaped quote
              continue;
            }
            inQuotes = false; // the previous " closed the quoted section; reprocess c below
          } else if (c === '"') {
            prevQuoteInQuotes = true;
            continue;
          } else {
            field += c;
            continue;
          }
        }
        // not in quotes (or just left quotes and reprocessing c)
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          endField();
        } else if (c === '\n') {
          endRow();
        } else if (c === '\r') {
          // ignore; \n will end the row
        } else {
          field += c;
        }
      }
    });
    stream.on('end', () => {
      if (field !== '' || row.length > 0) endRow();
      resolve();
    });
    stream.on('error', reject);
  });
}

async function loadCategories() {
  const map = new Map();
  let header = true;
  await parseCsv(CATEGORIES_CSV, (r) => {
    if (header) {
      header = false;
      return;
    }
    // id,category_name
    if (r.length >= 2) map.set(r[0].trim(), r[1].trim());
  });
  return map;
}

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\/\S+$/.test(s);
}

function cleanTitle(t) {
  const s = (t || '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_TITLE ? s.slice(0, MAX_TITLE - 1).trimEnd() + '…' : s;
}

// Ranking comparator: more popular / better rated first, asin as a stable tiebreak.
function better(a, b) {
  if (b.bought !== a.bought) return b.bought - a.bought;
  if (b.stars !== a.stars) return b.stars - a.stars;
  if (b.reviews !== a.reviews) return b.reviews - a.reviews;
  return a.asin < b.asin ? -1 : a.asin > b.asin ? 1 : 0;
}

async function main() {
  for (const f of [PRODUCTS_CSV, CATEGORIES_CSV]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing input file: ${f}\nSee data/README.md for how to download the raw Kaggle files.`);
      process.exit(1);
    }
  }

  const categories = await loadCategories();
  console.log(`Loaded ${categories.size} categories.`);

  // Resolve excluded category ids from names up front.
  const excludedCatIds = new Set();
  for (const [id, name] of categories) {
    if (EXCLUDED_CATEGORIES.has(name.toLowerCase())) excludedCatIds.add(id);
  }
  if (excludedCatIds.size) console.log(`Excluding ${excludedCatIds.size} category(ies): ${[...EXCLUDED_CATEGORIES].join(', ')}`);

  // Column indices (header verified below).
  const COL = {
    asin: 0, title: 1, imgUrl: 2, productURL: 3, stars: 4, reviews: 5,
    price: 6, listPrice: 7, category_id: 8, isBestSeller: 9, boughtInLastMonth: 10,
  };

  const byCategory = new Map(); // category_id -> sorted candidate array (desc)
  let header = true;
  let scanned = 0;
  let kept = 0;

  await parseCsv(PRODUCTS_CSV, (r) => {
    if (header) {
      header = false;
      return;
    }
    scanned++;
    if (r.length < 11) return;

    const price = Number(r[COL.price]);
    const stars = Number(r[COL.stars]);
    const bought = Number(r[COL.boughtInLastMonth]);
    const imgUrl = r[COL.imgUrl];
    const title = cleanTitle(r[COL.title]);

    // Quality gate.
    if (!title || !isHttpUrl(imgUrl) || !(price > 0) || !(stars > 0) || !(bought > 0)) return;

    const catId = r[COL.category_id].trim();
    if (excludedCatIds.has(catId)) return;
    const cand = {
      asin: r[COL.asin].trim(),
      title,
      imgUrl,
      price,
      stars,
      reviews: Number(r[COL.reviews]) || 0,
      bought,
      catId,
      bestSeller: /^true$/i.test(r[COL.isBestSeller]),
    };

    let arr = byCategory.get(catId);
    if (!arr) {
      arr = [];
      byCategory.set(catId, arr);
    }
    // Maintain a bounded, sorted (desc) top-PER_CATEGORY per category.
    arr.push(cand);
    if (arr.length > PER_CATEGORY * 2) {
      arr.sort(better);
      arr.length = PER_CATEGORY;
    }
    kept++;
  });

  // Final trim + sort per category.
  for (const arr of byCategory.values()) {
    arr.sort(better);
    if (arr.length > PER_CATEGORY) arr.length = PER_CATEGORY;
  }

  console.log(`Scanned ${scanned} rows; ${kept} passed the quality gate across ${byCategory.size} categories.`);

  // Round-robin across categories (sorted by category name) taking the best
  // remaining item from each until we reach TARGET_COUNT.
  const catIds = [...byCategory.keys()].sort((a, b) => {
    const na = categories.get(a) || a;
    const nb = categories.get(b) || b;
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  const cursors = new Map(catIds.map((c) => [c, 0]));
  const selected = [];
  let progressed = true;
  while (selected.length < TARGET_COUNT && progressed) {
    progressed = false;
    for (const catId of catIds) {
      if (selected.length >= TARGET_COUNT) break;
      const arr = byCategory.get(catId);
      const idx = cursors.get(catId);
      if (idx < arr.length) {
        selected.push(arr[idx]);
        cursors.set(catId, idx + 1);
        progressed = true;
      }
    }
  }

  const docs = selected.map((c) => {
    const catName = categories.get(c.catId) || 'General';
    const tags = [catName];
    if (c.bestSeller) tags.push('best-seller');
    const body =
      `${c.title}. Category: ${catName}. Rated ${c.stars}★ from ` +
      `${c.reviews.toLocaleString('en-US')} reviews. Around $${c.price.toFixed(2)}.`;
    return {
      id: `prod-${c.asin}`,
      title: c.title,
      body,
      category: catName,
      tags,
      price: Number(c.price.toFixed(2)),
      imageUrl: c.imgUrl,
    };
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(docs, null, 0));

  const withPrice = docs.filter((d) => typeof d.price === 'number').length;
  const withImg = docs.filter((d) => typeof d.imageUrl === 'string').length;
  const cats = new Set(docs.map((d) => d.category)).size;
  console.log(`\nWrote ${docs.length} documents to ${OUT_FILE}`);
  console.log(`  price present:    ${((withPrice / docs.length) * 100).toFixed(1)}%`);
  console.log(`  imageUrl present: ${((withImg / docs.length) * 100).toFixed(1)}%`);
  console.log(`  distinct categories: ${cats}`);
  console.log('  sample:');
  for (const d of docs.slice(0, 3)) {
    console.log(`    - ${d.id} | ${d.title.slice(0, 60)} | $${d.price} | ${d.category}`);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
