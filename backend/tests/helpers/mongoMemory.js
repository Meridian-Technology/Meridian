const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Create in-memory MongoDB connection(s) for tests.
 * @param {Object} [options]
 * @param {boolean} [options.withGlobalDb=false] - If true, also create a second connection for global/platform DB (multi-tenant identity)
 * @returns {Promise<{mongoServer, connection, globalConnection?, cleanup, reset}>}
 */
async function createMongoMemoryConnection(options = {}) {
  const { withGlobalDb = false } = options;

  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri('meridian_test');
  const connection = await mongoose.createConnection(uri).asPromise();

  let globalConnection = null;
  if (withGlobalDb) {
    const globalUri = mongoServer.getUri('meridian_platform');
    globalConnection = await mongoose.createConnection(globalUri).asPromise();
  }

  return {
    mongoServer,
    connection,
    globalConnection,
    async cleanup() {
      if (connection.readyState !== 0) {
        await connection.dropDatabase();
        await connection.close();
      }
      if (globalConnection && globalConnection.readyState !== 0) {
        await globalConnection.dropDatabase();
        await globalConnection.close();
      }
      await mongoServer.stop();
    },
    async reset() {
      if (connection.readyState !== 0) {
        await connection.dropDatabase();
      }
      if (globalConnection && globalConnection.readyState !== 0) {
        await globalConnection.dropDatabase();
      }
    },
  };
}

function getOrCreateModel(connection, name, schema, collection) {
  return connection.models[name] || connection.model(name, schema, collection);
}

module.exports = {
  createMongoMemoryConnection,
  getOrCreateModel,
};
