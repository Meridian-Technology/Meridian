import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import SettingsList from '../../../../components/SettingsList/SettingsList';
import TabbedContainer from '../../../../components/TabbedContainer/TabbedContainer';
import UnsavedChangesBanner from '../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';
import ApprovalConfig from '../../ApprovalConfig';
import './EditStakeholderRole.scss';

const PERMISSION_OPTIONS = [
    { value: 'approve_events', label: 'Approve events' },
    { value: 'reject_events', label: 'Reject events' },
    { value: 'acknowledge_events', label: 'Acknowledge events' },
    { value: 'view_events', label: 'View events' },
    { value: 'view_analytics', label: 'View analytics' },
    { value: 'manage_capacity', label: 'Manage capacity' },
    { value: 'manage_schedule', label: 'Manage schedule' },
    { value: 'override_restrictions', label: 'Override restrictions' },
    { value: 'manage_stakeholders', label: 'Manage stakeholders' },
    { value: 'view_reports', label: 'View reports' }
];

const REQUIREMENT_OPTIONS = [
    { value: 'faculty', label: 'Faculty' },
    { value: 'staff', label: 'Staff' },
    { value: 'admin_training', label: 'Admin training' },
    { value: 'background_check', label: 'Background check' },
    { value: 'security_clearance', label: 'Security clearance' },
    { value: 'department_head', label: 'Department head' },
    { value: 'facilities_training', label: 'Facilities training' },
    { value: 'event_management_certification', label: 'Event management certification' }
];

const STAKEHOLDER_TYPE_OPTIONS = [
    { value: 'approver', label: 'Approver' },
    { value: 'acknowledger', label: 'Acknowledger' },
    { value: 'notifiee', label: 'Notifiee' }
];

function buildSnapshot(role) {
    const ac = role.approvalConfig || {};
    const esc = role.escalationRules && typeof role.escalationRules === 'object' ? role.escalationRules : {};
    return {
        stakeholderName: role.stakeholderName || '',
        description: role.description || '',
        stakeholderType: role.stakeholderType || 'approver',
        permissions: [...(role.permissions || [])],
        requirements: [...(role.requirements || [])],
        approvalConfig: {
            requiredApprovals: Math.max(1, Number(ac.requiredApprovals) || 1),
            allowSelfApproval: !!ac.allowSelfApproval,
            requireAllMembers: !!ac.requireAllMembers
        },
        escalationRules: {
            timeout: Math.max(1, Number(esc.timeout) || 72),
            autoEscalate: esc.autoEscalate !== false
        }
    };
}

function activeMemberCount(role) {
    return (role?.members || []).filter((m) => m.isActive !== false).length;
}

