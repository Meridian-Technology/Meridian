const mongoose = require('mongoose');
const schema = new mongoose.Schema({ name: { type: String } }, { strict: false });
module.exports = schema;
