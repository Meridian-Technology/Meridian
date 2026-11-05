#!/usr/bin/env node
/**
 * Copy production into staging for the kept tenants, scrubbing identifiable data.
 *
 * Dry run by default: reads production, transforms every document in memory,
 * and prints per-collection counts plus any email addresses that survived the
 * scrub. Nothing is written without --write.
 *
 *   cp migrations/copyProductionToStaging.config.example .env.staging-copy   # gitignored
 *   node migrations/copyProductionToStaging.js --config .env.staging-copy [--write]
 *
 * The config file (or the same names in the environment) holds:
 * SOURCE_* — production's MONGO_URI_PLATFORM / MONGO_URI_SF / MONGO_URI_IC.
 * TARGET_GLOBAL_URI — staging's MONGO_URI_GLOBAL; TARGET_BASE_URI — staging's
 * MONGODB_URI, from which staging derives each tenant database by name.
 * Every run first prints where each URI points (password hidden).
 *
 * --write also asks Heroku for staging's MERIDIAN_ENVIRONMENT and requires
 * "staging", so data never lands before staging stops emailing and notifying users.
 *
 * With --write, each target database is first copied to
 * backup_<stamp>_<name> on the staging cluster, then dropped and replaced.
 *
 * What changes on the way:
 * - Only the kept tenants (sf, ic) and tenant-less global rows are copied.
 * - tenant_config keeps only kept tenants, and drops their mongoUri.
 * - Everyone except platform admins is scrubbed: email, name, username,
 *   picture, and every credential (password, refresh/push tokens, OAuth ids, MFA).
 * - Sessions, lead lists, contact hashes and in-app notifications are not copied.
 */
const crypto = require('crypto');
const fs = require('fs');
const { execFileSync } = require('child_process');
const dotenv = require('dotenv');
const { MongoClient } = require('mongoose').mongo;

const KEPT_TENANTS = ['sf', 'ic'];
const PLATFORM_ADMIN_ROLES = ['platform_admin', 'root'];
const SCRUBBED_DOMAIN = 'staging.invalid';
const BATCH_SIZE = 1000;

const SKIPPED = {
  global: new Set([
    'sessions', 'androidTesterSignups', 'contactRequests', 'justgo_city_interest', 'justgo_waitlist',
    'platform_admin_invites', 'pending_registrations', 'pivot_contact_hashes', 'justgo_live_fans',
  ]),
  tenant: new Set(['notifications', 'sessions', 'pending_registrations', 'contactRequests', 'androidTesterSignups']),
};
const USER_CREDENTIALS = [
  'password', 'refreshToken', 'pushToken', 'pushTokenUpdatedAt', 'pushAppEdition', 'pushAppProduct',
  'googleId', 'appleId', 'samlId', 'samlProvider', 'sessions', 'adminMfa', 'pivotBirthYear',
];
const ADMIN_SESSION_FIELDS = ['refreshToken', 'sessions'];
const TRACKING_FIELDS = ['ip_hash', 'ipAddress', 'user_agent_summary', 'userAgent'];
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SETTINGS = ['SOURCE_GLOBAL_URI', 'SOURCE_SF_URI', 'SOURCE_IC_URI', 'TARGET_GLOBAL_URI', 'TARGET_BASE_URI'];
const DEFAULT_STAGING_APP = 'meridian-staging-env';
const URI_PATTERN = /^mongodb(?:\+srv)?:\/\/(?:([^:@/]+)(?::[^@/]*)?@)?([^/?]+)(?:\/([^?]*))?/;

function parseArgs(argv) {
  const inline = argv.find((arg) => arg.startsWith('--config='));
  const index = argv.indexOf('--config');
  const config = inline ? inline.slice('--config='.length) : (index >= 0 ? argv[index + 1] : null);
  if (index >= 0 && !config) throw new Error('--config needs a file path');
  return { write: argv.includes('--write'), config };
}

function idOf(value) {
  return value == null ? '' : String(value);
}

function scrubbedEmail(id) {
  return `user-${id}@${SCRUBBED_DOMAIN}`;
}

function scrubbedName(id) {
  return `Staging user ${id.slice(-6)}`;
}

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

function unset(doc, fields) {
  for (const field of fields) delete doc[field];
}

