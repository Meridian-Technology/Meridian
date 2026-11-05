/**
 * Staging runs with NODE_ENV=production, so it is marked explicitly with
 * MERIDIAN_ENVIRONMENT=staging. While set, email and push reach platform admins
 * only, carry a staging notice, and S3 objects are never deleted (staging shares
 * production's bucket).
 */
const PLATFORM_ADMIN_ROLES = ['platform_admin', 'root'];
const STAGING_NOTICE = 'This was sent from the Meridian staging environment. '
  + 'Staging only delivers email and notifications to platform admins; no other users received it.';
const STAGING_PUSH_NOTICE = 'Staging: sent to platform admins only; no other users received this.';
const ADMIN_EMAIL_TTL_MS = 60 * 1000;

let adminEmailCache = null;

function isStagingEnvironment() {
  return process.env.MERIDIAN_ENVIRONMENT === 'staging';
}

function isPlatformAdminRoles(roles = []) {
  return Array.isArray(roles) && roles.some((role) => PLATFORM_ADMIN_ROLES.includes(role));
}

async function getPlatformAdminEmails() {
  if (adminEmailCache && adminEmailCache.expiresAt > Date.now()) return adminEmailCache.emails;
  // Required here so loading this module never pulls the model layer into a require cycle.
  const { connectToGlobalDatabase } = require('../connectionsManager');
  const getGlobalModels = require('../services/getGlobalModelService');
  const globalDb = await connectToGlobalDatabase();
  const { PlatformRole, GlobalUser } = getGlobalModels({ globalDb }, 'PlatformRole', 'GlobalUser');
  const roles = await PlatformRole.find({ roles: { $in: PLATFORM_ADMIN_ROLES } }).select('globalUserId').lean();
  const users = await GlobalUser.find({ _id: { $in: roles.map((row) => row.globalUserId) } }).select('email').lean();
  const emails = new Set(users.map((user) => String(user.email || '').trim().toLowerCase()).filter(Boolean));
  adminEmailCache = { emails, expiresAt: Date.now() + ADMIN_EMAIL_TTL_MS };
  return emails;
}

/** True when a staging S3 delete was skipped; callers return as if it succeeded. */
function skipS3DeleteOnStaging(description) {
  if (!isStagingEnvironment()) return false;
  console.warn(`[staging] skipped S3 delete (${description}); staging never deletes shared bucket objects`);
  return true;
}

function resetStagingEnvironmentCache() {
  adminEmailCache = null;
}

module.exports = {
  PLATFORM_ADMIN_ROLES,
  STAGING_NOTICE,
  STAGING_PUSH_NOTICE,
  isStagingEnvironment,
  isPlatformAdminRoles,
  getPlatformAdminEmails,
  skipS3DeleteOnStaging,
  resetStagingEnvironmentCache,
};
