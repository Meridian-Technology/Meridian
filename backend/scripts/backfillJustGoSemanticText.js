/**
 * Dry run: node scripts/backfillJustGoSemanticText.js --tenant=<key>
 * Apply:   node scripts/backfillJustGoSemanticText.js --tenant=<key> --apply --ack-write
 * Requires an explicit tenant URI and never prints it.
 */
require('dotenv').config();
const { connectToDatabase } = require('../connectionsManager');
const { buildJustGoSemanticText } = require('../utilities/justGoSemanticText');
const { JUST_GO_EVENT_DOCUMENT_VERSION } = require('../utilities/justGoEventDocument');

async function main() {
  const tenantKey = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice('--tenant='.length);
  const apply = process.argv.includes('--apply');
  if (!tenantKey || !/^[a-z0-9-]+$/.test(tenantKey)) throw new Error('Pass --tenant=<city-key>.');
  if (!process.env[`MONGO_URI_${tenantKey.toUpperCase()}`]) {
    throw new Error('Set an explicit MONGO_URI_<CITY> for this backfill to avoid a fallback cluster.');
  }
  if (apply && !process.argv.includes('--ack-write')) {
    throw new Error('Applying requires --ack-write after verifying the explicit tenant URI.');
  }
  const db = await connectToDatabase(tenantKey);
  await db.asPromise();
  const collection = db.collection('events');
  const cursor = collection.find({
    'customFields.pivot.ingestStatus': 'published',
    isDeleted: { $ne: true },
  }, {
    projection: { _id: 1, name: 1, description: 1, type: 1, richLocation: 1, start_time: 1, end_time: 1, 'customFields.pivot': 1 },
  });
  let scanned = 0;
  let changed = 0;
  let batch = [];
  for await (const event of cursor) {
    scanned += 1;
    const text = buildJustGoSemanticText(event);
    if (!text || (event.customFields?.pivot?.semanticText === text
      && event.customFields?.pivot?.semanticTextVersion === JUST_GO_EVENT_DOCUMENT_VERSION)) continue;
    changed += 1;
    if (apply) {
      batch.push({ updateOne: {
        filter: { _id: event._id, 'customFields.pivot.ingestStatus': 'published' },
        update: { $set: {
          'customFields.pivot.semanticText': text,
          'customFields.pivot.semanticTextVersion': JUST_GO_EVENT_DOCUMENT_VERSION,
        } },
      } });
      if (batch.length >= 100) {
        await collection.bulkWrite(batch, { ordered: false });
        batch = [];
      }
    }
  }
  if (batch.length) await collection.bulkWrite(batch, { ordered: false });
  console.log(JSON.stringify({ tenantKey, apply, scanned, changed }));
  await db.close();
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { main };
