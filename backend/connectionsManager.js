const mongoose = require('mongoose');
//load env
require('dotenv').config();

// Store active connections in a Map
const connectionPool = new Map();

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

const getDbUriForSchool = (school) => {
    const schoolDbMap = {
        // berkeley: process.env.MONGO_URI_BERKELEY,
        rpi: process.env.MONGO_URI_RPI,
        // Add more schools here
    };
    return schoolDbMap[school] || process.env.MONGODB_URI || process.env.DEFAULT_MONGO_URI;
};

module.exports = { connectToDatabase };
