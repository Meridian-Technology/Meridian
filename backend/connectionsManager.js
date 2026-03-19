const mongoose = require('mongoose');
//load env
require('dotenv').config();

// Store active connections in a Map
const connectionPool = new Map();

// Single global/platform DB connection (reused)
let globalConnection = null;

const connectToDatabase = async (school) => {
    if (!connectionPool.has(school)) {
        const dbUri = getDbUriForSchool(school); // A function to get the correct URI
        const connection = mongoose.createConnection(dbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        connectionPool.set(school, connection);
        console.log(`Created new connection for school: ${school}`);
    }
    return connectionPool.get(school);
};

/**
 * Connect to the platform/global DB for cross-tenant data (GlobalUser, PlatformRole, TenantMembership).
 * Uses MONGO_URI_PLATFORM or falls back to same cluster with different db name (e.g. meridian_platform).
 */
const connectToGlobalDatabase = async () => {
    if (!globalConnection) {
        const uri = process.env.MONGO_URI_PLATFORM || process.env.MONGO_URI_GLOBAL ||
            (process.env.MONGO_URI_RPI
                ? process.env.MONGO_URI_RPI.replace(/\/([^/]+)(\?|$)/, '/meridian_platform$2')
                : (process.env.MONGODB_URI || process.env.DEFAULT_MONGO_URI)?.replace(/\/([^/]+)(\?|$)/, '/meridian_platform$2'));
        globalConnection = mongoose.createConnection(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Created global/platform database connection');
    }
    return globalConnection;
};

/** Platform/global DB URI for www (landing) - never use a tenant DB for base URL */
const getPlatformDbUri = () =>
    process.env.MONGO_URI_PLATFORM || process.env.MONGO_URI_GLOBAL ||
    (process.env.MONGO_URI_RPI
        ? process.env.MONGO_URI_RPI.replace(/\/([^/]+)(\?|$)/, '/meridian_platform$2')
        : (process.env.MONGODB_URI || process.env.DEFAULT_MONGO_URI)?.replace(/\/([^/]+)(\?|$)/, '/meridian_platform$2'));

const getDbUriForSchool = (school) => {
    if (school === 'www') {
        return getPlatformDbUri();
    }
    const schoolDbMap = {
        rpi: process.env.MONGO_URI_RPI,
        tvcog: process.env.MONGO_URI_TVCOG,
    };
    return schoolDbMap[school] || process.env.MONGODB_URI || process.env.DEFAULT_MONGO_URI;
};

module.exports = { connectToDatabase, connectToGlobalDatabase };
