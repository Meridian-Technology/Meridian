const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: false,
        trim: true, // trims whitespace
    },
    appleId: {
        type: String,
        required: false,
        trim: true, // trims whitespace
    },
    // SAML-related fields
    samlId: {
        type: String,
        required: false,
        trim: true,
        sparse: true, // Allows multiple null values
    },
    samlProvider: {
        type: String,
        required: false,
        trim: true,
    },
    // SAML attributes (stored as JSON for flexibility)
    samlAttributes: {
        type: Map,
        of: String,
        default: new Map()
    },
    username: {
        type: String,
        required: false,
        unique: true,
        trim: true, // trims whitespace
        minlength: 3 // Minimum length of the username
    },
    name:{
        type:String,
        trim:true,
    },
    onboarded:{
        type: Boolean,
        default:false,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        // add validation for email
    },
    affiliatedEmail: {
        type: String,
        required: false,
        unique: true,
        trim: true,
        sparse: true // allows null/undefined values to not be considered for uniqueness
    },
    affiliatedEmailVerified: {
        type: Boolean,
        default: false
    },
    password: {
        type: String,
        required: false,
        minlength: 6 // minimum length of the password
    },
    picture: {
        type: String,
        required: false,
        trim: true
    },
    saved: {
        type: Array,
        default: [],
    },
    admin: {
        type: Boolean,
        default: false,
    },
    visited: {
        type: Array,
        default: [],
    },
    partners: {
        type: Number,
        default: 0,
    },
    sessions: {
        type: Array,
        default: [],
    }, 
    hours: {
        type: Number,
        default: 0,
    },
    contributions:{
        type:Number,
        default:0,
    }, 
    classroomPreferences:{
        type:String,
        default:"",
    },
    recommendationPreferences: {
        type:Number,
        default:3,
    },
    tags: {
        type:Array,
        default: [],
    },
    developer: {
        type: Number,
        default: 0,
    },
    darkModePreference: {
        type: Boolean,
        default: false,
    },
    roles: {
        type: [String],
        default: ['user'],
        enum: ['user', 'admin', 'moderator', 'developer', 'oie', 'beta'], // Adjust roles as needed
    },
    approvalRoles: {
        type: [String],
        default: [],
    },
    clubAssociations:[
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Org'
        }
    ],
    refreshToken: {
        type: String,
        required: false,
        default: null
    },
    pushToken: {
        type: String,
        required: false,
        default: null,
        trim: true
    },

    // Student attributes for admin outreach targeting (MER-155)
    studentProfile: {
        major: { type: String, trim: true, default: null },
        department: { type: String, trim: true, default: null },
        graduationYear: { type: Number, default: null },
        programType: { type: String, enum: ['undergraduate', 'graduate', 'professional', 'other', null], default: null },
        enrollmentStatus: { type: String, enum: ['active', 'leave', 'graduated', 'full-time', 'part-time', 'other', null], default: null }
    },

    // you can add more fields here if needed, like 'createdAt', 'updatedAt', etc.
}, {
    timestamps: true // automatically adds 'createdAt' and 'updatedAt' fields
});

// pre-save hook to hash the password
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
  });


// Indexes for performance optimization
userSchema.index({ email: 1 }); // For email lookups
userSchema.index({ googleId: 1 }); // For Google OAuth
userSchema.index({ appleId: 1 }); // For Apple Sign In
userSchema.index({ samlId: 1, samlProvider: 1 }); // For SAML authentication
userSchema.index({ username: 1 }); // For username lookups
userSchema.index({ roles: 1 }); // For role-based queries
userSchema.index({ approvalRoles: 1 }); // For approval role queries
userSchema.index({ admin: 1 }); // For admin queries
userSchema.index({ 'studentProfile.major': 1 });
userSchema.index({ 'studentProfile.department': 1 });
userSchema.index({ 'studentProfile.graduationYear': 1 });
userSchema.index({ 'studentProfile.programType': 1 });
userSchema.index({ 'studentProfile.enrollmentStatus': 1 });

module.exports = userSchema;