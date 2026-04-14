const mongoose = require('mongoose');

const globalUserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    name: {
        type: String,
        trim: true,
    },
    picture: {
        type: String,
        trim: true,
    },
    googleId: {
        type: String,
        required: false,
        trim: true,
        sparse: true,
    },
    appleId: {
        type: String,
        required: false,
        trim: true,
        sparse: true,
    },
    samlId: {
        type: String,
        required: false,
        trim: true,
        sparse: true,
    },
    samlProvider: {
        type: String,
        required: false,
        trim: true,
    },
}, {
    timestamps: true,
});

globalUserSchema.index({ email: 1 }, { unique: true });
globalUserSchema.index({ googleId: 1 }, { sparse: true });
globalUserSchema.index({ appleId: 1 }, { sparse: true });
globalUserSchema.index({ samlId: 1, samlProvider: 1 }, { sparse: true });

module.exports = globalUserSchema;