const EditStakeholderRole = ({ stakeholderRole, domainId, onClose, onSaved }) => {
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState('details');
    const [local, setLocal] = useState(() => buildSnapshot(stakeholderRole));
    const [original, setOriginal] = useState(() => JSON.parse(JSON.stringify(buildSnapshot(stakeholderRole))));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setActiveTab('details');
        const snap = buildSnapshot(stakeholderRole);
        setLocal(snap);
        setOriginal(JSON.parse(JSON.stringify(snap)));
    }, [stakeholderRole]);

    const hasChanges = useMemo(
        () => original && local && JSON.stringify(local) !== JSON.stringify(original),
        [original, local]
    );

    const updateLocal = useCallback((patch) => {
        setLocal((prev) => ({ ...prev, ...patch }));
    }, []);

    const updateApprovalConfig = useCallback((field, value) => {
        setLocal((prev) => ({
            ...prev,
            approvalConfig: { ...prev.approvalConfig, [field]: value }
        }));
    }, []);

    const updateEscalation = useCallback((field, value) => {
        setLocal((prev) => ({
            ...prev,
            escalationRules: { ...prev.escalationRules, [field]: value }
        }));
    }, []);

    const toggleFromList = useCallback((listKey, value) => {
        setLocal((prev) => {
            const arr = prev[listKey] || [];
            const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
            return { ...prev, [listKey]: next };
        });
    }, []);

    const handleDiscard = useCallback(() => {
        setLocal(JSON.parse(JSON.stringify(original)));
    }, [original]);

    const handleSave = async () => {
        if (!stakeholderRole?._id || !local) return false;
        if (!local.stakeholderName.trim()) {
            addNotification({
                title: 'Missing name',
                message: 'Please enter a display name for this role.',
                type: 'error'
            });
            return false;
        }
        setSaving(true);
        try {
            const membersActive = activeMemberCount(stakeholderRole);
            let requiredApprovals = Math.max(1, local.approvalConfig.requiredApprovals);
            if (local.approvalConfig.requireAllMembers && membersActive > 0) {
                requiredApprovals = membersActive;
            } else if (membersActive > 0) {
                requiredApprovals = Math.min(requiredApprovals, membersActive);
            }

            const escalationBase =
                stakeholderRole.escalationRules && typeof stakeholderRole.escalationRules === 'object'
                    ? stakeholderRole.escalationRules
                    : {};

            const body = {
                stakeholderName: local.stakeholderName.trim(),
                description: local.description.trim(),
                stakeholderType: local.stakeholderType,
                permissions: local.permissions,
                requirements: local.requirements,
                approvalConfig: {
                    ...stakeholderRole.approvalConfig,
                    ...local.approvalConfig,
                    requiredApprovals,
                    totalMembers: membersActive
                },
                escalationRules: {
                    ...escalationBase,
                    timeout: local.escalationRules.timeout,
                    autoEscalate: local.escalationRules.autoEscalate
                }
            };

            const response = await postRequest(`/api/stakeholder-roles/${stakeholderRole._id}`, body, {
                method: 'PUT'
            });

            if (response.success) {
                addNotification({
                    title: 'Saved',
                    message: 'Stakeholder role was updated.',
                    type: 'success'
                });
                const updatedRole = response.data != null ? response.data : { ...stakeholderRole, ...body };
                const next = buildSnapshot(updatedRole);
                setLocal(next);
                setOriginal(JSON.parse(JSON.stringify(next)));
                if (typeof onSaved === 'function') {
                    onSaved();
                }
                return true;
            }
            addNotification({
                title: 'Could not save',
                message: response.message || 'Update failed.',
                type: 'error'
            });
            return false;
        } catch (e) {
            console.error(e);
            addNotification({
                title: 'Error',
                message: e?.message || 'Failed to save stakeholder role.',
                type: 'error'
            });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleAttemptClose = () => {
        if (hasChanges && !window.confirm('You have unsaved changes on the Role details tab. Close anyway?')) {
            return;
        }
        onClose?.();
    };

    const membersActive = activeMemberCount(stakeholderRole);
    const maxApprovals = Math.max(1, membersActive || 1);

    const identityItems = useMemo(
        () => [
            {
                title: 'Display name',
                subtitle: 'Shown across dashboards and assignment flows.',
                action: (
                    <input
                        type="text"
                        value={local.stakeholderName}
                        onChange={(e) => updateLocal({ stakeholderName: e.target.value })}
                        placeholder="Role name"
                    />
                )
            },
            {
                title: 'Description',
                subtitle: 'Optional context for admins and assignees.',
                action: (
                    <textarea
                        className="edit-stakeholder-textarea"
                        rows={3}
                        value={local.description}
                        onChange={(e) => updateLocal({ description: e.target.value })}
                        placeholder="What this role is responsible for"
                    />
                )
            },
            {
                title: 'Role type',
                subtitle: 'Controls default routing behavior for conditions on the Approval tab.',
                action: (
                    <select
                        value={local.stakeholderType}
                        onChange={(e) => updateLocal({ stakeholderType: e.target.value })}
                    >
                        {STAKEHOLDER_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                )
            },
            {
                title: 'Internal ID',
                subtitle: 'Stable key used by integrations (read-only).',
                action: <span className="edit-stakeholder-readonly">{stakeholderRole.stakeholderId || '—'}</span>
            },
            {
                title: 'Active assignees',
                subtitle: 'Use Assign User on the domain card to add or remove people.',
                action: (
                    <span className="edit-stakeholder-readonly">
                        {membersActive} active
                    </span>
                )
            }
        ],
        [local.stakeholderName, local.description, local.stakeholderType, membersActive, stakeholderRole.stakeholderId, updateLocal]
    );

    const approvalSettingsItems = useMemo(
        () => [
            {
                title: 'Required approvals',
                subtitle:
                    membersActive < 1
                        ? 'Add assignees before this role can participate in multi-approval flows.'
                        : `Between 1 and ${maxApprovals} for this role (currently ${membersActive} active assignees).`,
                action: (
                    <input
                        type="number"
                        min={1}
                        max={maxApprovals}
                        disabled={local.approvalConfig.requireAllMembers || membersActive < 1}
                        value={local.approvalConfig.requireAllMembers ? maxApprovals : local.approvalConfig.requiredApprovals}
                        onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            updateApprovalConfig('requiredApprovals', Number.isFinite(n) ? Math.min(maxApprovals, Math.max(1, n)) : 1);
                        }}
                    />
                )
            },
            {
                title: 'Require all active assignees',
                subtitle: 'Every active member must weigh in before this step clears.',
                action: (
                    <input
                        type="checkbox"
                        checked={!!local.approvalConfig.requireAllMembers}
                        onChange={(e) => {
                            const on = e.target.checked;
                            updateApprovalConfig('requireAllMembers', on);
                            if (on) {
                                updateApprovalConfig('requiredApprovals', maxApprovals);
                            }
                        }}
                    />
                )
            },
            {
                title: 'Allow self-approval',
                subtitle: 'When permitted by policy, an assignee may approve their own submission.',
                action: (
                    <input
                        type="checkbox"
                        checked={!!local.approvalConfig.allowSelfApproval}
                        onChange={(e) => updateApprovalConfig('allowSelfApproval', e.target.checked)}
                    />
                )
            }
        ],
        [
            local.approvalConfig.allowSelfApproval,
            local.approvalConfig.requireAllMembers,
            local.approvalConfig.requiredApprovals,
            maxApprovals,
            membersActive,
            updateApprovalConfig
        ]
    );

    const escalationItems = useMemo(
        () => [
            {
                title: 'Escalation timeout (hours)',
                subtitle: 'Hours before stale items can escalate (if escalation is configured on the role).',
                action: (
                    <input
                        type="number"
                        min={1}
                        value={local.escalationRules.timeout}
                        onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            updateEscalation('timeout', Number.isFinite(n) ? Math.max(1, n) : 72);
                        }}
                    />
                )
            },
            {
                title: 'Auto-escalate',
                subtitle: 'Automatically escalate when the timeout is reached.',
                action: (
                    <input
                        type="checkbox"
                        checked={!!local.escalationRules.autoEscalate}
                        onChange={(e) => updateEscalation('autoEscalate', e.target.checked)}
                    />
                )
            }
        ],
        [local.escalationRules.autoEscalate, local.escalationRules.timeout, updateEscalation]
    );

    const permissionItems = useMemo(
        () => [
            {
                title: 'Permissions',
                subtitle: 'Fine-grained capabilities for members of this stakeholder role.',
                action: (
                    <div className="edit-stakeholder-checkbox-grid">
                        {PERMISSION_OPTIONS.map((opt) => (
                            <label key={opt.value} className="edit-stakeholder-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={local.permissions.includes(opt.value)}
                                    onChange={() => toggleFromList('permissions', opt.value)}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                )
            }
        ],
        [local.permissions, toggleFromList]
    );

    const requirementItems = useMemo(
        () => [
            {
                title: 'Assignment requirements',
                subtitle: 'Users must satisfy these tags before they can be assigned (enforced server-side when supported).',
                action: (
                    <div className="edit-stakeholder-checkbox-grid">
                        {REQUIREMENT_OPTIONS.map((opt) => (
                            <label key={opt.value} className="edit-stakeholder-checkbox-inline">
                                <input
                                    type="checkbox"
                                    checked={local.requirements.includes(opt.value)}
                                    onChange={() => toggleFromList('requirements', opt.value)}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                )
            }
        ],
        [local.requirements, toggleFromList]
    );

    const detailsTab = (
        <div className="edit-stakeholder-tab-panel">
            <div className="config-sections">
                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:card-account-details" />
                        Identity
                    </h2>
                    <SettingsList items={identityItems} />
                </div>
                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:account-check" />
                        Approval settings
                    </h2>
                    <p className="config-help">
                        Thresholds apply to how many assignees must participate. Pair with the Approval rules tab for
                        when this role is required.
                    </p>
                    <SettingsList items={approvalSettingsItems} />
                </div>
                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:clock-alert" />
                        Escalation
                    </h2>
                    <SettingsList items={escalationItems} />
                </div>
                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:shield-key" />
                        Capabilities
                    </h2>
                    <SettingsList items={permissionItems} />
                </div>
                <div className="config-section">
                    <h2>
                        <Icon icon="mdi:badge-account-horizontal" />
                        Requirements
                    </h2>
                    <SettingsList items={requirementItems} />
                </div>
            </div>
        </div>
    );

    const approvalTab = (
        <div className="edit-stakeholder-tab-panel edit-stakeholder-tab-panel--approval">
            <ApprovalConfig
                key={stakeholderRole._id}
                domainId={domainId}
                stakeholderRole={stakeholderRole}
                embedded
                onSaved={onSaved}
            />
        </div>
    );

    const tabs = [
        {
            id: 'details',
            label: 'Role details',
            icon: 'mdi:tune',
            content: detailsTab
        },
        {
            id: 'approval',
            label: 'Approval rules',
            icon: 'mdi:shield-check',
            content: approvalTab
        }
    ];

    return (
        <div className="edit-stakeholder-modal configuration dash">
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={handleSave}
                onDiscard={handleDiscard}
                saving={saving}
            />
            <div className="edit-stakeholder-modal__chrome">
                <header className="edit-stakeholder-modal__header">
                    <div>
                        <h1>Edit stakeholder role</h1>
                        <p>Update identity, approval thresholds, and when this role applies to submissions.</p>
                    </div>
                    <button type="button" className="edit-stakeholder-modal__close" onClick={handleAttemptClose} aria-label="Close">
                        <Icon icon="mdi:close" />
                    </button>
                </header>

                <div className="edit-stakeholder-modal__tabs">
                    <TabbedContainer
                        tabs={tabs}
                        defaultTab="details"
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        tabStyle="underline"
                        showTabIcons
                        showTabLabels
                        lazyLoad
                        keepAlive
                        fullWidth
                        className="edit-stakeholder-tabbed"
                    />
                </div>
            </div>
        </div>
    );
};

export default EditStakeholderRole;
