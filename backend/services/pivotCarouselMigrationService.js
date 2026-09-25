/**
 * Assign legacy decks to one default city account per tenant.
 *
 * Idempotent. Deck _id, slides, snapshots, and updatedAt stay put so existing
 * export jobs still address the same revision. schemaVersion stays 1.
 *
 * Rollback: call rollbackCarouselAccountMigration with the report's `rollback`
 * list. That unsets accountId only when it still matches the assigned account.
 * It does not delete the default account, so a later migrate can attach again.
 */

const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');

function migrationKeyFor(tenantKey) {
  return `city-default:${tenantKey}`;
}

function fail(error, status, code) {
  return { error, status, code };
}

async function requirePivot(req, tenantKey) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) return fail('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  if (!isPivotTenant(tenant)) return fail('Carousels are only available for Pivot city tenants.', 403, 'NOT_PIVOT_TENANT');
  return null;
}

async function ensureDefaultAccount(Account, tenantKey, actor) {
  const migrationKey = migrationKeyFor(tenantKey);
  const existing = await Account.findOne({ migrationKey });
  if (existing) return { account: existing, created: false };
  try {
    const account = await Account.create({
      displayName: tenantKey,
      ownerTenantKey: tenantKey,
      sourceTenantKeys: [tenantKey],
      defaultFormat: 'sorry-you-missed-it',
      migrationKey,
      createdBy: actor,
      updatedBy: actor,
    });
    return { account, created: true };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const account = await Account.findOne({ migrationKey });
    return { account, created: false };
  }
}

async function migrateCarouselDecksToAccounts(req, { dryRun = true, tenantKey = null } = {}) {
  const actor = req.user?.globalUserId || req.user?.userId || null;
  const { PivotCarouselDeck, PivotCarouselAccount } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotCarouselAccount',
  );
  const filter = {
    $or: [{ accountId: null }, { accountId: { $exists: false } }],
  };
  if (tenantKey) {
    const key = String(tenantKey).trim().toLowerCase();
    const denied = await requirePivot(req, key);
    if (denied) return denied;
    filter.tenantKey = key;
  }

  const decks = await PivotCarouselDeck.find(filter)
    .select('_id tenantKey title name format updatedAt')
    .lean();

  const byTenant = new Map();
  for (const deck of decks) {
    const key = String(deck.tenantKey || '').toLowerCase();
    if (!byTenant.has(key)) byTenant.set(key, []);
    byTenant.get(key).push(deck);
  }

  const report = {
    dryRun: Boolean(dryRun),
    accountsCreated: [],
    accountsReused: [],
    issuesAssigned: [],
    skipped: [],
    rollback: [],
  };

  for (const [key, rows] of byTenant) {
    const denied = await requirePivot(req, key);
    if (denied) {
      report.skipped.push({ tenantKey: key, code: denied.code, count: rows.length });
      continue;
    }
    const { account, created } = dryRun
      ? {
        account: await PivotCarouselAccount.findOne({ migrationKey: migrationKeyFor(key) }),
        created: !(await PivotCarouselAccount.exists({ migrationKey: migrationKeyFor(key) })),
      }
      : await ensureDefaultAccount(PivotCarouselAccount, key, actor);

    const accountId = account?._id || null;
    if (created) report.accountsCreated.push({ tenantKey: key, accountId: accountId ? String(accountId) : null });
    else report.accountsReused.push({ tenantKey: key, accountId: String(accountId) });

    for (const deck of rows) {
      const entry = {
        issueId: String(deck._id),
        tenantKey: key,
        accountId: accountId ? String(accountId) : null,
        previousAccountId: null,
        updatedAt: deck.updatedAt,
      };
      report.issuesAssigned.push(entry);
      report.rollback.push({
        issueId: entry.issueId,
        accountId: entry.accountId,
        unset: ['accountId'],
      });
      if (dryRun || !accountId) continue;
      await PivotCarouselDeck.updateOne(
        { _id: deck._id, $or: [{ accountId: null }, { accountId: { $exists: false } }] },
        {
          $set: {
            accountId,
            name: deck.name || deck.title,
            format: deck.format || 'sorry-you-missed-it',
          },
        },
        { timestamps: false },
      );
    }
  }

  return { data: { report } };
}

async function rollbackCarouselAccountMigration(req, rollback = []) {
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const restored = [];
  for (const entry of rollback) {
    if (!entry?.issueId || !entry?.accountId) continue;
    const result = await PivotCarouselDeck.updateOne(
      { _id: entry.issueId, accountId: entry.accountId },
      { $unset: { accountId: '' } },
      { timestamps: false },
    );
    if (result.modifiedCount) restored.push(entry.issueId);
  }
  return { data: { restored } };
}

module.exports = {
  migrationKeyFor,
  migrateCarouselDecksToAccounts,
  rollbackCarouselAccountMigration,
};
