const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const systemVersionSchema = new Schema({
    // Minimal version information
    version: { 
        type: String, 
        required: true,
        unique: true,
        trim: true
    }, // e.g., "1.2", "1.3", "2.0"
    
    activatedAt: { 
        type: Date, 
        default: Date.now 
    } // When this version became active
    
}, { 
    timestamps: false // We don't need createdAt/updatedAt since we only track activatedAt
});

// Index
systemVersionSchema.index({ version: 1 }, { unique: true });

// Static methods
systemVersionSchema.statics.getCurrentVersion = function() {
    return this.findOne().sort({ activatedAt: -1 });
};

systemVersionSchema.statics.setCurrentVersion = async function(versionString) {
    // Create new version entry
    const newVersion = new this({
        version: versionString,
        activatedAt: new Date()
    });
    
    return newVersion.save();
};

systemVersionSchema.statics.initializeDefaultVersion = async function() {
    const existing = await this.findOne();
    
    if (!existing) {
        const defaultVersion = new this({
            version: '1.2',
            activatedAt: new Date()
        });
        
        return defaultVersion.save();
    }
    
    return existing;
};

module.exports = systemVersionSchema;
