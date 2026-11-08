/**
 * Grokbot's webhook settings, kept in one global record and edited from
 * Platform Admin → Integrations. The webhook key is grokbot's routine key and
 * is stored encrypted; it can be written but never read back. Until an admin
 * saves the settings, GROKBOT_CAROUSEL_WEBHOOK_URL still applies.
 */
const dns = require('dns');
const net = require('net');
const getGlobalModels = require('./getGlobalModelService');
const { createSecretBox } = require('../utilities/aesGcmSecret');

const SETTINGS_KEY = 'grokbot';
const WEBHOOK_ENV = 'GROKBOT_CAROUSEL_WEBHOOK_URL';
const CACHE_TTL_MS = 30 * 1000;
const MAX_DELIVERIES = 20;
const MAX_KEY_LENGTH = 512;
const MAX_URL_LENGTH = 2048;

const { encryptSecret, decryptSecret } = createSecretBox(['INTEGRATION_ENCRYPTION_KEY', 'JWT_SECRET']);
// Tests replace the resolver here; production uses DNS.
const network = { lookup: (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true }) };
const cache = new WeakMap();

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv6'));

/** Loopback, private, link-local, shared, documentation, or multicast. */
function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  return blocked.check(address, 'ipv6');
}

function invalidUrl(message) {
  return { error: message, status: 400, code: 'INVALID_WEBHOOK_URL' };
}

/**
 * An https URL on a public host name. Refuses IP-address hosts, localhost,
 * credentials in the URL, and a name that resolves to a private address.
 */
async function validateWebhookUrl(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || text.length > MAX_URL_LENGTH) return invalidUrl('Enter the webhook URL.');
  let url;
  try {
    url = new URL(text);
  } catch (_error) {
    return invalidUrl('Enter a valid URL.');
  }
  if (url.protocol !== 'https:') return invalidUrl('The webhook URL must start with https://.');
  if (url.username || url.password) return invalidUrl('The webhook URL cannot contain credentials.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) return invalidUrl('Enter a valid URL.');
  if (net.isIP(host)) return invalidUrl('Use a host name, not an IP address.');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return invalidUrl('The webhook URL cannot point at localhost.');
  }
  let addresses;
  try {
    addresses = await network.lookup(host);
  } catch (_error) {
    return invalidUrl(`${host} could not be resolved.`);
  }
  const list = Array.isArray(addresses) ? addresses : [addresses];
  if (!list.length || list.some((entry) => isPrivateAddress(entry?.address))) {
    return invalidUrl(`${host} resolves to a private address.`);
  }
  return { data: url.toString() };
}

function keyLast4(record) {
  if (!record?.webhookKey) return null;
  try {
    const key = decryptSecret(record.webhookKey);
    return key ? key.slice(-4) : null;
  } catch (_error) {
    return null;
  }
}

function envWebhookUrl(env = process.env) {
  const value = typeof env[WEBHOOK_ENV] === 'string' ? env[WEBHOOK_ENV].trim() : '';
  return value || null;
}

function isSaved(record) {
  return Boolean(record?.updatedAt);
}

async function readRecord(req) {
  const { PlatformIntegrationSetting } = getGlobalModels(req, 'PlatformIntegrationSetting');
  return PlatformIntegrationSetting.findOne({ key: SETTINGS_KEY }).lean();
}

/** The saved record, at most 30 seconds old. */
async function cachedRecord(req) {
  const db = req.globalDb;
  const hit = db ? cache.get(db) : null;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.record;
  const record = await readRecord(req);
  if (db) cache.set(db, { at: Date.now(), record });
  return record;
}

function clearGrokbotSettingsCache(req) {
  if (req?.globalDb) cache.delete(req.globalDb);
}

/**
 * Where to send a notice: `{ source, url, key, enabled }`. A saved record
 * wins; otherwise the env URL, with no key. `key` is plaintext and must not
 * be logged. A key that cannot be decrypted comes back as `keyError`.
 */
async function resolveGrokbotWebhook(req, { fresh = false } = {}) {
  const record = fresh ? await readRecord(req) : await cachedRecord(req);
  if (!isSaved(record)) {
    const url = envWebhookUrl();
    return { source: url ? 'environment' : 'none', url, key: null, enabled: Boolean(url) };
  }
  let key = null;
  let keyError = null;
  if (record.webhookKey) {
    try {
      key = decryptSecret(record.webhookKey);
    } catch (_error) {
      keyError = 'The stored webhook key could not be decrypted. Save it again.';
    }
  }
  return {
    source: 'database',
    url: record.webhookUrl || null,
    key,
    keyError,
    enabled: Boolean(record.enabled),
  };
}

