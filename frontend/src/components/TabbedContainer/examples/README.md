# TabbedContainer Component

A highly configurable and reusable tabbed interface component for React applications.

## Features

- **Maximum Configurability**: 25+ configuration options for complete customization
- **Multiple Tab Styles**: Default, pills, underline, and minimal styles
- **Flexible Positioning**: Tabs can be positioned at top, bottom, left, or right
- **Responsive Design**: Automatically adapts to different screen sizes
- **Lazy Loading**: Load tab content only when needed for better performance
- **Keep Alive**: Option to keep all tab content mounted for faster switching
- **Tab Reordering**: Drag and drop support for reordering tabs
- **Badge Support**: Display badges on tabs with different color variants
- **Scrollable Tabs**: Handle overflow with smooth scrolling and navigation buttons
- **Theme Support**: Built-in themes and custom theme configuration
- **Animation Support**: Smooth transitions with configurable duration
- **Accessibility**: Full keyboard navigation and screen reader support
- **TypeScript Support**: Complete type definitions and JSDoc comments

## Basic Usage

```jsx
import TabbedContainer, { CommonTabConfigs } from '../TabbedContainer';

const tabs = [
  CommonTabConfigs.basic('tab1', 'Tab 1', 'mdi:home', <div>Content 1</div>),
  CommonTabConfigs.basic('tab2', 'Tab 2', 'mdi:settings', <div>Content 2</div>),
  CommonTabConfigs.withBadge('tab3', 'Tab 3', 'mdi:notifications', <div>Content 3</div>, '5', 'warning')
];

function MyComponent() {
  return (
    <TabbedContainer
      tabs={tabs}
      defaultTab="tab1"
      tabStyle="default"
      size="medium"
    />
  );
}
```

## Configuration Options

### Core Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `TabConfig[]` | `[]` | Array of tab configuration objects |
| `defaultTab` | `string` | `undefined` | Default active tab ID |
| `activeTab` | `string` | `undefined` | Controlled active tab ID |
| `onTabChange` | `function` | `undefined` | Callback when tab changes |

### Appearance

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabPosition` | `'top'\|'bottom'\|'left'\|'right'` | `'top'` | Position of tabs |
| `tabStyle` | `'default'\|'pills'\|'underline'\|'minimal'` | `'default'` | Tab styling variant |
| `size` | `'small'\|'medium'\|'large'` | `'medium'` | Component size |
| `showTabIcons` | `boolean` | `true` | Whether to show tab icons |
| `showTabLabels` | `boolean` | `true` | Whether to show tab labels |
| `fullWidth` | `boolean` | `false` | Whether tabs should take full width |

### Behavior

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `lazyLoad` | `boolean` | `false` | Whether to lazy load tab content |
| `keepAlive` | `boolean` | `true` | Whether to keep inactive tab content mounted |
| `allowTabReorder` | `boolean` | `false` | Whether tabs can be reordered |
| `onTabReorder` | `function` | `undefined` | Callback when tabs are reordered |

### Scrolling

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `scrollable` | `boolean` | `true` | Whether tabs should be scrollable when they overflow |
| `scrollBehavior` | `'smooth'\|'auto'` | `'smooth'` | Scroll behavior |
| `showScrollButtons` | `boolean` | `true` | Whether to show scroll buttons for overflow |

### Animation

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `animated` | `boolean` | `true` | Whether to animate tab transitions |
| `animationDuration` | `number` | `300` | Animation duration in ms |

### Layout

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `header` | `React.ReactNode` | `undefined` | Optional header content above tabs |
| `footer` | `React.ReactNode` | `undefined` | Optional footer content below tabs |
| `sidebar` | `React.ReactNode` | `undefined` | Optional sidebar content |

### Styling

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Additional CSS classes |
| `styles` | `Object` | `{}` | Custom styles object |
| `theme` | `Object` | `{}` | Theme configuration object |
| `tabProps` | `Object` | `{}` | Additional props to pass to tab buttons |
| `contentProps` | `Object` | `{}` | Additional props to pass to content container |

## Tab Configuration

Each tab is configured using a `TabConfig` object:

```jsx
const tabConfig = {
  id: 'unique-tab-id',           // Required: Unique identifier
  label: 'Tab Label',            // Required: Display label
  icon: 'mdi:home',              // Optional: Iconify icon name
  content: <div>Content</div>,   // Required: Tab content component
  disabled: false,               // Optional: Whether tab is disabled
  badge: '5',                    // Optional: Badge text
  badgeColor: 'warning',         // Optional: Badge color variant
  tooltip: 'Tooltip text'        // Optional: Tooltip text
};
```

## Common Tab Configurations

The component provides helper functions for common tab configurations:

```jsx
import { CommonTabConfigs } from '../TabbedContainer';

// Basic tab with icon and label
const basicTab = CommonTabConfigs.basic('id', 'Label', 'mdi:icon', <Content />);

