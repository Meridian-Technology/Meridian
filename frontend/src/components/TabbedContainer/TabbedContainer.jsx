import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './TabbedContainer.scss';

/**
 * Highly configurable tabbed container component
 * 
 * @param {Object} props
 * @param {Array} props.tabs - Array of tab configuration objects
 * @param {string} props.tabs[].id - Unique identifier for the tab
 * @param {string} props.tabs[].label - Display label for the tab
 * @param {string} props.tabs[].icon - Iconify icon name (optional)
 * @param {React.ReactNode} props.tabs[].content - Tab content component
 * @param {boolean} props.tabs[].disabled - Whether the tab is disabled (optional)
 * @param {string} props.tabs[].badge - Badge text to display on tab (optional)
 * @param {number} props.tabs[].badgeColor - Badge color variant (optional)
 * @param {string} props.defaultTab - Default active tab ID (optional)
 * @param {string} props.activeTab - Controlled active tab ID (optional)
 * @param {Function} props.onTabChange - Callback when tab changes (optional)
 * @param {string} props.tabPosition - Position of tabs: 'top', 'bottom', 'left', 'right' (default: 'top')
 * @param {string} props.tabStyle - Tab styling variant: 'default', 'pills', 'underline', 'minimal' (default: 'default')
 * @param {boolean} props.showTabIcons - Whether to show tab icons (default: true)
 * @param {boolean} props.showTabLabels - Whether to show tab labels (default: true)
 * @param {boolean} props.allowTabReorder - Whether tabs can be reordered (default: false)
 * @param {Function} props.onTabReorder - Callback when tabs are reordered (optional)
 * @param {boolean} props.lazyLoad - Whether to lazy load tab content (default: false)
 * @param {boolean} props.keepAlive - Whether to keep inactive tab content mounted (default: true)
 * @param {string} props.className - Additional CSS classes (optional)
 * @param {Object} props.tabProps - Additional props to pass to tab buttons (optional)
 * @param {Object} props.contentProps - Additional props to pass to content container (optional)
 * @param {React.ReactNode} props.header - Optional header content above tabs (optional)
 * @param {React.ReactNode} props.footer - Optional footer content below tabs (optional)
 * @param {React.ReactNode} props.sidebar - Optional sidebar content (when tabPosition is 'left' or 'right') (optional)
 * @param {Object} props.styles - Custom styles object (optional)
 * @param {boolean} props.animated - Whether to animate tab transitions (default: true)
 * @param {number} props.animationDuration - Animation duration in ms (default: 300)
 * @param {string} props.size - Component size: 'small', 'medium', 'large' (default: 'medium')
 * @param {boolean} props.fullWidth - Whether tabs should take full width (default: false)
 * @param {boolean} props.scrollable - Whether tabs should be scrollable when they overflow (default: true)
 * @param {string} props.scrollBehavior - Scroll behavior: 'smooth', 'auto' (default: 'smooth')
 * @param {boolean} props.showScrollButtons - Whether to show scroll buttons for overflow (default: true)
 * @param {Object} props.theme - Theme configuration object (optional)
 */
