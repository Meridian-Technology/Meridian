/**
 * TypeScript-style type definitions for TabbedContainer component
 * These can be used with JSDoc comments for better IDE support
 */

/**
 * @typedef {Object} TabConfig
 * @property {string} id - Unique identifier for the tab
 * @property {string} label - Display label for the tab
 * @property {string} [icon] - Iconify icon name (optional)
 * @property {React.ReactNode} content - Tab content component
 * @property {boolean} [disabled=false] - Whether the tab is disabled
 * @property {string} [badge] - Badge text to display on tab
 * @property {'default'|'success'|'warning'|'info'|'secondary'} [badgeColor='default'] - Badge color variant
 * @property {string} [tooltip] - Tooltip text for the tab
 * @property {Object} [meta] - Additional metadata for the tab
 */

/**
 * @typedef {Object} TabbedContainerProps
 * @property {TabConfig[]} tabs - Array of tab configuration objects
 * @property {string} [defaultTab] - Default active tab ID
 * @property {string} [activeTab] - Controlled active tab ID
 * @property {function(string): void} [onTabChange] - Callback when tab changes
 * @property {'top'|'bottom'|'left'|'right'} [tabPosition='top'] - Position of tabs
 * @property {'default'|'pills'|'underline'|'minimal'} [tabStyle='default'] - Tab styling variant
 * @property {boolean} [showTabIcons=true] - Whether to show tab icons
 * @property {boolean} [showTabLabels=true] - Whether to show tab labels
 * @property {boolean} [allowTabReorder=false] - Whether tabs can be reordered
 * @property {function(number, number): void} [onTabReorder] - Callback when tabs are reordered
 * @property {boolean} [lazyLoad=false] - Whether to lazy load tab content
 * @property {boolean} [keepAlive=true] - Whether to keep inactive tab content mounted
 * @property {string} [className] - Additional CSS classes
 * @property {Object} [tabProps] - Additional props to pass to tab buttons
 * @property {Object} [contentProps] - Additional props to pass to content container
 * @property {React.ReactNode} [header] - Optional header content above tabs
 * @property {React.ReactNode} [footer] - Optional footer content below tabs
 * @property {React.ReactNode} [sidebar] - Optional sidebar content
 * @property {Object} [styles] - Custom styles object
 * @property {boolean} [animated=true] - Whether to animate tab transitions
 * @property {number} [animationDuration=300] - Animation duration in ms
 * @property {'small'|'medium'|'large'} [size='medium'] - Component size
 * @property {boolean} [fullWidth=false] - Whether tabs should take full width
 * @property {boolean} [scrollable=true] - Whether tabs should be scrollable when they overflow
 * @property {'smooth'|'auto'} [scrollBehavior='smooth'] - Scroll behavior
 * @property {boolean} [showScrollButtons=true] - Whether to show scroll buttons for overflow
 * @property {Object} [theme] - Theme configuration object
 */

/**
 * @typedef {Object} ThemeConfig
 * @property {string} [primaryColor] - Primary theme color
 * @property {string} [secondaryColor] - Secondary theme color
 * @property {string} [backgroundColor] - Background color
 * @property {string} [textColor] - Text color
 * @property {string} [borderColor] - Border color
 * @property {string} [hoverColor] - Hover state color
 * @property {string} [activeColor] - Active state color
 * @property {string} [disabledColor] - Disabled state color
 * @property {string} [fontFamily] - Font family
 * @property {string} [borderRadius] - Border radius
 * @property {string} [boxShadow] - Box shadow
 */

/**
 * @typedef {Object} TabReorderEvent
 * @property {number} dragIndex - Index of the dragged tab
 * @property {number} hoverIndex - Index where the tab is being dropped
 * @property {string} dragId - ID of the dragged tab
 * @property {string} hoverId - ID of the tab being hovered over
 */

/**
 * @typedef {Object} TabChangeEvent
 * @property {string} activeTab - ID of the newly active tab
 * @property {string} previousTab - ID of the previously active tab
 * @property {TabConfig} tabConfig - Configuration of the active tab
 */

// Export types for use in other files
export const TabbedContainerTypes = {
  TabConfig: 'TabConfig',
  TabbedContainerProps: 'TabbedContainerProps',
  ThemeConfig: 'ThemeConfig',
  TabReorderEvent: 'TabReorderEvent',
  TabChangeEvent: 'TabChangeEvent'
};

