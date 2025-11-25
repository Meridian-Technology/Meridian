import React, { useState, useCallback } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import TabbedContainer, { CommonTabConfigs, CommonThemes, TabUtils } from '../TabbedContainer';

/**
 * Advanced usage examples demonstrating the full configurability of TabbedContainer
 */
function AdvancedUsageExample() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [tabs, setTabs] = useState([
        CommonTabConfigs.withBadge('dashboard', 'Dashboard', 'mdi:view-dashboard', <DashboardContent />, '3', 'warning'),
        CommonTabConfigs.basic('analytics', 'Analytics', 'mdi:chart-line', <AnalyticsContent />),
        CommonTabConfigs.basic('users', 'Users', 'mdi:account-group', <UsersContent />),
        CommonTabConfigs.disabled('maintenance', 'Maintenance', 'mdi:wrench', <MaintenanceContent />),
        CommonTabConfigs.withTooltip('settings', 'Settings', 'mdi:cog', <SettingsContent />, 'Configure system settings'),
        CommonTabConfigs.iconOnly('help', 'mdi:help-circle', <HelpContent />, 'Get help and support')
    ]);

    // Example 1: Basic usage with different tab styles
    const BasicExample = () => (
        <div className="example-section">
            <h3>Basic Usage - Different Tab Styles</h3>
            <div className="example-grid">
                <div>
                    <h4>Default Style</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabStyle="default"
                        size="medium"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Pills Style</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabStyle="pills"
                        size="medium"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Underline Style</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabStyle="underline"
                        size="medium"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Minimal Style</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabStyle="minimal"
                        size="medium"
                        className="example-tabs"
                    />
                </div>
            </div>
        </div>
    );

    // Example 2: Different tab positions
    const PositionExample = () => (
        <div className="example-section">
            <h3>Tab Positions</h3>
            <div className="example-grid">
                <div>
                    <h4>Top (Default)</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabPosition="top"
                        size="small"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Bottom</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabPosition="bottom"
                        size="small"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Left</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabPosition="left"
                        size="small"
                        className="example-tabs"
                        styles={{ height: '300px' }}
                    />
                </div>
                <div>
                    <h4>Right</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        tabPosition="right"
                        size="small"
                        className="example-tabs"
                        styles={{ height: '300px' }}
                    />
                </div>
            </div>
        </div>
    );

    // Example 3: Different sizes
    const SizeExample = () => (
        <div className="example-section">
            <h3>Component Sizes</h3>
            <div className="example-grid">
                <div>
                    <h4>Small</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        size="small"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Medium (Default)</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        size="medium"
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Large</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        size="large"
                        className="example-tabs"
                    />
                </div>
            </div>
        </div>
    );

    // Example 4: Controlled vs Uncontrolled
    const ControlledExample = () => (
        <div className="example-section">
            <h3>Controlled vs Uncontrolled</h3>
            <div className="example-grid">
                <div>
                    <h4>Uncontrolled (Internal State)</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        defaultTab="dashboard"
                        onTabChange={(tabId) => console.log('Uncontrolled tab changed:', tabId)}
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Controlled (External State)</h4>
                    <div>
                        <div className="tab-controls">
                            <button 
                                onClick={() => setActiveTab('dashboard')}
                                className={activeTab === 'dashboard' ? 'active' : ''}
                            >
                                Dashboard
                            </button>
                            <button 
                                onClick={() => setActiveTab('analytics')}
                                className={activeTab === 'analytics' ? 'active' : ''}
                            >
                                Analytics
                            </button>
                            <button 
                                onClick={() => setActiveTab('users')}
                                className={activeTab === 'users' ? 'active' : ''}
                            >
                                Users
                            </button>
                        </div>
                        <TabbedContainer
                            tabs={tabs.slice(0, 3)}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            className="example-tabs"
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    // Example 5: Lazy loading and keep alive
    const LazyLoadingExample = () => (
        <div className="example-section">
            <h3>Lazy Loading & Keep Alive</h3>
            <div className="example-grid">
                <div>
                    <h4>Lazy Loading (Load on demand)</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        lazyLoad={true}
                        keepAlive={false}
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Keep Alive (All tabs mounted)</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        lazyLoad={false}
                        keepAlive={true}
                        className="example-tabs"
                    />
                </div>
            </div>
        </div>
    );

    // Example 6: Custom themes
    const ThemeExample = () => (
        <div className="example-section">
            <h3>Custom Themes</h3>
            <div className="example-grid">
                <div>
                    <h4>Light Theme</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        theme={CommonThemes.light}
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Dark Theme</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        theme={CommonThemes.dark}
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Blue Theme</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        theme={CommonThemes.blue}
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Green Theme</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        theme={CommonThemes.green}
                        className="example-tabs"
                    />
                </div>
            </div>
        </div>
    );

    // Example 7: With header, footer, and sidebar
    const HeaderFooterExample = () => (
        <div className="example-section">
            <h3>With Header, Footer & Sidebar</h3>
            <TabbedContainer
                tabs={tabs.slice(0, 3)}
                header={
                    <div style={{ padding: '16px', background: '#f0f0f0', borderBottom: '1px solid #ddd' }}>
                        <h2>Application Header</h2>
                        <p>This is a custom header with additional information</p>
                    </div>
                }
                footer={
                    <div style={{ padding: '16px', background: '#f0f0f0', borderTop: '1px solid #ddd' }}>
                        <p>Footer content - Last updated: {new Date().toLocaleString()}</p>
                    </div>
                }
                sidebar={
                    <div style={{ padding: '16px' }}>
                        <h4>Sidebar</h4>
                        <ul>
                            <li>Quick Actions</li>
                            <li>Recent Items</li>
                            <li>Settings</li>
                        </ul>
                    </div>
                }
                tabPosition="left"
                className="example-tabs"
                styles={{ height: '400px' }}
            />
        </div>
    );

    // Example 8: Tab reordering
    const handleTabReorder = useCallback((dragIndex, hoverIndex) => {
        setTabs(prevTabs => TabUtils.reorderTabs(prevTabs, dragIndex, hoverIndex));
    }, []);

    const ReorderExample = () => (
        <div className="example-section">
            <h3>Tab Reordering</h3>
            <TabbedContainer
                tabs={tabs}
                allowTabReorder={true}
                onTabReorder={handleTabReorder}
                className="example-tabs"
            />
        </div>
    );

    // Example 9: Full width and scrollable
    const FullWidthExample = () => (
        <div className="example-section">
            <h3>Full Width & Scrollable</h3>
            <div className="example-grid">
                <div>
                    <h4>Full Width Tabs</h4>
                    <TabbedContainer
                        tabs={tabs.slice(0, 3)}
                        fullWidth={true}
                        className="example-tabs"
                    />
                </div>
                <div>
                    <h4>Scrollable Tabs (Many tabs)</h4>
                    <TabbedContainer
                        tabs={[
                            ...tabs,
                            CommonTabConfigs.basic('tab1', 'Tab 1', 'mdi:tab', <div>Content 1</div>),
                            CommonTabConfigs.basic('tab2', 'Tab 2', 'mdi:tab', <div>Content 2</div>),
                            CommonTabConfigs.basic('tab3', 'Tab 3', 'mdi:tab', <div>Content 3</div>),
                            CommonTabConfigs.basic('tab4', 'Tab 4', 'mdi:tab', <div>Content 4</div>),
                            CommonTabConfigs.basic('tab5', 'Tab 5', 'mdi:tab', <div>Content 5</div>),
                        ]}
                        scrollable={true}
                        showScrollButtons={true}
                        className="example-tabs"
                    />
                </div>
            </div>
        </div>
    );

    return (
        <div className="advanced-usage-examples">
            <h1>TabbedContainer Advanced Usage Examples</h1>
            
            <BasicExample />
            <PositionExample />
            <SizeExample />
            <ControlledExample />
            <LazyLoadingExample />
            <ThemeExample />
            <HeaderFooterExample />
            <ReorderExample />
            <FullWidthExample />
        </div>
    );
}

