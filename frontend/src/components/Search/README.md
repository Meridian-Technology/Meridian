# Configurable Search Component

The Search component now supports configurable search types, allowing you to customize which types of content users can search for.

## Basic Usage

```jsx
import Search from './Search';

// Default search with all types enabled
<Search variant="compact" />
```

## Configurable Search Types

### Props

- `searchTypes` - Array of search type configurations
- `showAllTab` - Whether to show the "All" tab (default: true)
- `navigationHandlers` - Custom navigation handlers for different result types

### Search Type Configuration

Each search type has the following structure:

```jsx
{
  key: 'events',           // Unique identifier
  label: 'Events',         // Display name
  icon: 'mingcute:calendar-fill', // Icon to display
  enabled: true            // Whether this type is enabled
}
```

### Navigation Handlers

You can customize how clicking on search results navigates by providing custom navigation handlers:

```jsx
const navigationHandlers = {
  events: (event) => navigate(`/event/${event._id}`),
  organizations: (org) => navigate(`/org/${org.org_name}`),
  users: (user) => navigate(`/profile/${user.username}`),
  rooms: (room) => navigateToRoomsTab(room) // Custom navigation
};
```

## Examples

### 1. Events-Only Search

```jsx
const eventsOnly = [
  { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true }
];

<Search 
  searchTypes={eventsOnly} 
  showAllTab={false} 
  variant="compact" 
/>
```

### 2. Custom Search Types (Events + Rooms)

```jsx
const customSearchTypes = [
  { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
  { key: 'rooms', label: 'Rooms', icon: 'mingcute:building-fill', enabled: true }
];

<Search 
  searchTypes={customSearchTypes} 
  showAllTab={true} 
  variant="default" 
/>
```

### 3. Conditional Search Types

```jsx
const { user } = useAuth();

const conditionalSearchTypes = [
  { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
  { key: 'organizations', label: 'Organizations', icon: 'mingcute:group-2-fill', enabled: true },
  { key: 'users', label: 'Users', icon: 'mingcute:user-fill', enabled: !!user } // Only if authenticated
];

<Search 
  searchTypes={conditionalSearchTypes} 
  variant="compact" 
/>
```

### 4. Custom Navigation Handlers

```jsx
// Custom navigation for rooms to navigate to Rooms tab instead of room page
const handleRoomNavigation = (room) => {
  const searchParams = new URLSearchParams();
  searchParams.set('query', room.name);
  if (room.attributes && room.attributes.length > 0) {
    searchParams.set('attributes', JSON.stringify(room.attributes));
  }
  navigate(`/events-dashboard?page=2&${searchParams.toString()}`);
};

const navigationHandlers = {
  rooms: handleRoomNavigation,
  events: (event) => navigate(`/event/${event._id}`),
  organizations: (org) => navigate(`/org/${org.org_name}`),
  users: (user) => navigate(`/profile/${user.username}`)
};

<Search 
  searchTypes={customSearchTypes}
  navigationHandlers={navigationHandlers}
  variant="compact"
/>
```

### 5. MyEvents Custom Configuration

```jsx
// In MyEvents component
const myEventsSearchTypes = [
  { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
  { key: 'rooms', label: 'Rooms', icon: 'mingcute:building-fill', enabled: true },
  { key: 'users', label: 'Users', icon: 'mingcute:user-fill', enabled: isAuthenticated }
];

const navigationHandlers = {
  rooms: onRoomNavigation || ((room) => navigate(`/room/${room._id}`)), // Use custom or fallback
  events: (event) => navigate(`/event/${event._id}`),
  users: (user) => navigate(`/profile/${user.username}`)
};

<Search 
  searchTypes={myEventsSearchTypes}
  navigationHandlers={navigationHandlers}
  variant="compact"
  placeholder="Search for events, rooms, or users..."
/>
```

## Available Search Types

The component supports these built-in search types:

- **events** - Search through future events
- **organizations** - Search through organizations
- **rooms** - Search through available rooms
- **users** - Search through users (requires authentication)

## Features

- **Dynamic Tabs**: Tabs are automatically generated based on enabled search types
- **Smart "All" Tab**: The "All" tab only appears when multiple search types are enabled
- **Conditional Rendering**: Users tab automatically hides when user is not authenticated
- **Flexible Layout**: Works with both `default` and `compact` variants
- **Custom Placeholders**: Placeholder text can be customized based on enabled types
- **Custom Navigation**: Override default navigation behavior for any search result type
- **Fallback Navigation**: Falls back to default navigation if no custom handler is provided

## Migration from Old Version

If you were using the old Search component, no changes are needed - it will work exactly the same with the default configuration. To customize, simply add the `searchTypes` and/or `navigationHandlers` props with your desired configuration.

## Navigation Handler Signatures

Each navigation handler receives the corresponding result item as a parameter:

```jsx
// Event handler
events: (event) => { /* event object with _id, name, description, etc. */ }

// Organization handler  
organizations: (org) => { /* org object with _id, org_name, org_description, etc. */ }

// User handler
users: (user) => { /* user object with _id, username, name, picture, etc. */ }

// Room handler
rooms: (room) => { /* room object with _id, name, image, attributes, etc. */ }
```
