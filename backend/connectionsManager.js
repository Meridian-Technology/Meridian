const mongoose = require('mongoose');
require('dotenv').config();

const connectionPool = new Map();
let globalConnection = null;
let tenantUriCache = new Map();

const LEGACY_SCHOOL_DB_MAP = {
  rpi: process.env.MONGO_URI_RPI,
  tvcog: process.env.MONGO_URI_TVCOG,
};

function getPlatformDbUri() {
  return (
    process.env.MONGO_URI_PLATFORM ||
    process.env.MONGO_URI_GLOBAL ||
    (process.env.MONGO_URI_RPI
      ? process.env.MONGO_URI_RPI.replace(/\/([^/]+)(\?|$)/, '/meridian_platform$2')
      : (process.env.MONGODB_URI || process.env.DEFAULT_MONGO_URI)?.replace(
          /\/([^/]+)(\?|$)/,
          '/meridian_platform$2'
        ))
  );
}

function getBaseMongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.DEFAULT_MONGO_URI ||
    process.env.MONGO_URI_RPI ||
    null
  );
}

function deriveMongoUriForTenant(tenantKey, tenantRow = {}) {
  if (tenantKey === 'www') return getPlatformDbUri();

  const envKey = `MONGO_URI_${String(tenantKey).toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];

  if (LEGACY_SCHOOL_DB_MAP[tenantKey]) return LEGACY_SCHOOL_DB_MAP[tenantKey];

  if (tenantRow?.mongoUri) return tenantRow.mongoUri;

  if (tenantUriCache.has(tenantKey)) return tenantUriCache.get(tenantKey);

  const dbName = tenantRow?.mongoDatabaseName || tenantKey;
  const base = getBaseMongoUri();
  if (!base) return null;
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

function setTenantUriCache(entries = {}) {
  tenantUriCache = new Map(Object.entries(entries).filter(([, uri]) => Boolean(uri)));
}

function getRegisteredTenantKeys() {
  const keys = new Set(['rpi', 'tvcog', 'www']);
  tenantUriCache.forEach((_, key) => keys.add(key));
  return Array.from(keys);
}

const connectToDatabase = async (school) => {
  if (!connectionPool.has(school)) {
    const dbUri = deriveMongoUriForTenant(school);
    if (!dbUri) {
      throw new Error(`No MongoDB URI configured for tenant "${school}"`);
    }
    const connection = mongoose.createConnection(dbUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    connectionPool.set(school, connection);
    console.log(`Created new connection for school: ${school}`);
  }
  return connectionPool.get(school);
};

const connectToGlobalDatabase = async () => {
  if (!globalConnection) {
    const uri = getPlatformDbUri();
    globalConnection = mongoose.createConnection(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Created global/platform database connection');
  }
  return globalConnection;
};

function invalidateTenantConnection(tenantKey) {
  const conn = connectionPool.get(tenantKey);
  if (conn) {
    conn.close().catch(() => {});
    connectionPool.delete(tenantKey);
  }
}

module.exports = {
  connectToDatabase,
  connectToGlobalDatabase,
  getPlatformDbUri,
  deriveMongoUriForTenant,
  setTenantUriCache,
  getRegisteredTenantKeys,
  invalidateTenantConnection,
};
