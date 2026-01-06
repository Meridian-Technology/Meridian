# Study Compass Notification System

A comprehensive, flexible notification system designed for the Study Compass platform that supports both user and organization notifications with rich actions, multiple delivery channels, and advanced status management.

## 🚀 Features

### ✅ **Maximum Flexibility**
- **Dual Recipients**: Send to individual users or entire organizations
- **Rich Actions**: Buttons, links, forms, and API calls with custom payloads
- **Multiple Channels**: In-app, email, push, SMS, and webhook delivery
- **Status Management**: Unread, read, acknowledged, archived, deleted
- **Priority Levels**: Low, normal, high, urgent
- **Template System**: Reusable notification templates with variable interpolation

### ✅ **Advanced Capabilities**
- **Batch Operations**: Send to multiple recipients efficiently
- **Scheduled Delivery**: Future-dated notifications
- **Expiration**: Auto-archive expired notifications
- **Threading**: Group related notifications
- **Soft Delete**: Preserve data while hiding from users
- **Metadata Storage**: Flexible context data for each notification

## 📁 File Structure

```
backend/
├── schemas/
│   └── notification.js          # MongoDB schema with indexes
├── models/
│   └── Notification.js          # Mongoose model
├── services/
│   └── notificationService.js   # Business logic service
├── routes/
│   └── notificationRoutes.js    # REST API endpoints
├── examples/
│   └── notification-examples.js # Usage examples
└── app.js                       # Main app (updated with routes)

documentation/
└── notifications-system.md      # Comprehensive documentation
```

## 🛠️ Installation & Setup

### 1. **Add Routes to App**
The notification routes are already integrated into `app.js`:

```javascript
const notificationRoutes = require('./routes/notificationRoutes.js');
app.use('/api/notifications', notificationRoutes);
```

### 2. **Database Migration**
The system uses MongoDB with Mongoose. The schema includes optimized indexes for performance.

### 3. **Dependencies**
Ensure these packages are installed:
```bash
npm install express-validator mongoose
```

## 📖 Quick Start

### Basic Notification Creation
```javascript
const notificationService = require('./services/notificationService');

// Create a simple notification
const notification = await notificationService.createNotification({
    recipient: userId,
    recipientModel: 'User',
    title: 'Welcome!',
    message: 'Welcome to Study Compass!',
    type: 'system',
    priority: 'normal',
    channels: ['in_app', 'email']
});
```

### System Template Usage
```javascript
// Use built-in templates
await notificationService.createSystemNotification(
    userId,
    'User',
    'welcome',
    { name: 'John Doe' }
);
```

### Organization Notifications
```javascript
// Send to all org members
await notificationService.sendToOrgMembers(
    orgId,
    {
        title: 'Meeting Reminder',
        message: 'Don\'t forget about tomorrow\'s meeting!',
        type: 'reminder',
        priority: 'high'
    },
    { roles: ['admin', 'officer'] } // Optional role filtering
);
```

## 🔌 API Endpoints

### Core Endpoints
- `GET /api/notifications` - Get user notifications
- `GET /api/notifications/unread-count` - Get unread count
- `GET /api/notifications/statistics` - Get notification stats
- `POST /api/notifications` - Create notification (admin)
- `POST /api/notifications/system` - Create system notification
- `POST /api/notifications/org/:orgId` - Send to organization

### Status Management
- `PATCH /api/notifications/:id/read` - Mark as read
- `PATCH /api/notifications/read-multiple` - Mark multiple as read
- `PATCH /api/notifications/read-all` - Mark all as read
- `PATCH /api/notifications/:id/acknowledge` - Acknowledge
- `PATCH /api/notifications/:id/archive` - Archive
- `DELETE /api/notifications/:id` - Soft delete

### Actions
- `POST /api/notifications/:id/actions/:actionId` - Execute action

## 🎯 Use Cases

### 1. **User Onboarding**
```javascript
// Welcome new users
await notificationService.createSystemNotification(
    newUserId,
    'User',
    'welcome',
    { name: user.name }
);
```

