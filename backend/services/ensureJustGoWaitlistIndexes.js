const getGlobalModels = require('./getGlobalModelService');
const justGoWaitlistSchema = require('../schemas/justGoWaitlist');

const syncedGlobalDbs = new WeakSet();

/**
 * Sync justgo_waitlist indexes on the global DB.
 *
 * Pre-email migration used unique `{ tenantKey, phoneE164 }`. Email signups omit
 * phoneE164 (null), so a leftover phone index blocks more than one row per city.
 */
async function ensureJustGoWaitlistIndexes(req, { force = false } = {}) {
  if (!req?.globalDb) return;
  if (!force && syncedGlobalDbs.has(req.globalDb)) return;

  const db = req.globalDb;
  const JustGoWaitlist =
    db.models.JustGoWaitlist ||
    db.model('JustGoWaitlist', justGoWaitlistSchema, 'justgo_waitlist');

  await JustGoWaitlist.syncIndexes();
  syncedGlobalDbs.add(req.globalDb);
}

module.exports = {
  ensureJustGoWaitlistIndexes,
};
