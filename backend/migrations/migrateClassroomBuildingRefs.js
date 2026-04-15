/**
 * One-shot migration: legacy Classroom.building (string) → ObjectId ref to Building.
 * Uses the native driver on collection names so it stays reliable across schema changes.
 *
 * Deploy note: existing tenants still have string `building` values until this runs.
 * With the ObjectId classroom schema, hydrate those docs before migration will throw CastError.
 * Prefer running once via CLI *before* restarting app servers on this version:
 *   MIGRATION_SCHOOL=rpi node Meridian/backend/migrations/migrateClassroomBuildingRefs.js
 * Optional: FORCE=1 to clear the per-tenant guard row and re-run.
 */

const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');

const MIGRATION_KEY = 'classroom_building_oid_ref';
const CLASSROOMS_COLL = 'classrooms1';
const BUILDINGS_COLL = 'buildings';
const RUNS_COLL = 'admin_migration_runs';

const DEFAULT_BUILDING_IMAGE = '/classrooms/default.png';
const DEFAULT_TIME = { start: 0, end: 24 * 60 };

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findBuildingByName(buildings, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  let doc = await buildings.findOne({ name: trimmed });
  if (doc) return doc;
  doc = await buildings.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });
  return doc;
}

/**
 * @param {import('mongoose').Connection} mongooseConn
 * @param {{ force?: boolean }} [options]
 */
async function runMigrateClassroomBuildingRefs(mongooseConn, options = {}) {
  const { force = false } = options;
  const db = mongooseConn.db;
  const runs = db.collection(RUNS_COLL);
  const classrooms = db.collection(CLASSROOMS_COLL);
  const buildings = db.collection(BUILDINGS_COLL);

  if (!force) {
    const prior = await runs.findOne({ key: MIGRATION_KEY });
    if (prior) {
      return {
        skipped: true,
        reason: 'already_run',
        ranAt: prior.completedAt || null,
      };
    }
  } else {
    await runs.deleteMany({ key: MIGRATION_KEY });
  }

  const stringRooms = await classrooms
    .find({
      building: { $exists: true, $type: 'string', $nin: ['', null] },
    })
    .toArray();

  const distinctNames = [
    ...new Set(stringRooms.map((d) => String(d.building).trim()).filter(Boolean)),
  ];

  const buildingsCreated = [];
  const buildingsReused = [];
  const nameToId = new Map();

  for (const name of distinctNames) {
    const existing = await findBuildingByName(buildings, name);
    if (existing) {
      nameToId.set(name, existing._id);
      buildingsReused.push(name);
      continue;
    }
    const ins = await buildings.insertOne({
      name,
      image: DEFAULT_BUILDING_IMAGE,
      time: DEFAULT_TIME,
    });
    nameToId.set(name, ins.insertedId);
    buildingsCreated.push(name);
  }

  const bulkOps = stringRooms
    .map((doc) => {
      const name = String(doc.building).trim();
      const bid = nameToId.get(name);
      if (!bid) return null;
      return {
        updateOne: {
          filter: { _id: doc._id, building: { $type: 'string' } },
          update: { $set: { building: bid } },
        },
      };
    })
    .filter(Boolean);

  let classroomsUpdated = 0;
  if (bulkOps.length) {
    const wr = await classrooms.bulkWrite(bulkOps, { ordered: false });
    classroomsUpdated = wr.modifiedCount || 0;
  }

  await classrooms.updateMany({ building: '' }, { $unset: { building: '' } });

  const summary = {
    skipped: false,
    distinctBuildingNames: distinctNames.length,
    buildingsCreatedCount: buildingsCreated.length,
    buildingsReusedCount: buildingsReused.length,
    buildingsCreated,
    classroomsUpdated,
  };

  await runs.insertOne({
    key: MIGRATION_KEY,
    completedAt: new Date(),
    summary,
  });

  return summary;
}

module.exports = {
  runMigrateClassroomBuildingRefs,
  MIGRATION_KEY,
};

async function cliMain() {
  const school = process.env.MIGRATION_SCHOOL || process.argv[2] || 'rpi';
  const conn = await connectToDatabase(school);
  try {
    const out = await runMigrateClassroomBuildingRefs(conn, { force: process.env.FORCE === '1' });
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await conn.close().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  cliMain().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