/** Rows owned by an excluded tenant are dropped; tenant-less rows are kept. */
function belongsToKeptTenant(doc) {
  for (const field of ['tenantKey', 'ownerTenantKey']) {
    const value = doc[field];
    if (typeof value === 'string' && value && !KEPT_TENANTS.includes(value)) return false;
  }
  return true;
}

/**
 * Returns the document to write, or null to leave it out. `ctx` carries the
 * platform admin ids and the global users who belong to a kept tenant.
 */
function transformDocument(scope, collection, source, ctx) {
  if (SKIPPED[scope === 'global' ? 'global' : 'tenant'].has(collection)) return null;
  if (!belongsToKeptTenant(source)) return null;
  const doc = { ...source };
  const id = idOf(doc._id);
  unset(doc, TRACKING_FIELDS.filter((field) => field in doc));

  if (scope === 'global') {
    switch (collection) {
      case 'global_users':
        if (!ctx.keptGlobalUserIds.has(id)) return null;
        if (!ctx.adminGlobalUserIds.has(id)) {
          doc.email = scrubbedEmail(id);
          doc.name = scrubbedName(id);
          doc.picture = null;
          unset(doc, ['googleId', 'appleId']);
        }
        break;
      case 'tenant_config':
        if (Array.isArray(doc.tenants)) {
          doc.tenants = doc.tenants
            .filter((tenant) => KEPT_TENANTS.includes(tenant.tenantKey))
            .map(({ mongoUri, ...tenant }) => tenant);
        }
        break;
      case 'platform_roles':
        if (!ctx.adminGlobalUserIds.has(idOf(doc.globalUserId))) return null;
        break;
      case 'meridian_job_deliveries':
        if (doc.userId) { doc.name = scrubbedName(idOf(doc.userId)); doc.username = `user-${idOf(doc.userId)}`; }
        break;
      case 'pivot_user_invites':
        doc.inviterName = doc.inviterName ? 'Staging user' : doc.inviterName;
        doc.inviterPicture = null;
        break;
      case 'pivot_carousel_accounts':
        if (Array.isArray(doc.sourceTenantKeys)) doc.sourceTenantKeys = doc.sourceTenantKeys.filter((key) => KEPT_TENANTS.includes(key));
        break;
      default:
        break;
    }
    return doc;
  }

  switch (collection) {
    case 'users': {
      const admin = ctx.adminTenantUserIds.get(scope)?.has(id);
      if (admin) {
        unset(doc, ADMIN_SESSION_FIELDS);
      } else {
        doc.email = scrubbedEmail(id);
        doc.name = scrubbedName(id);
        if (doc.username) doc.username = `user-${id}`;
        doc.picture = null;
        unset(doc, USER_CREDENTIALS);
      }
      break;
    }
    case 'events':
      if (doc.autoClaimMatchingEmail) doc.autoClaimMatchingEmail = null;
      break;
    case 'pivotCrewMemberships':
      if (doc.inviteToken) doc.inviteToken = randomToken();
      break;
    case 'pivotCrews':
      if (doc.shareInviteToken) doc.shareInviteToken = randomToken();
      break;
    case 'pivotDropPushRuns':
      if (Array.isArray(doc.recipients)) {
        doc.recipients = doc.recipients.map((row) => ({ ...row, name: scrubbedName(idOf(row.userId)), username: `user-${idOf(row.userId)}` }));
      }
      break;
    default:
      break;
  }
  return doc;
}

/** Email addresses still present after the scrub, by collection field. */
function residualEmails(doc, ctx, prefix = '', found = new Map()) {
  const list = Array.isArray(doc);
  for (const [key, value] of Object.entries(doc || {})) {
    const path = list ? prefix : (prefix ? `${prefix}.${key}` : key);
    if (typeof value === 'string') {
      const hits = (value.match(EMAIL_PATTERN) || [])
        .filter((email) => !email.toLowerCase().endsWith(`@${SCRUBBED_DOMAIN}`) && !ctx.adminEmails.has(email.toLowerCase()));
      if (hits.length) found.set(path, (found.get(path) || 0) + hits.length);
    } else if (value && typeof value === 'object' && !value._bsontype && !(value instanceof Date)) {
      residualEmails(value, ctx, Array.isArray(value) ? `${path}[]` : path, found);
    }
  }
  return found;
}

