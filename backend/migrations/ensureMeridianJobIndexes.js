#!/usr/bin/env node
/**
 * Ensure durable indexes for Meridian job runs, attempts, deliveries, and notification definitions.
 *
 * Usage (from Meridian/backend):
 *   node migrations/ensureMeridianJobIndexes.js
 *   node migrations/ensureMeridianJobIndexes.js --down
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const {
  ensureMeridianJobIndexes,
  dropMeridianJobIndexes,
} = require('../services/ensureMeridianJobIndexes');

async function run() {
  const down = process.argv.includes('--down');
  const globalDb = await connectToGlobalDatabase();
  const req = { globalDb };

  if (down) {
    await dropMeridianJobIndexes(req);
    console.log('[migrate:meridian-job-indexes] dropped meridian job indexes');
    return;
  }

  await ensureMeridianJobIndexes(req, { force: true });
  console.log('[migrate:meridian-job-indexes] synced meridian job indexes');
}

run()
  .catch((error) => {
    console.error('[migrate:meridian-job-indexes] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
