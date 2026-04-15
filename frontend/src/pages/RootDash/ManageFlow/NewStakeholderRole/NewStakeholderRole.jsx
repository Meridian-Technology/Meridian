import React, { useState, useEffect } from 'react';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import Flag from '../../../../components/Flag/Flag';
import UserSearch from '../../../../components/UserSearch/UserSearch';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';
import { useFetch } from '../../../../hooks/useFetch';
import './NewStakeholderRole.scss';

function memberUserId(m) {
    if (!m || m.userId == null) return null;
    return m.userId._id || m.userId;
}

function buildStakeholderPayload(data) {
    const members = (data.members || []).map((m) => ({
        userId: memberUserId(m),
        assignedAt: m.assignedAt || new Date(),
        assignedBy: m.assignedBy?._id || m.assignedBy || 'system',
        isActive: m.isActive !== false
    }));
    const activeCount = members.filter((m) => m.isActive).length;
    return {
        stakeholderId: data.stakeholderId,
        stakeholderName: data.stakeholderName,
        stakeholderType: data.stakeholderType,
        domainId: data.domainId,
        description: data.description,
        permissions: data.permissions,
        requirements: data.requirements,
        members,
        approvalConfig: {
            ...data.approvalConfig,
            totalMembers: activeCount
        },
        escalationRules: data.escalationRules,
        conditionGroups: data.conditionGroups || [],
        groupLogicalOperators: data.groupLogicalOperators || [],
        isActive: data.isActive
    };
}