function serializeDelivery(entry) {
  return {
    at: entry.at,
    event: entry.event,
    jobId: entry.jobId || null,
    attempt: entry.attempt || 1,
    status: entry.status ?? null,
    error: entry.error || null,
  };
}

/** What Platform Admin shows. Never the key, only whether one is set. */
async function getGrokbotSettings(req) {
  const record = await readRecord(req);
  const saved = isSaved(record);
  const envUrl = envWebhookUrl();
  return {
    data: {
      source: saved ? 'database' : (envUrl ? 'environment' : 'none'),
      webhookUrl: saved ? record.webhookUrl || null : envUrl,
      enabled: saved ? Boolean(record.enabled) : Boolean(envUrl),
      keySet: saved && Boolean(record.webhookKey),
      keyLast4: saved ? keyLast4(record) : null,
      updatedAt: saved ? record.updatedAt : null,
      updatedBy: saved && record.updatedBy ? String(record.updatedBy) : null,
      deliveries: (record?.deliveries || []).map(serializeDelivery).reverse(),
    },
  };
}

function invalid(message, code = 'INVALID_SETTINGS') {
  return { error: message, status: 400, code };
}

/**
 * Apply `{ webhookUrl?, webhookKey?, enabled? }`. An empty URL or key clears
 * it. Once saved, the record replaces the env URL; nothing is copied from it.
 */
async function updateGrokbotSettings(req, body, { actorId } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const set = {};
  if (input.webhookUrl !== undefined) {
    if (input.webhookUrl === null || (typeof input.webhookUrl === 'string' && !input.webhookUrl.trim())) {
      set.webhookUrl = null;
    } else {
      const checked = await validateWebhookUrl(input.webhookUrl);
      if (checked.error) return checked;
      set.webhookUrl = checked.data;
    }
  }
  if (input.webhookKey !== undefined) {
    if (input.webhookKey === null || input.webhookKey === '') {
      set.webhookKey = null;
    } else if (
      typeof input.webhookKey !== 'string'
      || input.webhookKey.length > MAX_KEY_LENGTH
      || /\s/.test(input.webhookKey)
    ) {
      return invalid('The webhook key must be a single line with no spaces.', 'INVALID_WEBHOOK_KEY');
    } else {
      set.webhookKey = encryptSecret(input.webhookKey);
    }
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return invalid('enabled must be true or false.');
    set.enabled = input.enabled;
  }
  if (!Object.keys(set).length) {
    return invalid('Send webhookUrl, webhookKey, or enabled.');
  }
  set.updatedAt = new Date();
  set.updatedBy = actorId || null;

  const { PlatformIntegrationSetting } = getGlobalModels(req, 'PlatformIntegrationSetting');
  const record = await PlatformIntegrationSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  if (req.globalDb) cache.set(req.globalDb, { at: Date.now(), record });
  return getGrokbotSettings(req);
}

/**
 * Keep one attempt in the last-20 list. Never throws; callers do not await
 * it on a job's path.
 */
async function recordGrokbotDelivery(req, { event, jobId = null, attempt = 1, status = null, error = null }) {
  try {
    const { PlatformIntegrationSetting } = getGlobalModels(req, 'PlatformIntegrationSetting');
    await PlatformIntegrationSetting.updateOne(
      { key: SETTINGS_KEY },
      {
        $push: {
          deliveries: {
            $each: [{
              at: new Date(),
              event: String(event || 'unknown').slice(0, 40),
              jobId: jobId ? String(jobId).slice(0, 200) : null,
              attempt,
              status: Number.isInteger(status) ? status : null,
              error: error ? String(error).slice(0, 200) : null,
            }],
            $slice: -MAX_DELIVERIES,
          },
        },
      },
      { upsert: true },
    );
  } catch (_error) {
    // A lost delivery row must never surface on a job.
  }
}

/** The URL to paste into grokbot's connector, on the host serving this request. */
function mcpServerUrl(req) {
  const forwarded = String(req.get?.('x-forwarded-host') || '').split(',')[0].trim();
  const host = forwarded || req.get?.('host') || 'localhost';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  return `${local ? req.protocol || 'http' : 'https'}://${host}/mcp/carousel`;
}

module.exports = {
  validateWebhookUrl,
  isPrivateAddress,
  resolveGrokbotWebhook,
  getGrokbotSettings,
  updateGrokbotSettings,
  recordGrokbotDelivery,
  clearGrokbotSettingsCache,
  mcpServerUrl,
  network,
  CACHE_TTL_MS,
  MAX_DELIVERIES,
};
