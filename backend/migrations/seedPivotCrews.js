#!/usr/bin/env node
/**
 * Seed dev Pivot crews + memberships into pivot pilot tenant DB(s).
 *
 * Usage (from Meridian/backend):
 *   npm run seed:pivot-crews
 *
 * Optional env:
 *   PIVOT_TENANT_KEYS=nyc,brooklyn  (default: nyc)
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('../services/getModelService');
const { PILOT_TENANT_KEY } = require('../constants/pivotPilotReferralCodes');
const {
  PIVOT_CREW_MEMBERSHIP_ROLES,
  PIVOT_CREW_MEMBERSHIP_STATUSES,
} = require('../schemas/pivotCrewMembership');

const SEED_MARKER = 'seed:pivot-crews';

const SEED_CREWS = Object.freeze([
  { seedKey: 'weekend-runners', name: 'Weekend Runners' },
  { seedKey: 'friday-plans', name: 'Friday Plans' },
  { seedKey: 'open-mic-crew', name: 'Open Mic Crew' },
]);

function tenantKeysFromEnv() {
  const raw = process.env.PIVOT_TENANT_KEYS || PILOT_TENANT_KEY;
  return raw
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

function buildMembershipDoc({
  crewId,
  userId = null,
  role,
  status,
  inviteToken,
  invitedAt,
  joinedAt = null,
}) {
  return {
    crewId,
    userId,
    inviteToken,
    role,
    status,
    invitedAt,
    joinedAt,
  };
}

async function upsertSeedCrew({ PivotCrew, PivotCrewMembership, tenantKey, ownerId, memberId }) {
  const now = new Date();
  let crewsUpserted = 0;
  let membershipsUpserted = 0;

  for (const seed of SEED_CREWS) {
    const crew = await PivotCrew.findOneAndUpdate(
      { tenantKey, name: seed.name },
      {
        $setOnInsert: {
          createdBy: ownerId,
          tenantKey,
          shareInviteToken: PivotCrewMembership.generateInviteToken(),
        },
        $set: {
          archivedAt: null,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    crewsUpserted += 1;

    const ownerMembership = buildMembershipDoc({
      crewId: crew._id,
      userId: ownerId,
      role: PIVOT_CREW_MEMBERSHIP_ROLES[0],
      status: PIVOT_CREW_MEMBERSHIP_STATUSES[0],
      inviteToken: PivotCrewMembership.generateInviteToken(),
      invitedAt: now,
      joinedAt: now,
    });

    await PivotCrewMembership.findOneAndUpdate(
      { crewId: crew._id, userId: ownerId, status: 'active' },
      { $set: ownerMembership },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    membershipsUpserted += 1;

    if (memberId && String(memberId) !== String(ownerId)) {
      await PivotCrewMembership.findOneAndUpdate(
        { crewId: crew._id, userId: memberId, status: 'active' },
        {
          $set: buildMembershipDoc({
            crewId: crew._id,
            userId: memberId,
            role: PIVOT_CREW_MEMBERSHIP_ROLES[1],
            status: PIVOT_CREW_MEMBERSHIP_STATUSES[0],
            inviteToken: PivotCrewMembership.generateInviteToken(),
            invitedAt: now,
            joinedAt: now,
          }),
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      membershipsUpserted += 1;
    }

    if (seed.seedKey === 'friday-plans') {
      await PivotCrewMembership.findOneAndUpdate(
        {
          crewId: crew._id,
          status: 'invited',
          userId: null,
        },
        {
          $setOnInsert: {
            crewId: crew._id,
            userId: null,
            role: PIVOT_CREW_MEMBERSHIP_ROLES[1],
            status: PIVOT_CREW_MEMBERSHIP_STATUSES[1],
            inviteToken: PivotCrewMembership.generateInviteToken(),
            invitedAt: now,
            joinedAt: null,
          },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      membershipsUpserted += 1;
    }
  }

  return { crewsUpserted, membershipsUpserted };
}

async function seedTenant(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };
  const { User, PivotCrew, PivotCrewMembership } = getModels(
    req,
    'User',
    'PivotCrew',
    'PivotCrewMembership',
  );

  const users = await User.find().select('_id').limit(2).lean();
  const ownerId = users[0]?._id || new mongoose.Types.ObjectId();
  const memberId = users[1]?._id || null;

  const { crewsUpserted, membershipsUpserted } = await upsertSeedCrew({
    PivotCrew,
    PivotCrewMembership,
    tenantKey,
    ownerId,
    memberId,
  });

  const ownerCrewCount = await PivotCrewMembership.countDocuments({
    userId: ownerId,
    status: 'active',
  });

  console.log(
    `[${SEED_MARKER}] tenantKey=${tenantKey} crews=${crewsUpserted} memberships=${membershipsUpserted} owner_active_crews=${ownerCrewCount}`,
  );
}

async function main() {
  const tenants = tenantKeysFromEnv();
  for (const tenantKey of tenants) {
    await seedTenant(tenantKey);
  }
  console.log(`[${SEED_MARKER}] done`);
}

main()
  .catch((error) => {
    console.error(`[${SEED_MARKER}] failed`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