### 2. **Organization Management**
```javascript
// Invite users to organizations
await notificationService.createNotification({
    recipient: userId,
    recipientModel: 'User',
    title: 'Organization Invitation',
    message: `You've been invited to join ${orgName}`,
    type: 'membership',
    priority: 'high',
    actions: [
        {
            id: 'accept',
            label: 'Accept',
            type: 'api_call',
            url: '/api/org/invitations/accept',
            method: 'POST',
            payload: { invitationId: invitationId }
        }
    ]
});
```

### 3. **Study Reminders**
```javascript
// Send study session reminders
await notificationService.createNotification({
    recipient: userId,
    recipientModel: 'User',
    title: '📚 Study Time!',
    message: `Time to study ${courseName}`,
    type: 'reminder',
    channels: ['in_app', 'push'],
    actions: [
        {
            id: 'start_session',
            label: 'Start Session',
            type: 'link',
            url: `/study/session?course=${courseName}`
        }
    ]
});
```

### 4. **Security Alerts**
```javascript
// Security notifications
await notificationService.createNotification({
    recipient: userId,
    recipientModel: 'User',
    title: '🔒 Security Alert',
    message: 'New login detected from unrecognized device',
    type: 'security',
    priority: 'urgent',
    channels: ['in_app', 'email', 'sms'],
    actions: [
        {
            id: 'review_login',
            label: 'Review Login',
            type: 'link',
            url: '/security/login-activity'
        }
    ]
});
```

## 🔧 Configuration

### Environment Variables
```bash
# Optional: Enable debug logging
NOTIFICATION_DEBUG=true

# Email service (for email notifications)
EMAIL_SERVICE_API_KEY=your_email_service_key

# Push notification service
PUSH_SERVICE_KEY=your_push_service_key

# SMS service
SMS_SERVICE_KEY=your_sms_service_key
```

### Custom Templates
Add custom templates to the `loadTemplate` method in `notificationService.js`:

```javascript
const templates = {
    'custom_template': {
        title: 'Custom Title',
        message: 'Hello {{name}}, {{customMessage}}',
        version: '1.0',
        priority: 'normal',
        channels: ['in_app', 'email'],
        actions: [
            {
                id: 'custom_action',
                label: 'Custom Action',
                type: 'link',
                url: '/custom/path'
            }
        ]
    }
};
```

## 📊 Monitoring & Maintenance

### Cleanup Job
```javascript
// Run daily to archive expired notifications
const cleanupExpiredNotifications = async () => {
    const result = await notificationService.cleanupExpired();
    console.log(`Archived ${result.modifiedCount} expired notifications`);
};

// Schedule with cron or similar
setInterval(cleanupExpiredNotifications, 24 * 60 * 60 * 1000);
```

### Analytics
```javascript
// Get notification statistics
const stats = await notificationService.getStatistics(userId, 'User');
console.log('Stats:', stats);
// Output: { total: 150, unread: 5, read: 120, acknowledged: 20, archived: 5 }
```

## 🚀 Performance Optimizations

### Database Indexes
The schema includes optimized indexes for:
- Recipient + status queries
- Type-based filtering
- Expiration date queries
- Thread grouping
- Batch operations

### Batch Operations
Use batch operations for multiple notifications:
```javascript
const notifications = await notificationService.createBatchNotifications([
    { recipient: user1Id, title: 'Notification 1', ... },
    { recipient: user2Id, title: 'Notification 2', ... }
]);
```

## 🔒 Security Features

- **Input Validation**: All inputs validated with express-validator
- **Permission Checks**: Admin-only endpoints for notification creation
- **Soft Delete**: Data preservation with user-facing deletion
- **Rate Limiting**: Built-in protection against spam
- **Audit Trail**: Timestamps for all status changes

## 🧪 Testing

### Run Examples
```bash
cd backend
node examples/notification-examples.js
```

### API Testing
Use the provided endpoints with tools like Postman or curl:

```bash
# Get notifications
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5001/api/notifications

# Create notification (admin only)
curl -X POST -H "Authorization: Bearer ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"recipient":"user_id","recipientModel":"User","title":"Test","message":"Test message","type":"system"}' \
     http://localhost:5001/api/notifications
```

## 📚 Documentation

For detailed documentation, see:
- `documentation/notifications-system.md` - Comprehensive system documentation
- `backend/examples/notification-examples.js` - Practical usage examples
- API endpoints documentation in `notificationRoutes.js`

## 🤝 Contributing

When adding new features:

1. **Update Schema**: Add new fields to `notification.js` schema
2. **Extend Service**: Add methods to `notificationService.js`
3. **Add Routes**: Create new endpoints in `notificationRoutes.js`
4. **Update Examples**: Add usage examples to `notification-examples.js`
5. **Document**: Update documentation in `notifications-system.md`

## 📄 License

This notification system is part of the Study Compass platform and follows the same licensing terms.

---

**Ready to use!** The notification system is fully integrated and ready for production use. Check the examples and documentation for specific implementation details. 