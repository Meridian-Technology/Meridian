const getModels = require('./getModelService');

class FeedbackService {
    constructor(req) {
        this.req = req;
        this.models = getModels(req, 'UniversalFeedback', 'FeedbackConfig', 'SystemVersion', 'User');
    }

    // Get current system version
    async getCurrentSystemVersion() {
        const { SystemVersion } = this.models;
        
        let currentVersion = await SystemVersion.getCurrentVersion();
        
        // Initialize default version if none exists
        if (!currentVersion) {
            currentVersion = await SystemVersion.initializeDefaultVersion();
        }
        
        return currentVersion.version;
    }

    // Get feedback configuration for a feature
    async getFeedbackConfig(feature, userType = 'all') {
        const { FeedbackConfig } = this.models;
        
        const configs = await FeedbackConfig.getActiveConfig(feature, userType);
        const selectedConfig = FeedbackConfig.selectConfigForUser(configs);
        
        return selectedConfig;
    }

    // Submit feedback
    async submitFeedback(userId, feature, processId, responses, metadata = {}) {
        const { UniversalFeedback, FeedbackConfig } = this.models;
        
        // Get current system version
        const systemVersion = await this.getCurrentSystemVersion();
        
        // Get feedback configuration to validate responses
        const config = await this.getFeedbackConfig(feature);
        
        if (!config) {
            throw new Error(`No feedback configuration found for feature: ${feature}`);
        }
        
        // Validate responses against configuration
        const validationErrors = config.validateResponse(responses);
        if (validationErrors.length > 0) {
            throw new Error(`Validation errors: ${validationErrors.join(', ')}`);
        }
        
        // Check for existing feedback (prevent duplicates)
        const existingFeedback = await UniversalFeedback.findOne({
            user: userId,
            feature,
            processId
        });
        
        if (existingFeedback) {
            // Update existing feedback
            existingFeedback.responses = responses;
            existingFeedback.systemVersion = systemVersion;
            existingFeedback.feedbackVersion = config.version;
            existingFeedback.metadata = { ...existingFeedback.metadata, ...metadata };
            existingFeedback.submittedAt = new Date();
            
            return existingFeedback.save();
        } else {
            // Create new feedback
            const feedback = new UniversalFeedback({
                user: userId,
                feature,
                processId,
                systemVersion,
                feedbackVersion: config.version,
                responses,
                metadata,
                submittedAt: new Date()
            });
            
            return feedback.save();
        }
    }

    // Get feedback for a specific process (admin only)
    async getProcessFeedback(feature, processId) {
        const { UniversalFeedback } = this.models;
        
        const feedback = await UniversalFeedback.find({
            feature,
            processId
        })
        .populate('user', 'name email')
        .sort({ submittedAt: -1 });
        
        return feedback;
    }

    // Get aggregated feedback statistics
    async getFeedbackStats(feature, processId = null) {
        const { UniversalFeedback } = this.models;
        
        const stats = await UniversalFeedback.getFeatureStats(feature, processId);
        return stats;
    }

    // Get version comparison stats (for A/B testing)
    async getVersionStats(feature, systemVersion) {
        const { UniversalFeedback } = this.models;
        
        const stats = await UniversalFeedback.getVersionStats(feature, systemVersion);
        return stats;
    }

    // Create default feedback configurations
    async initializeDefaultConfigs(userId) {
        const { FeedbackConfig, SystemVersion } = this.models;
        const systemVersion = await this.getCurrentSystemVersion();
        
        // Study Session feedback configuration
        const studySessionConfig = new FeedbackConfig({
            feature: 'studySession',
            version: 'v1.0',
            systemVersion,
            name: 'Study Session Feedback',
            description: 'Collect feedback after study sessions',
            fields: [
                {
                    fieldId: 'wasPositive',
                    fieldType: 'boolean',
                    label: 'Was this a positive experience?',
                    description: 'Tell us if you found this study session helpful',
                    required: true,
                    order: 1
                },
                {
                    fieldId: 'suggestions',
                    fieldType: 'text',
                    label: 'Suggestions for improvement',
                    description: 'How can we make study sessions better?',
                    required: false,
                    validation: {
                        maxLength: 1000
                    },
                    order: 2
                },
                {
                    fieldId: 'rating',
                    fieldType: 'rating',
                    label: 'Overall rating',
                    description: 'Rate your overall experience',
                    required: false,
                    validation: {
                        min: 1,
                        max: 5
                    },
                    order: 3
                }
            ],
            isActive: true,
            weight: 100,
            targetUsers: 'all',
            createdBy: userId
        });
        
        // Event feedback configuration
        const eventConfig = new FeedbackConfig({
            feature: 'event',
            version: 'v1.0',
            systemVersion,
            name: 'Event Feedback',
            description: 'Collect feedback after events',
            fields: [
                {
                    fieldId: 'wasHelpful',
                    fieldType: 'boolean',
                    label: 'Was this event helpful?',
                    required: true,
                    order: 1
                },
                {
                    fieldId: 'rating',
                    fieldType: 'rating',
                    label: 'Event rating',
                    description: 'Rate this event from 1 to 5',
                    required: true,
                    validation: {
                        min: 1,
                        max: 5
                    },
                    order: 2
                },
                {
                    fieldId: 'comments',
                    fieldType: 'text',
                    label: 'Additional comments',
                    required: false,
                    validation: {
                        maxLength: 500
                    },
                    order: 3
                }
            ],
            isActive: true,
            weight: 100,
            targetUsers: 'all',
            createdBy: userId
        });
        
        // Save configurations if they don't exist
        const existingStudySession = await FeedbackConfig.findOne({ 
            feature: 'studySession', 
            version: 'v1.0' 
        });
        
        const existingEvent = await FeedbackConfig.findOne({ 
            feature: 'event', 
            version: 'v1.0' 
        });
        
        const results = [];
        
        if (!existingStudySession) {
            results.push(await studySessionConfig.save());
        }
        
        if (!existingEvent) {
            results.push(await eventConfig.save());
        }
        
        return results;
    }

    // Get feedback form configuration for frontend
    async getFeedbackForm(feature, userType = 'all') {
        const config = await this.getFeedbackConfig(feature, userType);
        
        if (!config) {
            return null;
        }
        
        // Return only the necessary information for rendering the form
        return {
            feature,
            version: config.version,
            name: config.name,
            description: config.description,
            fields: config.fields.sort((a, b) => a.order - b.order)
        };
    }

    // Check if user has already submitted feedback
    async hasUserSubmittedFeedback(userId, feature, processId) {
        const { UniversalFeedback } = this.models;
        
        const existing = await UniversalFeedback.findOne({
            user: userId,
            feature,
            processId
        });
        
        return !!existing;
    }

    // Get user's feedback history
    async getUserFeedbackHistory(userId, feature = null, limit = 20, skip = 0) {
        const { UniversalFeedback } = this.models;
        
        const query = { user: userId };
        if (feature) {
            query.feature = feature;
        }
        
        const feedback = await UniversalFeedback.find(query)
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('feature processId responses systemVersion feedbackVersion submittedAt');
        
        return feedback;
    }
}

module.exports = FeedbackService;
