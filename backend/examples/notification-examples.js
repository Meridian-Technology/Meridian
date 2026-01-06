const NotificationService = require('../services/notificationService');
const mongoose = require('mongoose');

// Example usage of the notification system
class NotificationExamples {
    constructor() {
        this.notificationService = new NotificationService();
    }
    
    /**
     * Example 1: Welcome notification for new users
     */
    async createWelcomeNotification(userId, userName) {
        try {
            const notification = await this.notificationService.createSystemNotification(
                userId,
                'User',
                'welcome',
                { name: userName }
            );
            
            console.log('Welcome notification created:', notification._id);
            return notification;
        } catch (error) {
            console.error('Error creating welcome notification:', error);
        }
    }
    
    /**
     * Example 2: Organization invitation
     */
    async createOrgInvitation(userId, orgId, orgName, role, invitationId) {
        try {
            const notification = await this.notificationService.createNotification({
                recipient: userId,
                recipientModel: 'User',
                title: 'Organization Invitation',
                message: `You have been invited to join ${orgName} as ${role}.`,
                type: 'membership',
                priority: 'high',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'accept_invitation',
                        label: 'Accept',
                        type: 'api_call',
                        url: '/api/org/invitations/accept',
                        method: 'POST',
                        payload: { invitationId: invitationId },
                        style: 'success',
                        order: 1
                    },
                    {
                        id: 'decline_invitation',
                        label: 'Decline',
                        type: 'api_call',
                        url: '/api/org/invitations/decline',
                        method: 'POST',
                        payload: { invitationId: invitationId },
                        style: 'secondary',
                        order: 2
                    },
                    {
                        id: 'view_org',
                        label: 'View Organization',
                        type: 'link',
                        url: `/orgs/${orgId}`,
                        style: 'info',
                        order: 3
                    }
                ],
                metadata: {
                    orgId: orgId,
                    orgName: orgName,
                    invitationId: invitationId,
                    role: role,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
                }
            });
            
