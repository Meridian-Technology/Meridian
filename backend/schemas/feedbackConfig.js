const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Field definition schema for configurable feedback forms
const fieldDefinitionSchema = new Schema({
    fieldId: { 
        type: String, 
        required: true,
        trim: true
    }, // e.g., 'wasPositive', 'suggestions', 'rating'
    
    fieldType: { 
        type: String, 
        required: true,
        enum: ['boolean', 'text', 'number', 'rating', 'multipleChoice', 'checkbox', 'scale']
    },
    
    label: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 100
    },
    
    description: { 
        type: String,
        trim: true,
        maxlength: 200
    },
    
    required: { 
        type: Boolean, 
        default: false 
    },
    
    validation: {
        minLength: { type: Number },
        maxLength: { type: Number },
        min: { type: Number },
        max: { type: Number },
        pattern: { type: String }, // regex pattern
        options: [{ type: String }] // for multipleChoice/checkbox
    },
    
    defaultValue: { type: Schema.Types.Mixed },
    
    order: { 
        type: Number, 
        default: 0 
    }, // Display order
    
    conditional: {
        dependsOn: { type: String }, // fieldId it depends on
        showWhen: { type: Schema.Types.Mixed } // value(s) that trigger display
    }
}, { _id: false });

const feedbackConfigSchema = new Schema({
    // Configuration identification
    feature: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 50
    }, // 'studySession', 'event', 'org', etc.
    
    version: { 
        type: String, 
        required: true,
        trim: true
    }, // e.g., 'v1.0', 'v1.1-beta', 'v2.0-test'
    
    systemVersion: { 
        type: String, 
        required: true,
        default: '1.2'
    }, // Current system version
    
    // Configuration details
    name: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 100
    },
    
    description: { 
        type: String,
        trim: true,
        maxlength: 500
    },
    
    // Form fields configuration
    fields: [fieldDefinitionSchema],
    
    // A/B Testing configuration
    isActive: { 
        type: Boolean, 
        default: true 
    },
    
    weight: { 
        type: Number, 
        default: 100,
        min: 0,
        max: 100
    }, // Weight for A/B testing (percentage)
    
    // Targeting
    targetUsers: {
        type: String,
        enum: ['all', 'authenticated', 'new', 'returning', 'beta'],
        default: 'all'
    },
    
    // Metadata
    createdBy: { 
        type: Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    
    activatedAt: { type: Date },
    deactivatedAt: { type: Date },
    
}, { 
    timestamps: true 
});

// Compound indexes
feedbackConfigSchema.index({ feature: 1, version: 1 }, { unique: true });
feedbackConfigSchema.index({ feature: 1, isActive: 1, weight: -1 });
feedbackConfigSchema.index({ systemVersion: 1 });

// Instance methods
feedbackConfigSchema.methods.isActiveFor = function(userType = 'all') {
    if (!this.isActive) return false;
    if (this.targetUsers === 'all') return true;
    return this.targetUsers === userType;
};

feedbackConfigSchema.methods.validateResponse = function(responses) {
    const errors = [];
    
    for (const field of this.fields) {
        const value = responses[field.fieldId];
        
        // Check required fields
        if (field.required && (value === undefined || value === null || value === '')) {
            errors.push(`${field.label} is required`);
            continue;
        }
        
        // Skip validation if field is empty and not required
        if (!field.required && (value === undefined || value === null || value === '')) {
            continue;
        }
        
        // Type-specific validation
        switch (field.fieldType) {
            case 'boolean':
                if (typeof value !== 'boolean') {
                    errors.push(`${field.label} must be true or false`);
                }
                break;
                
            case 'text':
                if (typeof value !== 'string') {
                    errors.push(`${field.label} must be text`);
                } else {
                    if (field.validation.minLength && value.length < field.validation.minLength) {
                        errors.push(`${field.label} must be at least ${field.validation.minLength} characters`);
                    }
                    if (field.validation.maxLength && value.length > field.validation.maxLength) {
                        errors.push(`${field.label} must be no more than ${field.validation.maxLength} characters`);
                    }
                    if (field.validation.pattern && !new RegExp(field.validation.pattern).test(value)) {
                        errors.push(`${field.label} format is invalid`);
                    }
                }
                break;
                
            case 'number':
            case 'rating':
            case 'scale':
                if (typeof value !== 'number') {
                    errors.push(`${field.label} must be a number`);
                } else {
                    if (field.validation.min !== undefined && value < field.validation.min) {
                        errors.push(`${field.label} must be at least ${field.validation.min}`);
                    }
                    if (field.validation.max !== undefined && value > field.validation.max) {
                        errors.push(`${field.label} must be no more than ${field.validation.max}`);
                    }
                }
                break;
                
            case 'multipleChoice':
                if (!field.validation.options.includes(value)) {
                    errors.push(`${field.label} must be one of: ${field.validation.options.join(', ')}`);
                }
                break;
                
            case 'checkbox':
                if (!Array.isArray(value)) {
                    errors.push(`${field.label} must be an array`);
                } else {
                    const invalidOptions = value.filter(v => !field.validation.options.includes(v));
                    if (invalidOptions.length > 0) {
                        errors.push(`${field.label} contains invalid options: ${invalidOptions.join(', ')}`);
                    }
                }
                break;
        }
    }
    
    return errors;
};

// Static methods
feedbackConfigSchema.statics.getActiveConfig = function(feature, userType = 'all') {
    return this.find({
        feature,
        isActive: true,
        targetUsers: { $in: [userType, 'all'] }
    }).sort({ weight: -1, createdAt: -1 });
};

feedbackConfigSchema.statics.selectConfigForUser = function(configs) {
    if (configs.length === 0) return null;
    if (configs.length === 1) return configs[0];
    
    // Weighted random selection for A/B testing
    const totalWeight = configs.reduce((sum, config) => sum + config.weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const config of configs) {
        currentWeight += config.weight;
        if (random <= currentWeight) {
            return config;
        }
    }
    
    return configs[0]; // Fallback
};

module.exports = feedbackConfigSchema;
