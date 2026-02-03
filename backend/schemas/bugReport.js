const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const bugReportSchema = new Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Interface', 'Authentication']
    },
    image: [{
        type: String,
        required: false,
    }],
    status: {
        type: String,
        required: true,
        enum: ['Unseen', 'In Progress', 'Resolved'],
        default: 'Unseen',
    },
    platformDetails:{
        device: {
            type: String,
        },
        ip: {
            type: String,
        },
        browser: {
            trype: String,
        }
    }
})

module.exports = bugReportSchema;