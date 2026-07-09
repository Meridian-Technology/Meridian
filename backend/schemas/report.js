const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const reportSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    type: {
        type: String, // right now only has incorrectData
        required: true
    },
    report: {
        type: Object,
        required: true
    },
});


// const Report = mongoose.model('Reports', reportSchema, 'reports');

module.exports = reportSchema;