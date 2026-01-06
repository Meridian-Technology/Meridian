# Dashboard Component with Recursive Sub-Sidebar

The Dashboard component now supports recursive sub-sidebar navigation with a config option that maintains backward compatibility. The component has been updated to support a new pattern where elements are defined directly in the menu items structure.

## Features

- **Recursive Navigation**: Support for unlimited nested levels of sidebar navigation
- **Breadcrumb Navigation**: Visual breadcrumb trail showing current navigation path
- **Backward Compatibility**: Existing Dashboard usage remains unchanged
- **Smooth Transitions**: Animated transitions between sidebar levels
- **URL State Management**: Navigation state is preserved in URL parameters
- **New Element Pattern**: Elements can be defined directly in menu items

## Usage

### New Pattern (Recommended)

Elements are now defined directly in the menu items structure:

```jsx
const menuItems = [
    {
        label: 'Dashboard',
        icon: 'material-symbols:dashboard',
        element: <DashboardHome />
    },
    {
        label: 'Settings',
        icon: 'material-symbols:settings',
        element: <SettingsGeneral />,
        subItems: [
            {
                label: 'General',
                icon: 'material-symbols:settings-general',
                element: <SettingsGeneral />
            },
            {
                label: 'Security',
                icon: 'material-symbols:security',
                element: <SettingsSecurity />
            }
        ]
    }
];

<Dashboard
    menuItems={menuItems}
    logo={logo}
    primaryColor="#007bff"
    secondaryColor="rgba(0, 123, 255, 0.1)"
    enableSubSidebar={true}
/>
```

### Legacy Pattern (Still Supported)

Existing Dashboard usage continues to work exactly as before:

```jsx
const menuItems = [
    {
        label: 'Dashboard',
        icon: 'material-symbols:dashboard',
    },
    {
        label: 'Profile',
        icon: 'material-symbols:person',
    }
];

const children = [
    <DashboardHome key="dashboard" />,
    <UserProfile key="profile" />
];

<Dashboard
    menuItems={menuItems}
    children={children}
    logo={logo}
    primaryColor="#007bff"
    secondaryColor="rgba(0, 123, 255, 0.1)"
/>
```

### With Sub-Sidebar Enabled

To enable recursive sub-sidebar functionality, add the `enableSubSidebar` prop:

```jsx
<Dashboard
    menuItems={menuItems}
    logo={logo}
    primaryColor="#007bff"
    secondaryColor="rgba(0, 123, 255, 0.1)"
    enableSubSidebar={true}
/>
```

## Menu Structure

### Simple Menu Items (New Pattern)

```jsx
const menuItems = [
    {
        label: 'Dashboard',
        icon: 'material-symbols:dashboard',
        element: <DashboardHome />
    },
    {
        label: 'Profile',
        icon: 'material-symbols:person',
        element: <UserProfile />
    }
];
```

### Menu Items with Sub-Items (New Pattern)

```jsx
const menuItems = [
    {
        label: 'Dashboard',
        icon: 'material-symbols:dashboard',
        element: <DashboardHome />
    },
    {
        label: 'Settings',
        icon: 'material-symbols:settings',
        element: <SettingsGeneral />,
        subItems: [
            {
                label: 'General',
                icon: 'material-symbols:settings-general',
                element: <SettingsGeneral />
            },
            {
                label: 'Security',
                icon: 'material-symbols:security',
                element: <SettingsSecurity />
            },
            {
                label: 'Privacy',
                icon: 'material-symbols:privacy-tip',
                element: <SettingsPrivacy />
            }
        ]
    },
    {
        label: 'Analytics',
        icon: 'material-symbols:analytics',
        element: <AnalyticsOverview />,
        subItems: [
            {
                label: 'Overview',
                icon: 'material-symbols:overview',
                element: <AnalyticsOverview />
            },
            {
                label: 'Reports',
                icon: 'material-symbols:assessment',
                element: <AnalyticsReports />
            }
        ]
    }
];
```

### Recursive Sub-Items (Multiple Levels)

```jsx
const menuItems = [
    {
        label: 'Settings',
        icon: 'material-symbols:settings',
        element: <SettingsGeneral />,
        subItems: [
            {
                label: 'Account',
                icon: 'material-symbols:account-circle',
                element: <AccountSettings />,
                subItems: [
                    {
                        label: 'Profile',
                        icon: 'material-symbols:person',
                        element: <ProfileSettings />
                    },
                    {
                        label: 'Preferences',
                        icon: 'material-symbols:tune',
                        element: <PreferencesSettings />
                    }
                ]
            },
            {
                label: 'Security',
                icon: 'material-symbols:security',
                element: <SecuritySettings />
            }
        ]
    }
];
```

## Visual Indicators

- **Chevron Icon**: Menu items with sub-items display a chevron icon on the right
- **Hover Effect**: Chevron animates on hover to indicate clickable sub-items
- **Breadcrumb Navigation**: Shows current navigation path when in sub-menus
- **Home Button**: Click "Main" in breadcrumb to return to top-level menu

## URL Parameters

The component manages navigation state in URL parameters:

- `?page=0` - Main menu, first item selected
- `?page=1&sub=0` - Sub-menu of second main item, first sub-item selected
- `?page=1&sub=1&sub=0` - Nested sub-menu (third level)

## Styling

The component includes built-in styles for:

- Breadcrumb navigation
- Sub-indicator chevrons
- Hover animations
- Smooth transitions

Custom styling can be applied through CSS variables and the existing class structure.

## Migration Guide

### From Legacy to New Pattern

1. **Identify your menu items and children arrays**
2. **Add element property to each menu item**
3. **Remove the children prop from Dashboard**
4. **Test to ensure functionality remains the same**

Example migration:

```jsx
// Before (Legacy)
const menuItems = [
    { label: 'Dashboard', icon: 'material-symbols:dashboard' },
    { label: 'Settings', icon: 'material-symbols:settings' }
];

const children = [
    <DashboardHome />,
    <Settings />
];

<Dashboard menuItems={menuItems} children={children} />

// After (New Pattern)
const menuItems = [
    { 
        label: 'Dashboard', 
        icon: 'material-symbols:dashboard',
        element: <DashboardHome />
    },
    { 
        label: 'Settings', 
        icon: 'material-symbols:settings',
        element: <Settings />
    }
];

<Dashboard menuItems={menuItems} />
```

## Example

See `SubSidebarExample.jsx` for a complete working example of the sub-sidebar functionality with the new element pattern. 