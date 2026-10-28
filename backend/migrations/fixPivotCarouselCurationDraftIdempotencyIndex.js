#!/usr/bin/env node
/**
 * Fix E11000 on pivot_carousel_curation_drafts when idempotencyKey is null.
 *
 * Sparse unique indexes still index explicit null; drafts defaulted idempotencyKey
 * to null so only one draft could exist. This unsets null/empty keys and rebuilds
 * the sparse unique index (omit the field when unset; do not store null).
 *
 * Usage (from Meridian/backend):
 *   node migrations/fixPivotCarouselCurationDraftIdempotencyIndex.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const COLLECTION = 'pivot_carousel_curation_drafts';
const INDEX_NAME = 'idempotencyKey_1';
const INDEX_SPEC = { idempotencyKey: 1 };
const INDEX_OPTIONS = { unique: true, sparse: true, name: INDEX_NAME };

async function run() {
  const globalDb = await connectToGlobalDatabase();
  const collection = globalDb.collection(COLLECTION);

  const unsetNull = await collection.updateMany(
    { $or: [{ idempotencyKey: null }, { idempotencyKey: '' }] },
    { $unset: { idempotencyKey: '' } },
  );
  console.log('[migrate:curation-draft-idempotency] unset null/empty keys', unsetNull.modifiedCount);

  const indexes = await collection.indexes();
  const existing = indexes.find((row) => row.name === INDEX_NAME);
  if (existing) {
    await collection.dropIndex(INDEX_NAME);
    console.log('[migrate:curation-draft-idempotency] dropped', INDEX_NAME);
  }

  await collection.createIndex(INDEX_SPEC, INDEX_OPTIONS);
  console.log('[migrate:curation-draft-idempotency] created', INDEX_NAME);
}

run()
  .catch((error) => {
    console.error('[migrate:curation-draft-idempotency] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