async function loadContext(globalDb) {
  const roles = await globalDb.collection('platform_roles').find({ roles: { $in: PLATFORM_ADMIN_ROLES } }).toArray();
  const adminGlobalUserIds = new Set(roles.map((row) => idOf(row.globalUserId)));
  const memberships = await globalDb.collection('tenant_memberships').find({ tenantKey: { $in: KEPT_TENANTS } }).toArray();
  const keptGlobalUserIds = new Set([...adminGlobalUserIds, ...memberships.map((row) => idOf(row.globalUserId))]);
  const adminTenantUserIds = new Map(KEPT_TENANTS.map((key) => [key, new Set()]));
  for (const row of memberships) {
    if (adminGlobalUserIds.has(idOf(row.globalUserId))) adminTenantUserIds.get(row.tenantKey).add(idOf(row.tenantUserId));
  }
  const admins = await globalDb.collection('global_users').find({ _id: { $in: roles.map((row) => row.globalUserId) } }).toArray();
  const adminEmails = new Set(admins.map((user) => String(user.email || '').toLowerCase()).filter(Boolean));
  return { adminGlobalUserIds, keptGlobalUserIds, adminTenantUserIds, adminEmails };
}

function parseUri(name, uri) {
  const match = String(uri).match(URI_PATTERN);
  if (!match) throw new Error(`${name} is not a mongodb:// or mongodb+srv:// URI`);
  return { user: match[1] || null, host: match[2].toLowerCase(), database: match[3] || '' };
}

function hostOf(uri) {
  return parseUri('URI', uri).host;
}

/** user@host/database with the password left out, for the pre-flight listing. */
function describeUri(name, uri) {
  const { user, host, database } = parseUri(name, uri);
  return `${user ? `${user}@` : ''}${host}/${database || '(default)'}`;
}

function withDatabase(uri, name) {
  return uri.replace(/\/([^/?]*)(\?|$)/, `/${name}$2`);
}

/** Config file values, with the environment filling anything the file leaves out. */
function loadSettings(configPath) {
  let file = {};
  if (configPath) {
    const mode = fs.statSync(configPath).mode;
    if (mode & 0o077) console.warn(`warning: ${configPath} is readable by other users; run chmod 600 ${configPath}`);
    file = dotenv.parse(fs.readFileSync(configPath));
  }
  const settings = {};
  for (const name of [...SETTINGS, 'STAGING_HEROKU_APP']) settings[name] = (file[name] || process.env[name] || '').trim();
  const missing = SETTINGS.filter((name) => !settings[name] || /^<.*>$|REPLACE_ME/.test(settings[name]));
  if (missing.length) throw new Error(`Fill in ${missing.join(', ')}${configPath ? ` in ${configPath}` : ''}`);
  settings.STAGING_HEROKU_APP ||= DEFAULT_STAGING_APP;
  return settings;
}