            console.log('Organization invitation created:', notification._id);
            return notification;
        } catch (error) {
            console.error('Error creating org invitation:', error);
        }
    }
    
    /**
     * Example 3: Event reminder for organization members
     */
    async createEventReminder(orgId, eventId, eventName, eventTime) {
        try {
            const notifications = await this.notificationService.sendToOrgMembers(
                orgId,
                {
                    title: 'Event Reminder',
                    message: `Don't forget! "${eventName}" starts at ${eventTime}.`,
                    type: 'reminder',
                    priority: 'high',
                    channels: ['in_app', 'push'],
                    actions: [
                        {
                            id: 'view_event',
                            label: 'View Event',
                            type: 'link',
                            url: `/events/${eventId}`,
                            style: 'primary',
                            order: 1
                        },
                        {
                            id: 'add_to_calendar',
                            label: 'Add to Calendar',
                            type: 'api_call',
                            url: '/api/events/add-to-calendar',
                            method: 'POST',
                            payload: { eventId: eventId },
                            style: 'info',
                            order: 2
                        }
                    ],
                    metadata: {
                        eventId: eventId,
                        eventName: eventName,
                        eventTime: eventTime,
                        reminderType: 'pre_event'
                    }
                },
                { roles: ['member', 'officer', 'admin'] }
            );
            
            console.log(`Event reminder sent to ${notifications.length} members`);
            return notifications;
        } catch (error) {
            console.error('Error creating event reminder:', error);
        }
    }
    
    /**
     * Example 4: Achievement notification
     */
    async createAchievementNotification(userId, badgeId, badgeName, achievementType) {
        try {
            const notification = await this.notificationService.createNotification({
                recipient: userId,
                recipientModel: 'User',
                title: 'Achievement Unlocked! 🏆',
                message: `Congratulations! You've earned the "${badgeName}" ${achievementType}.`,
                type: 'achievement',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'view_badge',
                        label: 'View Badge',
                        type: 'link',
                        url: `/badges/${badgeId}`,
                        style: 'success',
                        order: 1
                    },
                    {
                        id: 'share_achievement',
                        label: 'Share Achievement',
                        type: 'api_call',
                        url: '/api/achievements/share',
                        method: 'POST',
                        payload: { 
                            badgeId: badgeId,
                            platform: 'social'
                        },
                        style: 'info',
                        order: 2
                    }
                ],
                metadata: {
                    badgeId: badgeId,
                    badgeName: badgeName,
                    achievementType: achievementType,
                    unlockedAt: new Date()
                }
            });
            
            console.log('Achievement notification created:', notification._id);
            return notification;
        } catch (error) {
            console.error('Error creating achievement notification:', error);
        }
    }
    
    /**
     * Example 5: Security alert
     */
    async createSecurityAlert(userId, loginLocation, deviceType) {
        try {
            const notification = await this.notificationService.createNotification({
                recipient: userId,
                recipientModel: 'User',
                title: '🔒 Security Alert',
                message: `New login detected from ${deviceType} in ${loginLocation}.`,
                type: 'security',
                priority: 'urgent',
                channels: ['in_app', 'email', 'sms'],
                actions: [
                    {
                        id: 'review_login',
                        label: 'Review Login',
                        type: 'link',
                        url: '/security/login-activity',
                        style: 'warning',
                        order: 1
                    },
                    {
                        id: 'secure_account',
                        label: 'Secure Account',
                        type: 'link',
                        url: '/security/settings',
                        style: 'danger',
                        order: 2
                    },
                    {
                        id: 'this_was_me',
                        label: 'This Was Me',
                        type: 'api_call',
                        url: '/api/security/confirm-login',
                        method: 'POST',
                        payload: { 
                            location: loginLocation,
                            deviceType: deviceType,
                            confirmed: true
                        },
                        style: 'success',
                        order: 3
                    }
                ],
                metadata: {
                    loginLocation: loginLocation,
                    deviceType: deviceType,
                    timestamp: new Date(),
                    ipAddress: '192.168.1.1', // Example
                    userAgent: 'Mozilla/5.0...' // Example
                }
            });
            
            console.log('Security alert created:', notification._id);
            return notification;
        } catch (error) {
            console.error('Error creating security alert:', error);
        }
    }
    
    /**
     * Example 6: Study session reminder
     */
    async createStudyReminder(userId, courseName, studyTime) {
        try {
            const notification = await this.notificationService.createNotification({
                recipient: userId,
                recipientModel: 'User',
                title: '📚 Study Time!',
                message: `Time to study ${courseName}. Your scheduled study session starts now.`,
                type: 'reminder',
                priority: 'normal',
                channels: ['in_app', 'push'],
                actions: [
                    {
                        id: 'start_study_session',
                        label: 'Start Session',
                        type: 'link',
                        url: `/study/session?course=${encodeURIComponent(courseName)}`,
                        style: 'primary',
                        order: 1
                    },
                    {
                        id: 'reschedule',
                        label: 'Reschedule',
                        type: 'api_call',
                        url: '/api/study/reschedule',
                        method: 'POST',
                        payload: { 
                            courseName: courseName,
                            originalTime: studyTime
                        },
                        style: 'secondary',
                        order: 2
                    },
                    {
                        id: 'skip_session',
                        label: 'Skip Today',
                        type: 'api_call',
                        url: '/api/study/skip-session',
                        method: 'POST',
                        payload: { 
                            courseName: courseName,
                            date: new Date().toISOString()
                        },
                        style: 'info',
                        order: 3
                    }
                ],
                metadata: {
                    courseName: courseName,
                    studyTime: studyTime,
                    sessionType: 'scheduled',
                    duration: 60 // minutes
                }
            });
            
            console.log('Study reminder created:', notification._id);
            return notification;
        } catch (error) {
            console.error('Error creating study reminder:', error);
        }
    }
    
    /**
     * Example 7: Batch notifications for system maintenance
     */
    async createMaintenanceNotification(userIds) {
        try {
            const notifications = userIds.map(userId => ({
                recipient: userId,
                recipientModel: 'User',
                title: '🛠️ Scheduled Maintenance',
                message: 'Study Compass will be undergoing maintenance on Sunday from 2-4 AM EST. Some features may be temporarily unavailable.',
                type: 'system',
                priority: 'normal',
                channels: ['in_app', 'email'],
                actions: [
                    {
                        id: 'view_status',
                        label: 'View Status',
                        type: 'link',
                        url: '/status',
                        style: 'info',
                        order: 1
                    }
                ],
                metadata: {
                    maintenanceType: 'scheduled',
                    startTime: '2024-01-14T02:00:00Z',
                    endTime: '2024-01-14T04:00:00Z',
                    affectedFeatures: ['chat', 'file_upload']
                }
            }));
            
            const result = await this.notificationService.createBatchNotifications(notifications);
            console.log(`Maintenance notification sent to ${result.length} users`);
            return result;
        } catch (error) {
            console.error('Error creating maintenance notifications:', error);
        }
    }
    
    /**
     * Example 8: Custom notification with form action
     */
    async createFeedbackRequest(userId, sessionId) {
        try {
            const notification = await this.notificationService.createNotification({
                recipient: userId,
                recipientModel: 'User',
                title: '💭 How was your study session?',
                message: 'We\'d love to hear about your recent study session to help improve your experience.',
                type: 'custom',
                priority: 'low',
                channels: ['in_app'],
                actions: [
                    {
                        id: 'provide_feedback',
                        label: 'Give Feedback',
                        type: 'form',
                        url: '/feedback/form',
                        style: 'primary',
                        order: 1
                    },
                    {
                        id: 'remind_later',
                        label: 'Remind Me Later',
                        type: 'api_call',
                        url: '/api/feedback/remind-later',
                        method: 'POST',
                        payload: { 
                            sessionId: sessionId,
                            delay: 24 // hours
                        },
                        style: 'secondary',
                        order: 2
                    },
                    {
                        id: 'dismiss',
                        label: 'Dismiss',
                        type: 'api_call',
                        url: '/api/feedback/dismiss',
                        method: 'POST',
                        payload: { sessionId: sessionId },
                        style: 'info',
                        order: 3
                    }
                ],
                metadata: {
                    sessionId: sessionId,
                    feedbackType: 'study_session',
                    requestType: 'voluntary'
                }
            });
            
            console.log('Feedback request created:', notification._id);
            return notification;
        } catch (error) {
            console.error('Error creating feedback request:', error);
        }
    }
}