// Sample content components
function DashboardContent() {
    return (
        <div style={{ padding: '20px' }}>
            <h3>Dashboard Content</h3>
            <p>This is the dashboard tab content with some sample data.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '20px' }}>
                <div style={{ padding: '16px', background: '#f0f0f0', borderRadius: '8px' }}>
                    <h4>Total Users</h4>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>1,234</p>
                </div>
                <div style={{ padding: '16px', background: '#f0f0f0', borderRadius: '8px' }}>
                    <h4>Active Sessions</h4>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>567</p>
                </div>
                <div style={{ padding: '16px', background: '#f0f0f0', borderRadius: '8px' }}>
                    <h4>Revenue</h4>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>$12,345</p>
                </div>
            </div>
        </div>
    );
}

function AnalyticsContent() {
    return (
        <div style={{ padding: '20px' }}>
            <h3>Analytics Content</h3>
            <p>Analytics and reporting features would go here.</p>
            <div style={{ height: '200px', background: '#f0f0f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>Chart placeholder</p>
            </div>
        </div>
    );
}

function UsersContent() {
    return (
        <div style={{ padding: '20px' }}>
            <h3>Users Content</h3>
            <p>User management interface would go here.</p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>
                    Add User
                </button>
                <button style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '4px' }}>
                    Import Users
                </button>
            </div>
        </div>
    );
}

function MaintenanceContent() {
    return (
        <div style={{ padding: '20px' }}>
            <h3>Maintenance Content</h3>
            <p>This tab is disabled and would contain maintenance tools.</p>
        </div>
    );
}

function SettingsContent() {
    return (
        <div style={{ padding: '20px' }}>
            <h3>Settings Content</h3>
            <p>System settings and configuration options would go here.</p>
            <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                    <input type="checkbox" style={{ marginRight: '8px' }} />
                    Enable notifications
                </label>
                <label style={{ display: 'block', marginBottom: '8px' }}>
                    <input type="checkbox" style={{ marginRight: '8px' }} />
                    Auto-save changes
                </label>
            </div>
        </div>
    );
}

function HelpContent() {
    return (
        <div style={{ padding: '20px' }}>
            <h3>Help & Support</h3>
            <p>Help documentation and support resources would go here.</p>
            <div style={{ marginTop: '16px' }}>
                <button style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', marginRight: '8px' }}>
                    Documentation
                </button>
                <button style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px' }}>
                    Contact Support
                </button>
            </div>
        </div>
    );
}

export default AdvancedUsageExample;