// Common tab configurations for reuse
export const CommonTabConfigs = {
  // Basic tab with icon and label
  basic: (id, label, icon, content) => ({
    id,
    label,
    icon,
    content
  }),

  // Tab with badge
  withBadge: (id, label, icon, content, badge, badgeColor = 'default') => ({
    id,
    label,
    icon,
    content,
    badge,
    badgeColor
  }),

  // Disabled tab
  disabled: (id, label, icon, content) => ({
    id,
    label,
    icon,
    content,
    disabled: true
  }),

  // Tab with tooltip
  withTooltip: (id, label, icon, content, tooltip) => ({
    id,
    label,
    icon,
    content,
    tooltip
  }),

  // Icon-only tab
  iconOnly: (id, icon, content, tooltip) => ({
    id,
    label: '', // Empty label for icon-only
    icon,
    content,
    tooltip
  }),

  // Label-only tab
  labelOnly: (id, label, content) => ({
    id,
    label,
    content
    // No icon property
  })
};

// Common theme configurations
export const CommonThemes = {
  light: {
    primaryColor: '#3b82f6',
    secondaryColor: '#6b7280',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    borderColor: '#e5e7eb',
    hoverColor: '#f3f4f6',
    activeColor: '#3b82f6',
    disabledColor: '#9ca3af'
  },

  dark: {
    primaryColor: '#60a5fa',
    secondaryColor: '#9ca3af',
    backgroundColor: '#1f2937',
    textColor: '#f9fafb',
    borderColor: '#374151',
    hoverColor: '#374151',
    activeColor: '#60a5fa',
    disabledColor: '#6b7280'
  },

  blue: {
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    backgroundColor: '#ffffff',
    textColor: '#1e293b',
    borderColor: '#cbd5e1',
    hoverColor: '#f1f5f9',
    activeColor: '#2563eb',
    disabledColor: '#94a3b8'
  },

  green: {
    primaryColor: '#059669',
    secondaryColor: '#6b7280',
    backgroundColor: '#ffffff',
    textColor: '#1f2937',
    borderColor: '#d1d5db',
    hoverColor: '#f0fdf4',
    activeColor: '#059669',
    disabledColor: '#9ca3af'
  }
};

// Utility functions for working with tabs
export const TabUtils = {
  /**
   * Find a tab by ID
   * @param {TabConfig[]} tabs - Array of tabs
   * @param {string} id - Tab ID to find
   * @returns {TabConfig|undefined} Found tab or undefined
   */
  findTabById: (tabs, id) => tabs.find(tab => tab.id === id),

  /**
   * Get the index of a tab by ID
   * @param {TabConfig[]} tabs - Array of tabs
   * @param {string} id - Tab ID to find
   * @returns {number} Tab index or -1 if not found
   */
  getTabIndex: (tabs, id) => tabs.findIndex(tab => tab.id === id),

  /**
   * Check if a tab is disabled
   * @param {TabConfig} tab - Tab to check
   * @returns {boolean} Whether the tab is disabled
   */
  isTabDisabled: (tab) => Boolean(tab.disabled),

  /**
   * Get enabled tabs only
   * @param {TabConfig[]} tabs - Array of tabs
   * @returns {TabConfig[]} Array of enabled tabs
   */
  getEnabledTabs: (tabs) => tabs.filter(tab => !tab.disabled),

  /**
   * Reorder tabs array
   * @param {TabConfig[]} tabs - Array of tabs
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Destination index
   * @returns {TabConfig[]} Reordered tabs array
   */
  reorderTabs: (tabs, fromIndex, toIndex) => {
    const result = [...tabs];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return result;
  },

  /**
   * Validate tab configuration
   * @param {TabConfig} tab - Tab to validate
   * @returns {Object} Validation result with isValid and errors
   */
  validateTab: (tab) => {
    const errors = [];
    
    if (!tab.id) {
      errors.push('Tab ID is required');
    }
    
    if (!tab.label && !tab.icon) {
      errors.push('Tab must have either a label or an icon');
    }
    
    if (!tab.content) {
      errors.push('Tab content is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Validate tabs array
   * @param {TabConfig[]} tabs - Array of tabs to validate
   * @returns {Object} Validation result with isValid and errors
   */
  validateTabs: (tabs) => {
    const errors = [];
    const ids = new Set();
    
    if (!Array.isArray(tabs)) {
      errors.push('Tabs must be an array');
      return { isValid: false, errors };
    }
    
    if (tabs.length === 0) {
      errors.push('At least one tab is required');
    }
    
    tabs.forEach((tab, index) => {
      const tabValidation = TabUtils.validateTab(tab);
      if (!tabValidation.isValid) {
        errors.push(`Tab ${index}: ${tabValidation.errors.join(', ')}`);
      }
      
      if (ids.has(tab.id)) {
        errors.push(`Duplicate tab ID: ${tab.id}`);
      }
      ids.add(tab.id);
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};



