import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import Flag from '../../../../components/Flag/Flag';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';
import { useFetch } from '../../../../hooks/useFetch';
import { classroomBuildingLabel } from '../../../../utils/classroomBuildingLabel';
import './NewDomain.scss';

const DEFAULT_SPACE_GOVERNANCE = {
    governingScope: {
        kind: 'all_spaces',
        buildingIds: [],
        spaceIds: [],
        spaceGroupIds: []
    },
    concernScope: {
        kind: 'campus_wide',
        buildingIds: [],
        spaceIds: [],
        spaceGroupIds: []
    },
    scopeMode: 'inclusive'
};

const DEFAULT_TEMPLATE_OPTIONS = [
    'SpaceOwnerDomain',
    'CrossCampusObserver',
    'BuildingPortfolioManager'
];

function titleCaseScope(scopeKey) {
    return scopeKey === 'governingScope' ? 'Governing' : 'Concern';
}

function formatAttributePreview(attributes) {
    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) return '';
    const slice = attributes.slice(0, 4).map((a) => (typeof a === 'string' ? a : a?.name || a?.label || '')).filter(Boolean);
    return slice.join(' · ');
}

function buildRoomMetadata(room) {
    const rows = [];
    const buildingLabel = classroomBuildingLabel(room);
    if (buildingLabel) rows.push({ key: 'building', label: 'Building', value: buildingLabel });
    if (room.floor != null && String(room.floor).trim() !== '') {
        rows.push({ key: 'floor', label: 'Floor', value: String(room.floor) });
    }
    if (room.capacity != null && String(room.capacity).trim() !== '') {
        rows.push({ key: 'capacity', label: 'Capacity', value: String(room.capacity) });
    }
    if (room._id) rows.push({ key: 'id', label: 'Room ID', value: String(room._id) });
    const attrText = formatAttributePreview(room.attributes);
    if (attrText) rows.push({ key: 'attrs', label: 'Attributes', value: attrText });
    if (typeof room.average_rating === 'number' && room.number_of_ratings) {
        rows.push({
            key: 'rating',
            label: 'Rating',
            value: `${room.average_rating.toFixed(1)} (${room.number_of_ratings})`
        });
    }
    return rows;
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function defaultOperatingHours() {
    const row = (open, close) => ({ open, close, closed: false });
    return {
        monday: row('09:00', '17:00'),
        tuesday: row('09:00', '17:00'),
        wednesday: row('09:00', '17:00'),
        thursday: row('09:00', '17:00'),
        friday: row('09:00', '17:00'),
        saturday: row('10:00', '16:00'),
        sunday: row('10:00', '16:00')
    };
}

function mergeOperatingHours(raw) {
    const base = defaultOperatingHours();
    if (!raw || typeof raw !== 'object') return base;
    const out = { ...base };
    WEEKDAYS.forEach((day) => {
        if (raw[day]) out[day] = { ...base[day], ...raw[day] };
    });
    return out;
}

function mergeScopeFromApi(scope) {
    const s = scope && typeof scope === 'object' ? scope : {};
    return {
        kind: s.kind || 'campus_wide',
        buildingIds: [...(s.buildingIds || [])],
        spaceIds: [...(s.spaceIds || [])],
        spaceGroupIds: [...(s.spaceGroupIds || [])]
    };
}

function domainApiToForm(d) {
    const settings = d.domainSettings || {};
    return {
        name: d.name || '',
        type: d.type || 'facility',
        description: d.description || '',
        maxCapacity: settings.maxCapacity ?? null,
        allowedEventTypes: [...(settings.allowedEventTypes || [])],
        restrictedEventTypes: [...(settings.restrictedEventTypes || [])],
        operatingHours: mergeOperatingHours(settings.operatingHours),
        bookingRules: {
            maxAdvanceBooking: 30,
            minAdvanceBooking: 1,
            maxDuration: 8,
            minDuration: 0.5,
            allowRecurring: true,
            maxRecurringInstances: 12,
            ...(settings.bookingRules || {})
        },
        approvalWorkflow: {
            enabled: true,
            autoApprove: false,
            requireAllApprovers: true,
            escalationTimeout: 72,
            ...(settings.approvalWorkflow || {})
        },
        governanceTemplate: d.governanceTemplate || '',
        spaceGovernance: {
            governingScope: mergeScopeFromApi(d.spaceGovernance?.governingScope),
            concernScope: mergeScopeFromApi(d.spaceGovernance?.concernScope),
            scopeMode: d.spaceGovernance?.scopeMode || 'inclusive',
            priorityRules: [...(d.spaceGovernance?.priorityRules || [])]
        }
    };
}

function buildDomainPayload(domainData) {
    return {
        name: (domainData.name || '').trim(),
        type: domainData.type,
        description: domainData.description,
        governanceTemplate: domainData.governanceTemplate || undefined,
        spaceGovernance: domainData.spaceGovernance,
        domainSettings: {
            allowedEventTypes: domainData.allowedEventTypes,
            restrictedEventTypes: domainData.restrictedEventTypes,
            maxCapacity: domainData.maxCapacity,
            operatingHours: domainData.operatingHours,
            bookingRules: domainData.bookingRules,
            approvalWorkflow: domainData.approvalWorkflow
        }
    };
}

function initialDomainFormState() {
    return {
        name: '',
        type: 'facility',
        description: '',
        maxCapacity: null,
        allowedEventTypes: [],
        restrictedEventTypes: [],
        operatingHours: defaultOperatingHours(),
        bookingRules: {
            maxAdvanceBooking: 30,
            minAdvanceBooking: 1,
            maxDuration: 8,
            minDuration: 0.5,
            allowRecurring: true,
            maxRecurringInstances: 12
        },
        approvalWorkflow: {
            enabled: true,
            autoApprove: false,
            requireAllApprovers: true,
            escalationTimeout: 72
        },
        governanceTemplate: '',
        spaceGovernance: { ...DEFAULT_SPACE_GOVERNANCE }
    };
}

const NewDomain = ({ handleClose, refetch, editingDomainId = null }) => {
    const [domainData, setDomainData] = useState(() => initialDomainFormState());
    const templatesData = useFetch('/api/domain-governance-templates');
    const domainDetail = useFetch(editingDomainId ? `/api/domain/${editingDomainId}` : null);
    const templateOptions = templatesData.data?.data
        ? Object.keys(templatesData.data.data)
        : DEFAULT_TEMPLATE_OPTIONS;

    // Stable reference required: useFetch memoizes on options.params; a new object each render retriggers fetch forever.
    const buildingsListParams = useMemo(() => ({ page: 1, limit: 500, search: '' }), []);
    const buildingsFetch = useFetch('/admin/buildings', {
        method: 'GET',
        params: buildingsListParams
    });
    const buildingCatalog = buildingsFetch.data?.success ? buildingsFetch.data.buildings || [] : [];
    const buildingNameById = useMemo(() => {
        const m = {};
        buildingCatalog.forEach((b) => {
            if (b?._id) m[String(b._id)] = b.name || String(b._id);
        });
        return m;
    }, [buildingCatalog]);

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const { addNotification } = useNotification();
    const [spaceDisplayMap, setSpaceDisplayMap] = useState({ governingScope: {}, concernScope: {} });
    const [buildingPickDraft, setBuildingPickDraft] = useState({ governingScope: '', concernScope: '' });
    const [groupDraft, setGroupDraft] = useState({ governingScope: '', concernScope: '' });

    const [spacePickerScope, setSpacePickerScope] = useState(null);
    const [pickerQuery, setPickerQuery] = useState('');
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerResults, setPickerResults] = useState([]);
    const [pickerHighlight, setPickerHighlight] = useState(-1);
    const pickerInputRef = useRef(null);

    // Predefined event types
    const eventTypes = [
        'Academic',
        'Social',
        'Cultural',
        'Sports',
        'Workshop',
        'Conference',
        'Meeting',
        'Presentation',
        'Performance',
        'Exhibition',
        'Fundraiser',
        'Community Service',
        'Networking',
        'Training',
        'Recreation',
        'Religious',
        'Political',
        'Environmental',
        'Technology',
        'Arts',
        'Music',
        'Theater',
        'Dance',
        'Film',
        'Literature',
        'Science',
        'Research',
        'Career',
        'Health',
        'Wellness',
        'Food',
        'Cooking',
        'Travel',
        'International',
        'Alumni',
        'Graduate',
        'Undergraduate',
        'Faculty',
        'Staff',
        'Public'
    ];

    const validateForm = () => {
        const newErrors = {};

        if (!domainData.name.trim()) {
            newErrors.name = 'Domain name is required';
        }

        if (!domainData.type) {
            newErrors.type = 'Domain type is required';
        }

        if (domainData.maxCapacity && domainData.maxCapacity < 1) {
            newErrors.maxCapacity = 'Maximum capacity must be at least 1';
        }

        if (domainData.bookingRules.maxAdvanceBooking < 1) {
            newErrors.maxAdvanceBooking = 'Maximum advance booking must be at least 1 day';
        }

        if (domainData.bookingRules.minAdvanceBooking < 0) {
            newErrors.minAdvanceBooking = 'Minimum advance booking cannot be negative';
        }

        if (domainData.bookingRules.maxDuration < domainData.bookingRules.minDuration) {
            newErrors.maxDuration = 'Maximum duration must be greater than minimum duration';
        }

        if (domainData.approvalWorkflow.escalationTimeout < 1) {
            newErrors.escalationTimeout = 'Escalation timeout must be at least 1 hour';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleInputChange = (field, value) => {
        setDomainData(prev => ({
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
        setDomainData(prev => ({
            ...prev,
            [parent]: {
                ...prev[parent],
                [field]: value
            }
        }));
    };

    const handleOperatingHoursChange = (day, field, value) => {
        setDomainData(prev => ({
            ...prev,
            operatingHours: {
                ...prev.operatingHours,
                [day]: {
                    ...prev.operatingHours[day],
                    [field]: value
                }
            }
        }));
    };

    const handleScopeKindChange = (scopeKey, kind) => {
        setDomainData((prev) => ({
            ...prev,
            spaceGovernance: {
                ...prev.spaceGovernance,
                [scopeKey]: {
                    ...prev.spaceGovernance[scopeKey],
                    kind
                }
            }
        }));
    };

    const addScopeTag = (scopeKey, field, rawValue) => {
        const value = String(rawValue || '').trim();
        if (!value) return;
        setDomainData((prev) => {
            const current = prev.spaceGovernance?.[scopeKey]?.[field] || [];
            if (current.includes(value)) return prev;
            return {
                ...prev,
                spaceGovernance: {
                    ...prev.spaceGovernance,
                    [scopeKey]: {
                        ...prev.spaceGovernance[scopeKey],
                        [field]: [...current, value]
                    }
                }
            };
        });
    };

    const removeScopeTag = (scopeKey, field, value) => {
        setDomainData((prev) => ({
            ...prev,
            spaceGovernance: {
                ...prev.spaceGovernance,
                [scopeKey]: {
                    ...prev.spaceGovernance[scopeKey],
                    [field]: (prev.spaceGovernance?.[scopeKey]?.[field] || []).filter((v) => v !== value)
                }
            }
        }));
    };

    const addSpaceSelection = (scopeKey, room) => {
        if (!room?._id) return;
        const b = classroomBuildingLabel(room);
        const label = `${room.name || 'Unknown room'}${b ? ` (${b})` : ''}`;
        setSpaceDisplayMap((prev) => ({
            ...prev,
            [scopeKey]: {
                ...prev[scopeKey],
                [room._id]: label
            }
        }));
        addScopeTag(scopeKey, 'spaceIds', room._id);
        const rawB = room.building;
        let linkedBuildingId = '';
        if (rawB && typeof rawB === 'object' && rawB._id) {
            linkedBuildingId = String(rawB._id);
        } else if (typeof rawB === 'string' && /^[a-fA-F0-9]{24}$/.test(rawB)) {
            linkedBuildingId = rawB;
        }
        if (linkedBuildingId) {
            addScopeTag(scopeKey, 'buildingIds', linkedBuildingId);
        }
    };

    const openSpacePicker = (scopeKey) => {
        setSpacePickerScope(scopeKey);
        setPickerQuery('');
        setPickerResults([]);
        setPickerHighlight(-1);
    };

    const closeSpacePicker = useCallback(() => {
        setSpacePickerScope(null);
        setPickerQuery('');
        setPickerResults([]);
        setPickerLoading(false);
        setPickerHighlight(-1);
    }, []);

    useEffect(() => {
        if (!editingDomainId) return;
        const raw = domainDetail.data?.data;
        if (!raw) return;
        const form = domainApiToForm(raw);
        setDomainData(form);
        const labelFor = (ids) =>
            Object.fromEntries(
                (ids || []).map((id) => {
                    const sid = String(id);
                    return [sid, sid.length > 8 ? `Space …${sid.slice(-8)}` : `Space ${sid}`];
                })
            );
        setSpaceDisplayMap({
            governingScope: labelFor(form.spaceGovernance?.governingScope?.spaceIds),
            concernScope: labelFor(form.spaceGovernance?.concernScope?.spaceIds)
        });
        setBuildingPickDraft({ governingScope: '', concernScope: '' });
        setGroupDraft({ governingScope: '', concernScope: '' });
        closeSpacePicker();
        setErrors({});
    }, [editingDomainId, domainDetail.data, closeSpacePicker]);

    useEffect(() => {
        if (!spacePickerScope) return undefined;

        const q = pickerQuery.trim();
        if (q.length < 2) {
            setPickerResults([]);
            setPickerLoading(false);
            setPickerHighlight(-1);
            return undefined;
        }

        const timer = setTimeout(async () => {
            setPickerLoading(true);
            try {
                const response = await postRequest('/search-rooms', null, {
                    method: 'GET',
                    params: {
                        query: q,
                        limit: 20,
                        page: 1
                    }
                });

                if (response?.success && Array.isArray(response.rooms)) {
                    setPickerResults(response.rooms);
                    setPickerHighlight(response.rooms.length ? 0 : -1);
                } else {
                    setPickerResults([]);
                    setPickerHighlight(-1);
                }
            } catch (error) {
                console.error('Space picker search failed:', error);
                setPickerResults([]);
                setPickerHighlight(-1);
            } finally {
                setPickerLoading(false);
            }
        }, 280);

        return () => clearTimeout(timer);
    }, [spacePickerScope, pickerQuery]);

    useEffect(() => {
        if (!spacePickerScope) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeSpacePicker();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [spacePickerScope, closeSpacePicker]);

    useEffect(() => {
        if (!spacePickerScope) return;
        const id = requestAnimationFrame(() => {
            pickerInputRef.current?.focus();
        });
        return () => cancelAnimationFrame(id);
    }, [spacePickerScope]);

    const handleEventTypeToggle = (type, isAllowed) => {
        if (isAllowed) {
            setDomainData(prev => ({
                ...prev,
                allowedEventTypes: [...prev.allowedEventTypes, type],
                restrictedEventTypes: prev.restrictedEventTypes.filter(t => t !== type)
            }));
        } else {
            setDomainData(prev => ({
                ...prev,
                allowedEventTypes: prev.allowedEventTypes.filter(t => t !== type),
                restrictedEventTypes: [...prev.restrictedEventTypes, type]
            }));
        }
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
            const payload = buildDomainPayload(domainData);
            const response = editingDomainId
                ? await postRequest(`/api/domain/${editingDomainId}`, payload, { method: 'PUT' })
                : await postRequest('/api/domain', payload);
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: editingDomainId ? 'Domain updated successfully' : 'Domain created successfully',
                    type: 'success'
                });
                
                setDomainData(initialDomainFormState());
                setSpaceDisplayMap({ governingScope: {}, concernScope: {} });
                setBuildingPickDraft({ governingScope: '', concernScope: '' });
                setGroupDraft({ governingScope: '', concernScope: '' });
                closeSpacePicker();
                setErrors({});
                refetch();
                handleClose();
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || (editingDomainId ? 'Failed to update domain' : 'Failed to create domain'),
                    type: 'error'
                });
            }
        } catch (error) {
            console.error(editingDomainId ? 'Error updating domain:' : 'Error creating domain:', error);
            addNotification({
                title: 'Error',
                message: editingDomainId ? 'Failed to update domain' : 'Failed to create domain',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    const pickerKeyDown = (e) => {
        if (!spacePickerScope) return;
        const tag = (e.target && e.target.tagName) || '';
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setPickerHighlight((i) => {
                if (!pickerResults.length) return -1;
                return i < pickerResults.length - 1 ? i + 1 : 0;
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setPickerHighlight((i) => {
                if (!pickerResults.length) return -1;
                return i > 0 ? i - 1 : pickerResults.length - 1;
            });
        } else if (e.key === 'Enter') {
            if (tag === 'INPUT' || tag === 'TEXTAREA') {
                e.preventDefault();
                if (pickerHighlight >= 0 && pickerResults[pickerHighlight]) {
                    addSpaceSelection(spacePickerScope, pickerResults[pickerHighlight]);
                }
                return;
            }
            if (pickerHighlight >= 0 && pickerResults[pickerHighlight]) {
                e.preventDefault();
                addSpaceSelection(spacePickerScope, pickerResults[pickerHighlight]);
            }
        }
    };

    const isEditMode = Boolean(editingDomainId);
    const editFormBlocked =
        isEditMode && (domainDetail.loading || domainDetail.error || !domainDetail.data?.data);

    return (
        <HeaderContainer
            classN="new-domain"
            icon="fluent:building-24-filled"
            header={isEditMode ? 'Edit Domain' : 'New Domain'}
            subHeader={isEditMode ? 'update domain settings and space governance' : 'create a new domain'}
            right={
                <button
                    type="button"
                    className="new-domain-close"
                    onClick={handleClose}
                    aria-label="Close"
                >
                    <Icon icon="ep:close-bold" width={20} height={20} />
                </button>
            }
        >
            {isEditMode && domainDetail.loading ? (
                <p className="new-domain-loading-msg">Loading domain…</p>
            ) : isEditMode && domainDetail.error ? (
                <p className="new-domain-loading-msg">Unable to load this domain. Close and try again.</p>
            ) : (
                <>
            <div className="header">
                <h2>{isEditMode ? 'Edit Domain' : 'New Domain'}</h2>
                <p>{isEditMode ? 'Update settings for this domain' : 'create a new domain for event management'}</p>
            </div>
            <Flag 
                text="Domains represent facilities, departments, organizations, or services that can host events. Each domain has specific settings for capacity, operating hours, booking rules, and approval workflows." 
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
                        <label htmlFor="domain-name">Domain Name *</label>
                        <input 
                            type="text" 
                            name="domain-name" 
                            id="domain-name" 
                            className="short" 
                            value={domainData.name} 
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder="Enter domain name (e.g., Alumni House, Computer Science Department)"
                        />
                        {errors.name && <span className="error">{errors.name}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="domain-type">Domain Type *</label>
                        <select 
                            name="domain-type" 
                            id="domain-type" 
                            className="short" 
                            value={domainData.type} 
                            onChange={(e) => handleInputChange('type', e.target.value)}
                        >
                            <option value="facility">Facility</option>
                            <option value="department">Department</option>
                            <option value="organization">Organization</option>
                            <option value="service">Service</option>
                        </select>
                        {errors.type && <span className="error">{errors.type}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="domain-description">Description</label>
                        <textarea 
                            name="domain-description" 
                            id="domain-description" 
                            className="long" 
                            value={domainData.description} 
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder="Describe the domain and its purpose"
                            rows="3"
                        />
                    </div>
                </div>

                {/* Capacity and Event Types */}
                <div className="section">
                    <h3>Capacity and Event Types</h3>
                    <div className="field">
                        <label htmlFor="max-capacity">Maximum Capacity</label>
                        <input 
                            type="number" 
                            name="max-capacity" 
                            id="max-capacity" 
                            className="short" 
                            value={domainData.maxCapacity || ''} 
                            onChange={(e) => handleInputChange('maxCapacity', e.target.value ? parseInt(e.target.value) : null)}
                            placeholder="Maximum number of attendees"
                            min="1"
                        />
                        {errors.maxCapacity && <span className="error">{errors.maxCapacity}</span>}
                    </div>
                    
                    <div className="field">
                        <label>Allowed Event Types</label>
                        <div className="checkbox-group">
                            {eventTypes.map(type => (
                                <label key={type} className="checkbox-item">
                                    <input 
                                        type="checkbox" 
                                        checked={domainData.allowedEventTypes.includes(type)}
                                        onChange={(e) => handleEventTypeToggle(type, e.target.checked)}
                                    />
                                    <span>{type}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="section">
                    <h3>Space Governance</h3>
                    <div className="field">
                        <label htmlFor="governance-template">Governance Template</label>
                        <select
                            id="governance-template"
                            className="short"
                            value={domainData.governanceTemplate}
                            onChange={(e) => handleInputChange('governanceTemplate', e.target.value)}
                        >
                            <option value="">Custom (no preset)</option>
                            {templateOptions.map((templateName) => (
                                <option key={templateName} value={templateName}>
                                    {templateName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label>Scope Mode</label>
                        <select
                            className="short"
                            value={domainData.spaceGovernance.scopeMode}
                            onChange={(e) => handleNestedInputChange('spaceGovernance', 'scopeMode', e.target.value)}
                        >
                            <option value="inclusive">Inclusive (match any scoped selector)</option>
                            <option value="exclusive">Exclusive (must satisfy all scoped selectors)</option>
                        </select>
                    </div>

                    <div className="scope-builder-grid">
                        {['governingScope', 'concernScope'].map((scopeKey) => {
                            const scope = domainData.spaceGovernance[scopeKey];
                            const selectedSpaceIds = scope.spaceIds || [];
                            const selectedSpaces = selectedSpaceIds.map((id) => ({
                                id,
                                label: spaceDisplayMap[scopeKey]?.[id] || `Space ${id}`
                            }));
                            return (
                                <div key={scopeKey} className="scope-builder-card">
                                    <h4>{titleCaseScope(scopeKey)} Scope</h4>
                                    <div className="field">
                                        <label>Scope Kind</label>
                                        <select
                                            className="short"
                                            value={scope.kind}
                                            onChange={(e) => handleScopeKindChange(scopeKey, e.target.value)}
                                        >
                                            <option value="campus_wide">Campus-wide</option>
                                            <option value="all_spaces">All spaces</option>
                                            <option value="scoped">Scoped</option>
                                        </select>
                                    </div>

                                    {scope.kind === 'scoped' && (
                                        <>
                                            <div className="builder-block">
                                                <label>Buildings</label>
                                                <p className="builder-help builder-help-inline">
                                                    Pick from the campus building catalog (same list as Compass → Building manager). Stored values are building IDs so scope
                                                    matches the room&apos;s linked building. Legacy domains may still show older name-based entries until re-saved.
                                                </p>
                                                <div className="builder-input-row">
                                                    <select
                                                        className="long"
                                                        value={buildingPickDraft[scopeKey]}
                                                        onChange={(e) =>
                                                            setBuildingPickDraft((prev) => ({
                                                                ...prev,
                                                                [scopeKey]: e.target.value
                                                            }))
                                                        }
                                                    >
                                                        <option value="">Select a building…</option>
                                                        {buildingCatalog.map((b) => (
                                                            <option key={String(b._id)} value={String(b._id)}>
                                                                {b.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="tag-add-btn"
                                                        disabled={!buildingPickDraft[scopeKey]}
                                                        onClick={() => {
                                                            addScopeTag(scopeKey, 'buildingIds', buildingPickDraft[scopeKey]);
                                                            setBuildingPickDraft((prev) => ({ ...prev, [scopeKey]: '' }));
                                                        }}
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                                {!buildingCatalog.length && !buildingsFetch.loading ? (
                                                    <p className="builder-help">
                                                        No buildings returned. Add buildings under Compass → Building manager (or run the classroom → building migration),
                                                        then refresh this page.
                                                    </p>
                                                ) : null}
                                                <div className="selected-tags">
                                                    {(scope.buildingIds || []).map((value) => (
                                                        <button
                                                            key={`${scopeKey}-building-${value}`}
                                                            type="button"
                                                            className="tag-chip"
                                                            onClick={() => removeScopeTag(scopeKey, 'buildingIds', value)}
                                                        >
                                                            {buildingNameById[value] || value}{' '}
                                                            <span>&times;</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="builder-block">
                                                <label>Spaces</label>
                                                <p className="builder-help builder-help-inline">
                                                    Search rooms by name or attributes. When a room has a linked building, that building ID is added to this scope
                                                    automatically alongside the space.
                                                </p>
                                                <button
                                                    type="button"
                                                    className="space-picker-open-btn"
                                                    onClick={() => openSpacePicker(scopeKey)}
                                                >
                                                    Search &amp; add spaces…
                                                </button>
                                                <div className="selected-tags">
                                                    {selectedSpaces.map((space) => (
                                                        <button
                                                            key={`${scopeKey}-space-${space.id}`}
                                                            type="button"
                                                            className="tag-chip"
                                                            onClick={() => removeScopeTag(scopeKey, 'spaceIds', space.id)}
                                                        >
                                                            {space.label} <span>&times;</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="builder-block">
                                                <label>Space Groups</label>
                                                <div className="builder-input-row">
                                                    <input
                                                        type="text"
                                                        className="long"
                                                        value={groupDraft[scopeKey]}
                                                        onChange={(e) => setGroupDraft((prev) => ({ ...prev, [scopeKey]: e.target.value }))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                addScopeTag(scopeKey, 'spaceGroupIds', groupDraft[scopeKey]);
                                                                setGroupDraft((prev) => ({ ...prev, [scopeKey]: '' }));
                                                            }
                                                        }}
                                                        placeholder="Type a group name and press Enter"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="tag-add-btn"
                                                        onClick={() => {
                                                            addScopeTag(scopeKey, 'spaceGroupIds', groupDraft[scopeKey]);
                                                            setGroupDraft((prev) => ({ ...prev, [scopeKey]: '' }));
                                                        }}
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                                <div className="selected-tags">
                                                    {(scope.spaceGroupIds || []).map((value) => (
                                                        <button
                                                            key={`${scopeKey}-group-${value}`}
                                                            type="button"
                                                            className="tag-chip"
                                                            onClick={() => removeScopeTag(scopeKey, 'spaceGroupIds', value)}
                                                        >
                                                            {value} <span>&times;</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Operating Hours */}
                <div className="section">
                    <h3>Operating Hours</h3>
                    <div className="operating-hours">
                        {days.map(day => (
                            <div key={day} className="day-schedule">
                                <div className="day-header">
                                    <label className="day-label">
                                        <input 
                                            type="checkbox" 
                                            checked={!domainData.operatingHours[day].closed}
                                            onChange={(e) => handleOperatingHoursChange(day, 'closed', !e.target.checked)}
                                        />
                                        <span className="day-name">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                                    </label>
                                </div>
                                {!domainData.operatingHours[day].closed && (
                                    <div className="time-inputs">
                                        <input 
                                            type="time" 
                                            value={domainData.operatingHours[day].open}
                                            onChange={(e) => handleOperatingHoursChange(day, 'open', e.target.value)}
                                        />
                                        <span>to</span>
                                        <input 
                                            type="time" 
                                            value={domainData.operatingHours[day].close}
                                            onChange={(e) => handleOperatingHoursChange(day, 'close', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Booking Rules */}
                <div className="section">
                    <h3>Booking Rules</h3>
                    <div className="field-row">
                        <div className="field">
                            <label htmlFor="max-advance-booking">Max Advance Booking (days)</label>
                            <input 
                                type="number" 
                                name="max-advance-booking" 
                                id="max-advance-booking" 
                                className="short" 
                                value={domainData.bookingRules.maxAdvanceBooking} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'maxAdvanceBooking', parseInt(e.target.value))}
                                min="1"
                            />
                            {errors.maxAdvanceBooking && <span className="error">{errors.maxAdvanceBooking}</span>}
                        </div>
                        
                        <div className="field">
                            <label htmlFor="min-advance-booking">Min Advance Booking (hours)</label>
                            <input 
                                type="number" 
                                name="min-advance-booking" 
                                id="min-advance-booking" 
                                className="short" 
                                value={domainData.bookingRules.minAdvanceBooking} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'minAdvanceBooking', parseInt(e.target.value))}
                                min="0"
                            />
                            {errors.minAdvanceBooking && <span className="error">{errors.minAdvanceBooking}</span>}
                        </div>
                    </div>
                    
                    <div className="field-row">
                        <div className="field">
                            <label htmlFor="min-duration">Min Duration (hours)</label>
                            <input 
                                type="number" 
                                name="min-duration" 
                                id="min-duration" 
                                className="short" 
                                value={domainData.bookingRules.minDuration} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'minDuration', parseFloat(e.target.value))}
                                min="0.5"
                                step="0.5"
                            />
                        </div>
                        
                        <div className="field">
                            <label htmlFor="max-duration">Max Duration (hours)</label>
                            <input 
                                type="number" 
                                name="max-duration" 
                                id="max-duration" 
                                className="short" 
                                value={domainData.bookingRules.maxDuration} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'maxDuration', parseFloat(e.target.value))}
                                min="1"
                                step="0.5"
                            />
                            {errors.maxDuration && <span className="error">{errors.maxDuration}</span>}
                        </div>
                    </div>
                    
                    <div className="field">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={domainData.bookingRules.allowRecurring}
                                onChange={(e) => handleNestedInputChange('bookingRules', 'allowRecurring', e.target.checked)}
                            />
                            <span>Allow recurring events</span>
                        </label>
                    </div>
                    
                    {domainData.bookingRules.allowRecurring && (
                        <div className="field">
                            <label htmlFor="max-recurring">Max Recurring Instances</label>
                            <input 
                                type="number" 
                                name="max-recurring" 
                                id="max-recurring" 
                                className="short" 
                                value={domainData.bookingRules.maxRecurringInstances} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'maxRecurringInstances', parseInt(e.target.value))}
                                min="1"
                                max="52"
                            />
                        </div>
                    )}
                </div>

                {/* Approval Workflow */}
                <div className="section">
                    <h3>Approval Workflow</h3>
                    <div className="field">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={domainData.approvalWorkflow.enabled}
                                onChange={(e) => handleNestedInputChange('approvalWorkflow', 'enabled', e.target.checked)}
                            />
                            <span>Enable approval workflow for this domain</span>
                        </label>
                    </div>
                    
                    {domainData.approvalWorkflow.enabled && (
                        <>
                            <div className="field">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={domainData.approvalWorkflow.autoApprove}
                                        onChange={(e) => handleNestedInputChange('approvalWorkflow', 'autoApprove', e.target.checked)}
                                    />
                                    <span>Auto-approve events (skip manual approval)</span>
                                </label>
                            </div>
                            
                            <div className="field">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={domainData.approvalWorkflow.requireAllApprovers}
                                        onChange={(e) => handleNestedInputChange('approvalWorkflow', 'requireAllApprovers', e.target.checked)}
                                    />
                                    <span>Require all approvers to approve</span>
                                </label>
                            </div>
                            
                            <div className="field">
                                <label htmlFor="escalation-timeout">Escalation Timeout (hours)</label>
                                <input 
                                    type="number" 
                                    name="escalation-timeout" 
                                    id="escalation-timeout" 
                                    className="short" 
                                    value={domainData.approvalWorkflow.escalationTimeout} 
                                    onChange={(e) => handleNestedInputChange('approvalWorkflow', 'escalationTimeout', parseInt(e.target.value))}
                                    min="1"
                                />
                                {errors.escalationTimeout && <span className="error">{errors.escalationTimeout}</span>}
                            </div>
                        </>
                    )}
                </div>

                <button type="submit" className="submit-button" disabled={loading || editFormBlocked}>
                    {loading ? (isEditMode ? 'Saving...' : 'Creating...') : isEditMode ? 'Save Domain' : 'Create Domain'}
                </button>
            </form>

            {spacePickerScope && (
                <div
                    className="space-picker-overlay"
                    role="presentation"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeSpacePicker();
                    }}
                >
                    <div
                        className="space-picker-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="space-picker-title"
                        tabIndex={-1}
                        onKeyDown={pickerKeyDown}
                    >
                        <div className="space-picker-panel-header">
                            <div>
                                <h3 id="space-picker-title">Add spaces — {titleCaseScope(spacePickerScope)} scope</h3>
                                <p className="space-picker-sub">
                                    Search by room name or attribute text. Use arrow keys and Enter to add; Esc closes.
                                </p>
                            </div>
                            <button type="button" className="space-picker-done" onClick={closeSpacePicker}>
                                Done
                            </button>
                        </div>
                        <label className="space-picker-search-label" htmlFor="space-picker-query">
                            Search
                        </label>
                        <input
                            ref={pickerInputRef}
                            id="space-picker-query"
                            type="search"
                            className="space-picker-query"
                            value={pickerQuery}
                            onChange={(e) => setPickerQuery(e.target.value)}
                            placeholder="e.g. auditorium, lab, wheelchair…"
                            autoComplete="off"
                        />
                        <div className="space-picker-results" role="listbox" aria-label="Search results">
                            {pickerLoading ? (
                                <p className="builder-help">Searching…</p>
                            ) : pickerQuery.trim().length < 2 ? (
                                <p className="builder-help">Type at least 2 characters to search campus spaces.</p>
                            ) : pickerResults.length === 0 ? (
                                <p className="builder-help">No spaces match that query.</p>
                            ) : (
                                pickerResults.map((room, idx) => {
                                    const meta = buildRoomMetadata(room);
                                    const selectedIds = domainData.spaceGovernance[spacePickerScope]?.spaceIds || [];
                                    const already = room._id && selectedIds.includes(room._id);
                                    return (
                                        <button
                                            key={room._id || idx}
                                            type="button"
                                            role="option"
                                            aria-selected={idx === pickerHighlight}
                                            className={`space-picker-row${idx === pickerHighlight ? ' is-highlighted' : ''}${already ? ' is-added' : ''}`}
                                            onMouseEnter={() => setPickerHighlight(idx)}
                                            onClick={() => {
                                                if (!already) addSpaceSelection(spacePickerScope, room);
                                            }}
                                            disabled={already}
                                        >
                                            <div className="space-picker-row-title">
                                                <span className="space-picker-name">{room.name || 'Unknown room'}</span>
                                                {already && <span className="space-picker-badge">Added</span>}
                                            </div>
                                            <dl className="space-picker-meta">
                                                {meta.map((row) => (
                                                    <div key={row.key} className="space-picker-meta-row">
                                                        <dt>{row.label}</dt>
                                                        <dd>{row.value}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
                </>
            )}
        </HeaderContainer>
    );
};

export default NewDomain;