// Tab with badge
const badgeTab = CommonTabConfigs.withBadge('id', 'Label', 'mdi:icon', <Content />, '5', 'warning');

// Disabled tab
const disabledTab = CommonTabConfigs.disabled('id', 'Label', 'mdi:icon', <Content />);

// Tab with tooltip
const tooltipTab = CommonTabConfigs.withTooltip('id', 'Label', 'mdi:icon', <Content />, 'Tooltip');

// Icon-only tab
const iconTab = CommonTabConfigs.iconOnly('id', 'mdi:icon', <Content />, 'Tooltip');

// Label-only tab
const labelTab = CommonTabConfigs.labelOnly('id', 'Label', <Content />);
```

## Themes

Built-in themes are available:

```jsx
import { CommonThemes } from '../TabbedContainer';

// Use built-in themes
<TabbedContainer
  tabs={tabs}
  theme={CommonThemes.dark}
/>

// Custom theme
<TabbedContainer
  tabs={tabs}
  theme={{
    primaryColor: '#3b82f6',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    borderColor: '#e5e7eb'
  }}
/>
```

## Advanced Examples

### Controlled vs Uncontrolled

```jsx
// Uncontrolled (internal state)
<TabbedContainer
  tabs={tabs}
  defaultTab="tab1"
  onTabChange={(tabId) => console.log('Tab changed:', tabId)}
/>

// Controlled (external state)
const [activeTab, setActiveTab] = useState('tab1');

<TabbedContainer
  tabs={tabs}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### Lazy Loading

```jsx
<TabbedContainer
  tabs={tabs}
  lazyLoad={true}        // Load content only when tab is first accessed
  keepAlive={false}      // Unmount inactive tabs
/>
```

### Tab Reordering

```jsx
const [tabs, setTabs] = useState(initialTabs);

const handleReorder = (dragIndex, hoverIndex) => {
  setTabs(prevTabs => TabUtils.reorderTabs(prevTabs, dragIndex, hoverIndex));
};

<TabbedContainer
  tabs={tabs}
  allowTabReorder={true}
  onTabReorder={handleReorder}
/>
```

### Custom Layout

```jsx
<TabbedContainer
  tabs={tabs}
  header={<div>Custom Header</div>}
  footer={<div>Custom Footer</div>}
  sidebar={<div>Custom Sidebar</div>}
  tabPosition="left"
/>
```

## Migration from Existing Components

### Before (ManageFlow.jsx)

```jsx
const [activeTab, setActiveTab] = useState('flows');

return (
  <div className="content">
    <div className="tabs">
      <button 
        className={`tab ${activeTab === 'flows' ? 'active' : ''}`}
        onClick={() => setActiveTab('flows')}
      >
        <Icon icon="mdi:workflow" />
        Flows
      </button>
      {/* More tabs... */}
    </div>
    
    <div className="tab-content">
      {activeTab === 'flows' && <FlowsContent />}
      {/* More content... */}
    </div>
  </div>
);
```

### After (with TabbedContainer)

```jsx
const tabs = [
  CommonTabConfigs.basic('flows', 'Flows', 'mdi:workflow', <FlowsContent />),
  // More tabs...
];

return (
  <TabbedContainer
    tabs={tabs}
    defaultTab="flows"
    tabStyle="default"
    size="medium"
  />
);
```

## Styling and Customization

### CSS Custom Properties

The component uses CSS custom properties for easy theming:

```css
.tabbed-container {
  --tabbed-bg: #ffffff;
  --tabbed-text-color: #1f2937;
  --tabbed-border-color: #e5e7eb;
  --tabbed-active-bg: #3b82f6;
  --tabbed-active-text-color: #ffffff;
  --tabbed-hover-bg: #f3f4f6;
  --tabbed-border-radius: 8px;
  --animation-duration: 300ms;
}
```

### Custom Styles

```jsx
<TabbedContainer
  tabs={tabs}
  styles={{
    '--tabbed-primary-color': '#your-color',
    '--tabbed-border-radius': '12px'
  }}
  className="my-custom-tabs"
/>
```

## Performance Considerations

- Use `lazyLoad={true}` for tabs with heavy content
- Use `keepAlive={false}` to reduce memory usage
- Consider using `React.memo()` for tab content components
- Use `useCallback()` for event handlers passed to tabs

## Accessibility

The component includes built-in accessibility features:

- Full keyboard navigation (Tab, Arrow keys, Enter, Space)
- ARIA attributes for screen readers
- Focus management
- High contrast support
- Reduced motion support

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- IE11+ (with polyfills for CSS Grid)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Examples

See the example files for complete usage examples:

- `ManageFlowExample.jsx` - Refactored ManageFlow component
- `MemberManagementExample.jsx` - Refactored MemberManagement component  
- `AdvancedUsageExample.jsx` - Comprehensive examples of all features