// Example usage
async function runExamples() {
    // Connect to database (you'll need to set up your connection)
    // await mongoose.connect(process.env.MONGO_URL);
    
    const userId = new mongoose.Types.ObjectId();
    const orgId = new mongoose.Types.ObjectId();
    
    // For examples, we'll create a mock request object with models
    // In real usage, this would come from the request context
    const mockReq = {
        db: mongoose.connection // This would be the actual database connection
    };
    
    // Get models using the same pattern as the routes
    const getModels = require('../services/getModelService');
    const models = getModels(mockReq, 'Notification', 'User', 'Org');
    
    // Create instance of NotificationExamples with models
    const examples = new NotificationExamples();
    examples.notificationService = NotificationService.withModels(models);
    
    console.log('=== Notification System Examples ===\n');
    
    // Example 1: Welcome notification
    console.log('1. Creating welcome notification...');
    await examples.createWelcomeNotification(userId, 'John Doe');
    
    // Example 2: Organization invitation
    console.log('\n2. Creating organization invitation...');
    await examples.createOrgInvitation(
        userId, 
        orgId, 
        'Computer Science Club', 
        'member',
        'invitation_123'
    );
    
    // Example 3: Event reminder
    console.log('\n3. Creating event reminder...');
    await examples.createEventReminder(
        orgId,
        'event_456',
        'Weekly Study Group',
        '7:00 PM'
    );
    
    // Example 4: Achievement notification
    console.log('\n4. Creating achievement notification...');
    await examples.createAchievementNotification(
        userId,
        'badge_789',
        'Study Streak',
        'badge'
    );
    
    // Example 5: Security alert
    console.log('\n5. Creating security alert...');
    await examples.createSecurityAlert(
        userId,
        'New York, NY',
        'Mobile Device'
    );
    
    // Example 6: Study reminder
    console.log('\n6. Creating study reminder...');
    await examples.createStudyReminder(
        userId,
        'Advanced Mathematics',
        '3:00 PM'
    );
    
    // Example 7: Batch maintenance notification
    console.log('\n7. Creating batch maintenance notifications...');
    const userIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
    ];
    await examples.createMaintenanceNotification(userIds);
    
    // Example 8: Feedback request
    console.log('\n8. Creating feedback request...');
    await examples.createFeedbackRequest(userId, 'session_101');
    
    console.log('\n=== Examples completed ===');
}

// Uncomment to run examples
// runExamples().catch(console.error);

module.exports = NotificationExamples; 