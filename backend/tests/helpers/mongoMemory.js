const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function createMongoMemoryConnection() {
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri('meridian_test');
  const connection = await mongoose.createConnection(uri).asPromise();

  return {
    mongoServer,
    connection,
    async cleanup() {
      if (connection.readyState !== 0) {
        await connection.dropDatabase();
        await connection.close();
      }
      await mongoServer.stop();
    },
    async reset() {
      if (connection.readyState !== 0) {
        await connection.dropDatabase();
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