function TabbedContainer({
    tabs = [],
    defaultTab,
    activeTab: controlledActiveTab,
    onTabChange,
    tabPosition = 'top',
    tabStyle = 'default',
    showTabIcons = true,
    showTabLabels = true,
    allowTabReorder = false,
    onTabReorder,
    lazyLoad = false,
    keepAlive = true,
    className = '',
    tabProps = {},
    contentProps = {},
    header,
    footer,
    sidebar,
    styles = {},
    animated = true,
    animationDuration = 300,
    size = 'medium',
    fullWidth = false,
    scrollable = true,
    scrollBehavior = 'smooth',
    showScrollButtons = true,
    theme = {}
}) {
    // Internal state for uncontrolled mode
    const [internalActiveTab, setInternalActiveTab] = useState(
        defaultTab || (tabs.length > 0 ? tabs[0].id : null)
    );

    // Use controlled or uncontrolled active tab
    const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

    // Track which tabs have been loaded (for lazy loading)
    const [loadedTabs, setLoadedTabs] = useState(
        lazyLoad ? new Set([activeTab]) : new Set(tabs.map(tab => tab.id))
    );

    // Handle tab change
    const handleTabChange = useCallback((tabId) => {
        if (controlledActiveTab === undefined) {
            setInternalActiveTab(tabId);
        }
        
        // Add to loaded tabs if lazy loading
        if (lazyLoad) {
            setLoadedTabs(prev => new Set([...prev, tabId]));
        }
        
        onTabChange?.(tabId);
    }, [controlledActiveTab, onTabChange, lazyLoad]);

    // Handle tab reorder
    const handleTabReorder = useCallback((dragIndex, hoverIndex) => {
        if (allowTabReorder && onTabReorder) {
            onTabReorder(dragIndex, hoverIndex);
        }
    }, [allowTabReorder, onTabReorder]);

    // Scroll to active tab
    const scrollToActiveTab = useCallback(() => {
        if (!scrollable) return;
        
        const activeTabElement = document.querySelector(`[data-tab-id="${activeTab}"]`);
        if (activeTabElement) {
            activeTabElement.scrollIntoView({
                behavior: scrollBehavior,
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [activeTab, scrollable, scrollBehavior]);

    // Scroll to active tab when it changes
    useEffect(() => {
        scrollToActiveTab();
    }, [activeTab, scrollToActiveTab]);

    // Get current tab content
    const currentTab = tabs.find(tab => tab.id === activeTab);
    const currentContent = currentTab?.content;

    // Helper function to generate class names
    const generateClassNames = (baseClasses) => {
        return baseClasses
            .map(cls => {
                if (typeof cls === 'object' && cls !== null) {
                    return Object.entries(cls)
                        .filter(([_, value]) => value)
                        .map(([key]) => key)
                        .join(' ');
                }
                return cls;
            })
            .filter(Boolean)
            .join(' ');
    };

    // Generate CSS classes
    const containerClasses = generateClassNames([
        'tabbed-container',
        `tabbed-container--${tabPosition}`,
        `tabbed-container--${tabStyle}`,
        `tabbed-container--${size}`,
        {
            'tabbed-container--full-width': fullWidth,
            'tabbed-container--scrollable': scrollable,
            'tabbed-container--animated': animated,
            'tabbed-container--lazy': lazyLoad
        },
        className
    ]);

    const tabsClasses = generateClassNames([
        'tabbed-container__tabs',
        `tabbed-container__tabs--${tabPosition}`,
        {
            'tabbed-container__tabs--scrollable': scrollable,
            'tabbed-container__tabs--full-width': fullWidth
        }
    ]);

    const contentClasses = generateClassNames([
        'tabbed-container__content',
        `tabbed-container__content--${tabPosition}`,
        {
            'tabbed-container__content--animated': animated
        }
    ]);

    // Render tab button
    const renderTabButton = (tab, index) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled;
        
        const tabClasses = generateClassNames([
            'tabbed-container__tab',
            `tabbed-container__tab--${tabStyle}`,
            {
                'tabbed-container__tab--active': isActive,
                'tabbed-container__tab--disabled': isDisabled,
                'tabbed-container__tab--icon-only': !showTabLabels,
                'tabbed-container__tab--label-only': !showTabIcons
            }
        ]);

        const handleClick = () => {
            if (!isDisabled) {
                handleTabChange(tab.id);
            }
        };

        return (
            <button
                key={tab.id}
                data-tab-id={tab.id}
                className={tabClasses}
                onClick={handleClick}
                disabled={isDisabled}
                title={tab.tooltip || tab.label}
                {...tabProps}
            >
                {showTabIcons && tab.icon && (
                    <Icon 
                        icon={tab.icon} 
                        className="tabbed-container__tab-icon"
                    />
                )}
                {showTabLabels && (
                    <span className="tabbed-container__tab-label">
                        {tab.label}
                    </span>
                )}
                {/* {tab.badge && (
                    <span 
                        className={`tabbed-container__tab-badge tabbed-container__tab-badge--${tab.badgeColor || 'default'}`}
                    >
                        {tab.badge}
                    </span>
                )} */}
            </button>
        );
    };

    // Render tab content
    const renderTabContent = () => {
        if (!currentContent) return null;

        // For lazy loading, only render if tab has been loaded
        if (lazyLoad && !loadedTabs.has(activeTab)) {
            return null;
        }

        // For keepAlive, render all loaded tabs but only show active one
        if (keepAlive) {
            return tabs
                .filter(tab => loadedTabs.has(tab.id))
                .map(tab => (
                    <div
                        key={tab.id}
                        className={`tabbed-container__tab-panel ${
                            tab.id === activeTab ? 'tabbed-container__tab-panel--active' : ''
                        }`}
                        style={{
                            display: tab.id === activeTab ? 'block' : 'none'
                        }}
                    >
                        {tab.content}
                    </div>
                ));
        }

        // Default behavior: only render active tab
        return (
            <div className="tabbed-container__tab-panel tabbed-container__tab-panel--active">
                {currentContent}
            </div>
        );
    };

    // Render scroll buttons
    const renderScrollButtons = () => {
        if (!scrollable || !showScrollButtons) return null;

        return (
            <>
                {/* <button 
                    className="tabbed-container__scroll-btn tabbed-container__scroll-btn--prev"
                    onClick={() => {
                        const tabsContainer = document.querySelector('.tabbed-container__tabs');
                        if (tabsContainer) {
                            tabsContainer.scrollBy({
                                left: -200,
                                behavior: scrollBehavior
                            });
                        }
                    }}
                >
                    <Icon icon="mdi:chevron-left" />
                </button> */}
                {/* <button 
                    className="tabbed-container__scroll-btn tabbed-container__scroll-btn--next"
                    onClick={() => {
                        const tabsContainer = document.querySelector('.tabbed-container__tabs');
                        if (tabsContainer) {
                            tabsContainer.scrollBy({
                                left: 200,
                                behavior: scrollBehavior
                            });
                        }
                    }}
                >
                    <Icon icon="mdi:chevron-right" />
                </button> */}
            </>
        );
    };

    if (tabs.length === 0) {
        return (
            <div className={containerClasses} style={styles}>
                <div className="tabbed-container__empty">
                    No tabs configured
                </div>
            </div>
        );
    }

    return (
        <div 
            className={containerClasses} 
            style={{
                ...styles,
                '--animation-duration': `${animationDuration}ms`
            }}
        >
            {header && (
                <div className="tabbed-container__header">
                    {header}
                </div>
            )}

            <div className="tabbed-container__body">
                {sidebar && (tabPosition === 'left' || tabPosition === 'right') && (
                    <div className="tabbed-container__sidebar">
                        {sidebar}
                    </div>
                )}

                <div className="tabbed-container__main">
                    {tabPosition === 'top' && (
                        <div className="tabbed-container__tabs-wrapper">
                            {renderScrollButtons()}
                            <div className={tabsClasses}>
                                {tabs.map(renderTabButton)}
                            </div>
                        </div>
                    )}

                    {tabPosition === 'left' && (
                        <div className="tabbed-container__tabs-wrapper">
                            <div className={tabsClasses}>
                                {tabs.map(renderTabButton)}
                            </div>
                        </div>
                    )}

                    <div 
                        className={contentClasses}
                        {...contentProps}
                    >
                        {renderTabContent()}
                    </div>

                    {tabPosition === 'right' && (
                        <div className="tabbed-container__tabs-wrapper">
                            <div className={tabsClasses}>
                                {tabs.map(renderTabButton)}
                            </div>
                        </div>
                    )}

                    {tabPosition === 'bottom' && (
                        <div className="tabbed-container__tabs-wrapper">
                            {renderScrollButtons()}
                            <div className={tabsClasses}>
                                {tabs.map(renderTabButton)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {footer && (
                <div className="tabbed-container__footer">
                    {footer}
                </div>
            )}
        </div>
    );
}

export default TabbedContainer;