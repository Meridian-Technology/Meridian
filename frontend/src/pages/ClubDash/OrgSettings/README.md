# Organization Settings Page

This component provides a comprehensive settings interface for organization management within the Study Compass platform.

## Features

### General Settings
- **Organization Name**: Edit the organization's display name
- **Description**: Update the organization's description (500 character limit)
- **Weekly Meeting Time**: Set or modify the regular meeting schedule

### Appearance
- **Profile Picture**: Upload and manage the organization's profile image
- Supports drag-and-drop and file browser upload
- Maximum file size: 5MB
- Automatic image preview

### Roles & Permissions
- **Role Management**: Create, edit, and delete custom roles
- **Permission Assignment**: Configure granular permissions for each role
- **Default Roles**: View and manage built-in roles (Owner, Admin, Officer, Member)
- **Permission Categories**:
  - View Events
  - Manage Events
  - Manage Members
  - Manage Roles
  - View Analytics
  - Manage Content
  - Send Announcements
  - View Finances
  - Manage Finances

### Danger Zone
- **Delete Organization**: Permanently delete the organization and all associated data
- Requires confirmation dialog
- Only available to organization owners

## Permissions

The settings page respects organization-level permissions:

- **Organization Owners**: Full access to all settings
- **Users with `manage_content` permission**: Can edit general settings and appearance
- **Users with `manage_roles` permission**: Can manage roles and permissions
- **Other members**: Read-only access to settings

## Technical Implementation

### Backend Integration
- Uses existing `/edit-org` endpoint for saving changes
- Supports multipart form data for image uploads
- Integrates with S3 image storage service
- Leverages existing role management endpoints

### Frontend Features
- Responsive design for mobile and desktop
- Real-time form validation
- Loading states and error handling
- Toast notifications for user feedback
- Permission-based UI rendering

### File Structure
```
Settings/
├── Settings.jsx          # Main component
├── Settings.scss         # Styles
└── README.md            # This documentation
```

## Usage

The Settings component is automatically integrated into the ClubDash dashboard and can be accessed via the "Settings" menu item in the navigation sidebar.

### Props
- `expandedClass`: CSS class for expanded/collapsed state
- `org`: Organization data object containing current settings

### Dependencies
- `@iconify-icon/react`: For icons
- `ImageUpload`: For file upload functionality
- `RoleManager`: For role management interface
- `apiRequest`: For API communication
- `useAuth`: For user authentication
- `useNotification`: For toast notifications

## Styling

The component uses SCSS with:
- CSS custom properties for theming
- Responsive breakpoints
- Consistent with Study Compass design system
- Green color scheme (`#4DAA57`) for primary actions
- Red color scheme (`#dc3545`) for danger actions

## Error Handling

- Network errors are caught and displayed as notifications
- Permission errors show appropriate warning messages
- Form validation prevents invalid submissions
- File upload errors are handled gracefully

## Future Enhancements

Potential improvements could include:
- Advanced notification settings
- Integration settings for third-party services
- Bulk member management
- Organization analytics and reporting
- Custom branding options
- Advanced security settings 