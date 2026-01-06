const mongoose = require('mongoose');

const defaultVerificationTiers = {
            basic: {
                name: 'Basic Verification',
                description: 'Standard organization verification',
                color: '#4caf50',
                icon: 'mdi:shield-check',
                requirements: {
                    minMembers: 5,
                    minAge: 30, // days
                    requiredDocuments: ['constitution', 'member_list']
                },
                benefits: ['event_creation', 'member_management']
            },
            premium: {
                name: 'Premium Verification',
                description: 'Enhanced verification with additional benefits',
                color: '#2196f3',
                icon: 'mdi:star',
                requirements: {
                    minMembers: 15,
                    minAge: 60,
                    requiredDocuments: ['constitution', 'member_list', 'financial_statement', 'faculty_advisor']
                },
                benefits: ['event_creation', 'member_management', 'funding_requests', 'space_reservation']
            },
            gold: {
                name: 'Gold Verification',
                description: 'High-level verification for established organizations',
                color: '#ff9800',
                icon: 'mdi:crown',
                requirements: {
                    minMembers: 25,
                    minAge: 90,
                    requiredDocuments: ['constitution', 'member_list', 'financial_statement', 'faculty_advisor', 'annual_report']
                },
                benefits: ['event_creation', 'member_management', 'funding_requests', 'space_reservation', 'priority_support']
            },
            platinum: {
                name: 'Platinum Verification',
                description: 'Premium verification for top-tier organizations',
                color: '#9c27b0',
                icon: 'mdi:diamond',
                requirements: {
                    minMembers: 50,
                    minAge: 180,
                    requiredDocuments: ['constitution', 'member_list', 'financial_statement', 'faculty_advisor', 'annual_report', 'strategic_plan']
                },
                benefits: ['event_creation', 'member_management', 'funding_requests', 'space_reservation', 'priority_support', 'exclusive_events']
            },
            official: {
                name: 'Official Recognition',
                description: 'Official university recognition',
                color: '#f44336',
                icon: 'mdi:school',
                requirements: {
                    minMembers: 30,
                    minAge: 365,
                    requiredDocuments: ['constitution', 'member_list', 'financial_statement', 'faculty_advisor', 'annual_report', 'university_approval']
                },
                benefits: ['all_features', 'university_funding', 'official_representation']
            },
            academic: {
                name: 'Academic Organization',
                description: 'Specialized verification for academic groups',
                color: '#607d8b',
                icon: 'mdi:book-open',
                requirements: {
                    minMembers: 10,
                    minAge: 30,
                    requiredDocuments: ['constitution', 'member_list', 'academic_advisor']
                },
                benefits: ['event_creation', 'member_management', 'academic_resources']
            },
            cultural: {
                name: 'Cultural Organization',
                description: 'Verification for cultural and diversity groups',
                color: '#795548',
                icon: 'mdi:account-group',
                requirements: {
                    minMembers: 8,
                    minAge: 30,
                    requiredDocuments: ['constitution', 'member_list', 'cultural_advisor']
                },
                benefits: ['event_creation', 'member_management', 'cultural_funding']
            },
            sports: {
                name: 'Sports Organization',
                description: 'Verification for athletic and sports groups',
                color: '#4caf50',
                icon: 'mdi:run',
                requirements: {
                    minMembers: 12,
                    minAge: 30,
                    requiredDocuments: ['constitution', 'member_list', 'coach_advisor']
                },
                benefits: ['event_creation', 'member_management', 'sports_facilities']
            },
            professional: {
                name: 'Professional Organization',
                description: 'Verification for career and professional development groups',
                color: '#ff5722',
                icon: 'mdi:briefcase',
                requirements: {
                    minMembers: 15,
                    minAge: 45,
                    requiredDocuments: ['constitution', 'member_list', 'career_advisor']
                },
                benefits: ['event_creation', 'member_management', 'career_resources', 'networking_events']
            }
};