function readStagingGate(app) {
  try {
    return execFileSync('heroku', ['config:get', 'MERIDIAN_ENVIRONMENT', '-a', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function indexSpecs(indexes) {
  return indexes.filter((index) => index.name !== '_id_').map(({ v, ns, background, ...spec }) => spec);
}

async function copyDatabase(scope, sourceDb, targetDb, ctx, { write, log }) {
  const collections = (await sourceDb.listCollections({ type: 'collection' }).toArray())
    .map((row) => row.name).filter((name) => !name.startsWith('system.')).sort();
  const summary = [];
  for (const name of collections) {
    let read = 0; let kept = 0; let batch = [];
    const residual = new Map();
    const flush = async () => {
      if (write && batch.length) await targetDb.collection(name).insertMany(batch, { ordered: false });
      batch = [];
    };
    for await (const source of sourceDb.collection(name).find({})) {
      read += 1;
      const doc = transformDocument(scope, name, source, ctx);
      if (!doc) continue;
      kept += 1;
      residualEmails(doc, ctx, '', residual);
      batch.push(doc);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    if (write) {
      if (kept) await flush();
      else await targetDb.createCollection(name).catch(() => {});
      const specs = indexSpecs(await sourceDb.collection(name).indexes());
      if (specs.length) await targetDb.collection(name).createIndexes(specs);
    }
    summary.push({ name, read, kept, residual });
  }
  log(`\n${scope}: ${sourceDb.databaseName} -> ${targetDb.databaseName}`);
  for (const row of summary) {
    if (!row.read) continue;
    const residual = [...row.residual].map(([path, count]) => `${path}:${count}`).join(' ');
    log(`  ${row.name.padEnd(34)} ${String(row.kept).padStart(6)} / ${String(row.read).padEnd(6)}${residual ? `  emails left: ${residual}` : ''}`);
  }
  return summary;
}

async function backupDatabase(client, name, stamp, log) {
  const source = client.db(name);
  const names = (await source.listCollections({ type: 'collection' }).toArray()).map((row) => row.name).filter((n) => !n.startsWith('system.'));
  if (!names.length) return null;
  const target = client.db(`backup_${stamp}_${name}`);
  for (const collection of names) {
    const docs = await source.collection(collection).find({}).toArray();
    if (docs.length) await target.collection(collection).insertMany(docs, { ordered: false });
  }
  log(`backed up staging ${name} to ${target.databaseName} (${names.length} collections)`);
  return target.databaseName;
}

async function copyProductionToStaging({ write = false, config = null, log = console.log } = {}) {
  const env = loadSettings(config);
  const plan = [
    ['global', env.SOURCE_GLOBAL_URI, env.TARGET_GLOBAL_URI],
    ['sf', env.SOURCE_SF_URI, withDatabase(env.TARGET_BASE_URI, 'sf')],
    ['ic', env.SOURCE_IC_URI, withDatabase(env.TARGET_BASE_URI, 'ic')],
  ];
  log('production -> staging');
  for (const [scope, source, target] of plan) {
    log(`  ${scope.padEnd(7)} ${describeUri(`${scope} source`, source)}  ->  ${describeUri(`${scope} target`, target)}`);
  }
  const gate = readStagingGate(env.STAGING_HEROKU_APP);
  log(`  staging gate (${env.STAGING_HEROKU_APP}): MERIDIAN_ENVIRONMENT=${gate === null ? '(could not ask Heroku)' : gate || '(not set)'}\n`);

  const sourceHosts = new Set([env.SOURCE_GLOBAL_URI, env.SOURCE_SF_URI, env.SOURCE_IC_URI].map(hostOf));
  for (const uri of [env.TARGET_GLOBAL_URI, env.TARGET_BASE_URI]) {
    if (sourceHosts.has(hostOf(uri))) throw new Error('A staging URI points at a production cluster; refusing to run.');
  }
  if (write && gate !== 'staging') {
    throw new Error(`${env.STAGING_HEROKU_APP} must have MERIDIAN_ENVIRONMENT=staging (and the delivery gate deployed) before --write.`);
  }

  const clients = [];
  const open = async (uri) => { const client = await new MongoClient(uri).connect(); clients.push(client); return client; };
  try {
    const sources = await Promise.all(plan.map(([, uri]) => open(uri)));
    const targets = await Promise.all(plan.map(([, , uri]) => open(uri)));
    const ctx = await loadContext(sources[0].db());
    log(`${write ? 'WRITE' : 'DRY RUN'}: tenants ${KEPT_TENANTS.join(', ')}; ${ctx.adminGlobalUserIds.size} platform admin(s) kept unscrubbed; ${ctx.keptGlobalUserIds.size} global user(s) kept`);
    log('columns: collection, kept / read');

    if (write) {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
      for (const [index, [scope]] of plan.entries()) {
        const targetDb = targets[index].db();
        await backupDatabase(targets[index], targetDb.databaseName, stamp, log);
        await targetDb.dropDatabase();
        log(`dropped staging ${targetDb.databaseName} (${scope})`);
      }
    }
    for (const [index, [scope]] of plan.entries()) {
      await copyDatabase(scope, sources[index].db(), targets[index].db(), ctx, { write, log });
    }
    log(write ? '\nDone. Staging now holds the scrubbed copy.' : '\nDry run: nothing was written. Pass --write to replace staging.');
  } finally {
    await Promise.all(clients.map((client) => client.close()));
  }
}

if (require.main === module) {
  Promise.resolve().then(() => copyProductionToStaging(parseArgs(process.argv.slice(2)))).catch((error) => {
    console.error(`[copy-production-to-staging] failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { KEPT_TENANTS, transformDocument, residualEmails, belongsToKeptTenant, describeUri, loadSettings, parseArgs, copyProductionToStaging };