const NewStakeholderRole = ({ handleClose, refetch, editingRoleId = null, defaultDomainId = null }) => {
    const [stakeholderData, setStakeholderData] = useState({
        stakeholderId: '',
        stakeholderName: '',
        stakeholderType: 'approver',
        domainId: '',
        description: '',
        permissions: [],
        requirements: [],
        members: [],
        approvalConfig: {
            requiredApprovals: 1,
            totalMembers: 0,
            allowSelfApproval: false,
            requireAllMembers: false
        },
        escalationRules: {
            timeout: 72,
            autoEscalate: true
        },
        conditionGroups: [],
        groupLogicalOperators: [],
        isActive: true
    });

    const [domains, setDomains] = useState([]);
    const [loading, setLoading] = useState(false);
    const [roleDetailLoading, setRoleDetailLoading] = useState(false);
    const [roleDetailError, setRoleDetailError] = useState(null);
    const [errors, setErrors] = useState({});
    const { addNotification } = useNotification();

    // Fetch available domains
    const eventSystemConfigData = useFetch('/api/event-system-config');

    useEffect(() => {
        if (eventSystemConfigData.data?.data?.domains) {
            setDomains(eventSystemConfigData.data.data.domains);
            console.log(eventSystemConfigData.data.data.domains);
        }
    }, [eventSystemConfigData.data]);

    // Auto-generate stakeholderId from stakeholderName (create only)
    useEffect(() => {
        if (editingRoleId) return;
        if (stakeholderData.stakeholderName) {
            const generatedId = stakeholderData.stakeholderName
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, '_')
                .trim();
            setStakeholderData(prev => ({
                ...prev,
                stakeholderId: generatedId
            }));
        }
    }, [stakeholderData.stakeholderName, editingRoleId]);

    useEffect(() => {
        if (editingRoleId) return;
        if (!defaultDomainId) return;
        setStakeholderData((prev) => ({ ...prev, domainId: String(defaultDomainId) }));
    }, [editingRoleId, defaultDomainId]);

    useEffect(() => {
        if (!editingRoleId) {
            setRoleDetailLoading(false);
            setRoleDetailError(null);
            return;
        }

        let cancelled = false;
        setRoleDetailLoading(true);
        setRoleDetailError(null);

        (async () => {
            try {
                const res = await postRequest(`/api/stakeholder-roles/${editingRoleId}`, null, {
                    method: 'GET'
                });
                if (cancelled) return;
                if (res?.success && res.data) {
                    const r = res.data;
                    setStakeholderData({
                        stakeholderId: r.stakeholderId,
                        stakeholderName: r.stakeholderName,
                        stakeholderType: r.stakeholderType,
                        domainId: r.domainId?._id ? String(r.domainId._id) : String(r.domainId),
                        description: r.description || '',
                        permissions: [...(r.permissions || [])],
                        requirements: [...(r.requirements || [])],
                        members: [...(r.members || [])],
                        approvalConfig: {
                            requiredApprovals: r.approvalConfig?.requiredApprovals ?? 1,
                            totalMembers:
                                r.approvalConfig?.totalMembers ??
                                (r.members || []).filter((m) => m.isActive !== false).length,
                            allowSelfApproval: !!r.approvalConfig?.allowSelfApproval,
                            requireAllMembers: !!r.approvalConfig?.requireAllMembers
                        },
                        escalationRules: {
                            timeout: r.escalationRules?.timeout ?? 72,
                            autoEscalate: r.escalationRules?.autoEscalate !== false,
                            escalateTo: r.escalationRules?.escalateTo,
                            escalateToUser: r.escalationRules?.escalateToUser,
                            escalationMessage: r.escalationRules?.escalationMessage
                        },
                        conditionGroups: [...(r.conditionGroups || [])],
                        groupLogicalOperators: [...(r.groupLogicalOperators || [])],
                        isActive: r.isActive !== false
                    });
                } else {
                    setRoleDetailError(res?.message || 'Failed to load stakeholder role');
                }
            } catch (e) {
                if (!cancelled) setRoleDetailError(e?.message || 'Failed to load stakeholder role');
            } finally {
                if (!cancelled) setRoleDetailLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [editingRoleId]);

    const validateForm = () => {
        const newErrors = {};

        if (!stakeholderData.stakeholderName.trim()) {
            newErrors.stakeholderName = 'Stakeholder name is required';
        }

        if (!stakeholderData.stakeholderId.trim()) {
            newErrors.stakeholderId = 'Stakeholder ID is required';
        }

        if (!stakeholderData.stakeholderType) {
            newErrors.stakeholderType = 'Stakeholder type is required';
        }

        if (!stakeholderData.domainId) {
            newErrors.domainId = 'Domain is required';
        }

        if (stakeholderData.permissions.length === 0) {
            newErrors.permissions = 'At least one permission is required';
        }

        if (stakeholderData.members.length === 0) {
            newErrors.members = 'At least one member is required';
        }

        if (stakeholderData.approvalConfig.requiredApprovals > stakeholderData.members.length) {
            newErrors.requiredApprovals = 'Required approvals cannot exceed number of members';
        }

        if (stakeholderData.escalationRules.timeout < 1) {
            newErrors.timeout = 'Timeout must be at least 1 hour';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleInputChange = (field, value) => {
        setStakeholderData(prev => ({
            ...prev,
            [field]: value
        }));
        
        // Clear error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({
                ...prev,
                [field]: null
            }));
        }
    };

    const handleNestedInputChange = (parent, field, value) => {
        setStakeholderData(prev => ({
            ...prev,
            [parent]: {
                ...prev[parent],
                [field]: value
            }
        }));
    };

    const handleApprovalConfigChange = (field, value) => {
        setStakeholderData(prev => ({
            ...prev,
            approvalConfig: {
                ...prev.approvalConfig,
                [field]: value
            }
        }));
    };

    const handlePermissionToggle = (permission) => {
        setStakeholderData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permission)
                ? prev.permissions.filter(p => p !== permission)
                : [...prev.permissions, permission]
        }));
    };

    const handleRequirementToggle = (requirement) => {
        setStakeholderData(prev => ({
            ...prev,
            requirements: prev.requirements.includes(requirement)
                ? prev.requirements.filter(r => r !== requirement)
                : [...prev.requirements, requirement]
        }));
    };

    const handleMemberAdd = (user) => {
        setStakeholderData((prev) => {
            const nextMembers = [
                ...prev.members,
                {
                    userId: user._id,
                    assignedAt: new Date(),
                    assignedBy: 'system',
                    isActive: true
                }
            ];
            const active = nextMembers.filter((m) => m.isActive !== false).length;
            return {
                ...prev,
                members: nextMembers,
                approvalConfig: {
                    ...prev.approvalConfig,
                    totalMembers: active
                }
            };
        });
    };

    const handleMemberRemove = (index) => {
        setStakeholderData((prev) => {
            const nextMembers = prev.members.filter((_, i) => i !== index);
            const active = nextMembers.filter((m) => m.isActive !== false).length;
            return {
                ...prev,
                members: nextMembers,
                approvalConfig: {
                    ...prev.approvalConfig,
                    totalMembers: active,
                    requiredApprovals: Math.min(
                        Math.max(1, prev.approvalConfig.requiredApprovals),
                        Math.max(1, active)
                    )
                }
            };
        });
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            addNotification({
                title: 'Validation Error',
                message: 'Please fix the errors before submitting',
                type: 'error'
            });
            return;
        }

        setLoading(true);
        
        try {
            const payload = buildStakeholderPayload(stakeholderData);
            const response = editingRoleId
                ? await postRequest(`/api/stakeholder-roles/${editingRoleId}`, payload, { method: 'PUT' })
                : await postRequest('/api/stakeholder-role', payload);
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: editingRoleId
                        ? 'Stakeholder role updated successfully'
                        : 'Stakeholder role created successfully',
                    type: 'success'
                });
                
                setStakeholderData({
                    stakeholderId: '',
                    stakeholderName: '',
                    stakeholderType: 'approver',
                    domainId: '',
                    description: '',
                    permissions: [],
                    requirements: [],
                    members: [],
                    approvalConfig: {
                        requiredApprovals: 1,
                        totalMembers: 0,
                        allowSelfApproval: false,
                        requireAllMembers: false
                    },
                    escalationRules: {
                        timeout: 72,
                        autoEscalate: true
                    },
                    conditionGroups: [],
                    groupLogicalOperators: [],
                    isActive: true
                });
                setErrors({});
                refetch();
                handleClose();
            } else {
                addNotification({
                    title: 'Error',
                    message:
                        response.message ||
                        (editingRoleId ? 'Failed to update stakeholder role' : 'Failed to create stakeholder role'),
                    type: 'error'
                });
            }
        } catch (error) {
            console.error(
                editingRoleId ? 'Error updating stakeholder role:' : 'Error creating stakeholder role:',
                error
            );
            addNotification({
                title: 'Error',
                message: editingRoleId
                    ? 'Failed to update stakeholder role'
                    : 'Failed to create stakeholder role',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const permissions = [
        'approve_events',
        'reject_events',
        'acknowledge_events',
        'view_events',
        'view_analytics',
        'manage_capacity',
        'manage_schedule',
        'override_restrictions',
        'manage_stakeholders',
        'view_reports'
    ];

    const requirements = [
        'faculty',
        'staff',
        'admin_training',
        'background_check',
        'security_clearance',
        'department_head',
        'facilities_training',
        'event_management_certification'
    ];

    const stakeholderTypes = [
        { value: 'approver', label: 'Approver', description: 'Can approve or reject events' },
        { value: 'acknowledger', label: 'Acknowledger', description: 'Must acknowledge events (non-blocking)' },
        { value: 'notifiee', label: 'Notifiee', description: 'Receives notifications for awareness' }
    ];

    const isEditMode = Boolean(editingRoleId);
    const editFormBlocked = isEditMode && (roleDetailLoading || roleDetailError);

    return (
        <HeaderContainer
            classN="new-stakeholder-role"
            icon="fluent:person-24-filled"
            header={isEditMode ? 'Edit Stakeholder Role' : 'New Stakeholder Role'}
            subHeader={isEditMode ? 'update role, members, and approval settings' : 'create a new stakeholder role'}
        >
            {isEditMode && roleDetailLoading ? (
                <p className="role-form-loading">Loading stakeholder role…</p>
            ) : isEditMode && roleDetailError ? (
                <p className="role-form-loading">Unable to load this role. Close and try again.</p>
            ) : null}
            <div className="header">
                <h2>{isEditMode ? 'Edit Stakeholder Role' : 'New Stakeholder Role'}</h2>
                <p>{isEditMode ? 'Update this role for your domain' : 'create a new stakeholder role for event management'}</p>
            </div>
            <Flag 
                text="Stakeholder roles define who can approve, acknowledge, or be notified about events. Each role is associated with a specific domain and can have multiple users assigned as primary or backup assignees." 
                primary="rgba(235,226,127,0.32)" 
                accent='#B29F5F' 
                color="#B29F5F" 
                icon={'lets-icons:info-alt-fill'}
            />
            <form onSubmit={onSubmit} className="content">
                {/* Basic Information */}
                <div className="section">
                    <h3>Basic Information</h3>
                    <div className="field">
                        <label htmlFor="stakeholder-name">Stakeholder Name *</label>
                        <input 
                            type="text" 
                            name="stakeholder-name" 
                            id="stakeholder-name" 
                            className="short" 
                            value={stakeholderData.stakeholderName} 
                            onChange={(e) => handleInputChange('stakeholderName', e.target.value)}
                            placeholder="Enter stakeholder role name (e.g., Alumni House Manager)"
                        />
                        {errors.stakeholderName && <span className="error">{errors.stakeholderName}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="stakeholder-id">Stakeholder ID *</label>
                        <input 
                            type="text" 
                            name="stakeholder-id" 
                            id="stakeholder-id" 
                            className="short" 
                            value={stakeholderData.stakeholderId} 
                            onChange={(e) => handleInputChange('stakeholderId', e.target.value)}
                            placeholder="Auto-generated from name (e.g., alumni_house_manager)"
                            readOnly={isEditMode}
                            title={isEditMode ? 'Stakeholder ID cannot be changed after creation' : undefined}
                        />
                        {errors.stakeholderId && <span className="error">{errors.stakeholderId}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="stakeholder-type">Stakeholder Type *</label>
                        <select 
                            name="stakeholder-type" 
                            id="stakeholder-type" 
                            className="short" 
                            value={stakeholderData.stakeholderType} 
                            onChange={(e) => handleInputChange('stakeholderType', e.target.value)}
                        >
                            {stakeholderTypes.map(type => (
                                <option key={type.value} value={type.value}>
                                    {type.label} - {type.description}
                                </option>
                            ))}
                        </select>
                        {errors.stakeholderType && <span className="error">{errors.stakeholderType}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="domain">Domain *</label>
                        <select 
                            name="domain" 
                            id="domain" 
                            className="short" 
                            value={stakeholderData.domainId} 
                            onChange={(e) => handleInputChange('domainId', e.target.value)}
                        >
                            <option value="">Select a domain</option>
                            {domains.map(domain => (
                                <option key={domain._id} value={domain._id}>
                                    {domain.name} ({domain.type})
                                </option>
                            ))}
                        </select>
                        {errors.domainId && <span className="error">{errors.domainId}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="description">Description</label>
                        <textarea 
                            name="description" 
                            id="description" 
                            className="long" 
                            value={stakeholderData.description} 
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder="Describe the stakeholder role and its responsibilities"
                            rows="3"
                        />
                    </div>
                </div>

                {/* Permissions */}
                <div className="section">
                    <h3>Permissions *</h3>
                    <div className="checkbox-group">
                        {permissions.map(permission => (
                            <label key={permission} className="checkbox-item">
                                <input 
                                    type="checkbox" 
                                    checked={stakeholderData.permissions.includes(permission)}
                                    onChange={() => handlePermissionToggle(permission)}
                                />
                                <span>{permission.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                            </label>
                        ))}
                    </div>
                    {errors.permissions && <span className="error">{errors.permissions}</span>}
                </div>

                {/* Requirements */}
                <div className="section">
                    <h3>Requirements</h3>
                    <div className="checkbox-group">
                        {requirements.map(requirement => (
                            <label key={requirement} className="checkbox-item">
                                <input 
                                    type="checkbox" 
                                    checked={stakeholderData.requirements.includes(requirement)}
                                    onChange={() => handleRequirementToggle(requirement)}
                                />
                                <span>{requirement.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Members */}
                <div className="section">
                    <h3>Members *</h3>
                    <p className="section-description">Add members who can approve events. Configure how many approvals are required.</p>
                    
                    {stakeholderData.members.length > 0 && (
                        <div className="members">
                            {stakeholderData.members.map((member, index) => (
                                <div key={index} className="member">
                                    <div className="user-info">
                                        <span className="member-number">#{index + 1}</span>
                                        <span className="user-name">{member.userId?.name || 'User'}</span>
                                        <span className="user-email">{member.userId?.email || 'email@example.com'}</span>
                                    </div>
                                    <button 
                                        type="button" 
                                        className="remove-member" 
                                        onClick={() => handleMemberRemove(index)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <UserSearch 
                        onUserSelect={handleMemberAdd}
                        placeholder="Search for members by name or username"
                        excludeIds={stakeholderData.members.map((m) => memberUserId(m)).filter(Boolean)}
                    />
                    {errors.members && <span className="error">{errors.members}</span>}
                    
                    {/* Approval Configuration */}
                    {stakeholderData.members.length > 0 && (
                        <div className="approval-config">
                            <h4>Approval Configuration</h4>
                            
                            <div className="field">
                                <label htmlFor="required-approvals">Required Approvals</label>
                                <input 
                                    type="number" 
                                    name="required-approvals" 
                                    id="required-approvals" 
                                    className="short" 
                                    value={stakeholderData.approvalConfig.requiredApprovals} 
                                    onChange={(e) => handleApprovalConfigChange('requiredApprovals', parseInt(e.target.value))}
                                    min="1"
                                    max={stakeholderData.members.length}
                                />
                                <span className="field-help">
                                    Out of {stakeholderData.members.length} members
                                </span>
                                {errors.requiredApprovals && <span className="error">{errors.requiredApprovals}</span>}
                            </div>
                            
                            <div className="field">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={stakeholderData.approvalConfig.requireAllMembers}
                                        onChange={(e) => handleApprovalConfigChange('requireAllMembers', e.target.checked)}
                                    />
                                    <span>Require all members to approve (overrides required approvals)</span>
                                </label>
                            </div>
                            
                            <div className="field">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={stakeholderData.approvalConfig.allowSelfApproval}
                                        onChange={(e) => handleApprovalConfigChange('allowSelfApproval', e.target.checked)}
                                    />
                                    <span>Allow self-approval (members can approve their own events)</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                {/* Escalation Rules */}
                <div className="section">
                    <h3>Escalation Rules</h3>
                    <div className="field">
                        <label htmlFor="timeout">Timeout (hours)</label>
                        <input 
                            type="number" 
                            name="timeout" 
                            id="timeout" 
                            className="short" 
                            value={stakeholderData.escalationRules.timeout} 
                            onChange={(e) => handleNestedInputChange('escalationRules', 'timeout', parseInt(e.target.value))}
                            min="1"
                        />
                        {errors.timeout && <span className="error">{errors.timeout}</span>}
                    </div>
                    
                    <div className="field">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={stakeholderData.escalationRules.autoEscalate}
                                onChange={(e) => handleNestedInputChange('escalationRules', 'autoEscalate', e.target.checked)}
                            />
                            <span>Auto-escalate when timeout is reached</span>
                        </label>
                    </div>
                </div>

                {/* Status */}
                <div className="section">
                    <h3>Status</h3>
                    <div className="field">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={stakeholderData.isActive}
                                onChange={(e) => handleInputChange('isActive', e.target.checked)}
                            />
                            <span>Active (role is available for assignment)</span>
                        </label>
                    </div>
                </div>

                <button type="submit" className="submit-button" disabled={loading || editFormBlocked}>
                    {loading
                        ? isEditMode
                            ? 'Saving...'
                            : 'Creating...'
                        : isEditMode
                            ? 'Save Stakeholder Role'
                            : 'Create Stakeholder Role'}
                </button>
            </form>
        </HeaderContainer>
    );
};

export default NewStakeholderRole;