const orgManagementConfigSchema = new mongoose.Schema({
    // Verification settings
    verificationEnabled: {
        type: Boolean,
        default: true
    },
    verificationRequired: {
        type: Boolean,
        default: false
    },
    // Allowed request types (feature flags - controls which request types can be submitted)
    allowedRequestTypes: {
        type: [String],
        enum: ['verification', 'feature_access', 'funding', 'space_reservation', 'event_approval', 'status_upgrade'],
        default: ['verification']
    },
    
    // Verification tiers/levels (the actual verification system - basic, premium, gold, etc.)
    verificationTiers: {
        type: mongoose.Schema.Types.Mixed,
        default: () => JSON.parse(JSON.stringify(defaultVerificationTiers))
    },
    
    // Auto-approval settings
    autoApproveNewOrgs: {
        type: Boolean,
        default: false
    },
    autoApproveThreshold: {
        type: Number,
        default: 0 // Minimum members required for auto-approval
    },
    
    // Verification type settings
    enableCustomVerificationTypes: {
        type: Boolean,
        default: true
    },
    defaultVerificationType: {
        type: String,
        default: 'basic'
    },
    autoUpgradeThreshold: {
        type: Number,
        default: 90 // Days after which organizations can request status upgrades
    },
    
    // Feature access control
    featureAccess: {
        eventCreation: {
            type: String,
            enum: ['all', 'verified_only', 'approved_only'],
            default: 'all'
        },
        memberManagement: {
            type: String,
            enum: ['all', 'verified_only', 'approved_only'],
            default: 'all'
        },
        fundingRequests: {
            type: String,
            enum: ['all', 'verified_only', 'approved_only'],
            default: 'verified_only'
        },
        spaceReservation: {
            type: String,
            enum: ['all', 'verified_only', 'approved_only'],
            default: 'verified_only'
        }
    },
    
    // Notification settings
    notifications: {
        newOrgRequest: {
            type: Boolean,
            default: true
        },
        verificationRequest: {
            type: Boolean,
            default: true
        },
        fundingRequest: {
            type: Boolean,
            default: true
        },
        spaceRequest: {
            type: Boolean,
            default: true
        }
    },
    
    // Review workflow
    reviewWorkflow: {
        requireMultipleApprovers: {
            type: Boolean,
            default: false
        },
        minApprovers: {
            type: Number,
            default: 1
        },
        autoEscalateAfterDays: {
            type: Number,
            default: 7
        }
    },
    
    // Reporting and analytics
    reporting: {
        enableAnalytics: {
            type: Boolean,
            default: true
        },
        retentionDays: {
            type: Number,
            default: 365
        },
        exportFormats: [{
            type: String,
            enum: ['csv', 'json', 'pdf']
        }]
    },
    
    // Custom fields for verification requests
    customVerificationFields: [{
        name: String,
        type: {
            type: String,
            enum: ['text', 'number', 'boolean', 'date', 'file', 'select']
        },
        required: Boolean,
        label: String,
        description: String,
        options: [String], // For select type
        validation: {
            min: Number,
            max: Number,
            pattern: String
        }
    }],
    
    // Org categories and tags
    orgCategories: [{
        name: String,
        description: String,
        color: String,
        icon: String
    }],
    
    // Compliance and policies
    policies: {
        maxMembersPerOrg: {
            type: Number,
            default: 100
        },
        maxEventsPerMonth: {
            type: Number,
            default: 10
        },
        requireFacultyAdvisor: {
            type: Boolean,
            default: false
        },
        minMeetingFrequency: {
            type: String,
            enum: ['weekly', 'biweekly', 'monthly', 'quarterly'],
            default: 'monthly'
        }
    },
    
    // Integration settings
    integrations: {
        calendarSync: {
            type: Boolean,
            default: false
        },
        emailNotifications: {
            type: Boolean,
            default: true
        },
        slackNotifications: {
            type: Boolean,
            default: false
        }
    },
    
    // Messaging/announcement system configuration
    messaging: {
        enabled: {
            type: Boolean,
            default: true
        },
        defaultCharacterLimit: {
            type: Number,
            default: 500,
            min: 100,
            max: 2000
        },
        maxCharacterLimit: {
            type: Number,
            default: 2000
        },
        minCharacterLimit: {
            type: Number,
            default: 100
        },
        defaultVisibility: {
            type: String,
            enum: ['members_only', 'members_and_followers', 'public'],
            default: 'members_and_followers'
        },
        moderationEnabled: {
            type: Boolean,
            default: false
        },
        requireProfanityFilter: {
            type: Boolean,
            default: true
        },
        allowEventMentions: {
            type: Boolean,
            default: true
        },
        allowLinks: {
            type: Boolean,
            default: true
        },
        notificationSettings: {
            notifyOnNewMessage: {
                type: Boolean,
                default: true
            },
            notifyOnMention: {
                type: Boolean,
                default: true
            },
            notifyOnReply: {
                type: Boolean,
                default: true
            }
        }
    }
}, { timestamps: true });

module.exports = orgManagementConfigSchema;
