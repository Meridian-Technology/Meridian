import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import SlideSwitch from '../../../../components/SlideSwitch/SlideSwitch';
import CreateRegistrationFormModal from '../../../ClubDash/EventsManagement/components/EventDashboard/CreateRegistrationFormModal';
import './RegistrationSection.scss';

function RegistrationSection({ formData, setFormData, selectedHost }) {
    const [editingCapacity, setEditingCapacity] = useState(false);
    const [editingDeadline, setEditingDeadline] = useState(false);
    const [showFormModal, setShowFormModal] = useState(false);
    const [showFormDropdown, setShowFormDropdown] = useState(false);
    const [editingFormId, setEditingFormId] = useState(null);
    const capacityInputRef = useRef(null);
    const formDropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (formDropdownRef.current && !formDropdownRef.current.contains(e.target)) {
                setShowFormDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isOrg = selectedHost?.type === 'Org';
    const orgId = isOrg ? selectedHost.id : null;
    const { data: orgFormsData, refetch: refetchOrgForms } = useFetch(orgId ? `/org-event-management/${orgId}/forms` : null);
    const orgForms = orgFormsData?.success ? (orgFormsData.data || []) : [];
    const selectedForm = orgForms.find(f => f._id === formData.registrationFormId);

    const registrationEnabled = formData.registrationEnabled ?? formData.rsvpEnabled ?? false;
    const registrationRequired = formData.registrationRequired ?? formData.rsvpRequired ?? false;
    const registrationDeadline = formData.registrationDeadline ?? formData.rsvpDeadline;
    const maxAttendees = formData.maxAttendees;

    useEffect(() => {
        if (editingCapacity && capacityInputRef.current) {
            capacityInputRef.current.focus();
        }
    }, [editingCapacity]);

    const handleRegistrationEnabledChange = (e) => {
        const checked = e.target.checked;
        setFormData(prev => ({
            ...prev,
            registrationEnabled: checked,
            rsvpEnabled: checked
        }));
    };

    const handleRegistrationRequiredChange = (e) => {
        const checked = e.target.checked;
        setFormData(prev => ({
            ...prev,
            registrationRequired: checked,
            rsvpRequired: checked
        }));
    };

    const handleCapacityChange = (value) => {
        const num = value ? parseInt(value, 10) : null;
        setFormData(prev => ({
            ...prev,
            maxAttendees: num && num > 0 ? num : null
        }));
        setEditingCapacity(false);
    };

    const handleDeadlineChange = (date) => {
        setFormData(prev => ({
            ...prev,
            registrationDeadline: date ? new Date(date) : null,
            rsvpDeadline: date ? new Date(date) : null
        }));
        setEditingDeadline(false);
    };

    const handleFormSelect = (formId) => {
        setFormData(prev => ({ ...prev, registrationFormId: formId || null }));
    };

    return (
        <div className="registration-section">
            <div className="event-options-header">
                <h4 className="event-options-title">Event Options</h4>
                <div className="event-options-toggle-row">
                    <span className="toggle-label">Enable registration</span>
                    <SlideSwitch
                        checked={registrationEnabled}
                        onChange={(e) => handleRegistrationEnabledChange(e)}
                    />
                </div>
            </div>

            {registrationEnabled && (
                <div className="event-options-rows">
                    <div className="event-option-row">
                        <span className="option-label">Ticket Price</span>
                        <span className="option-value">
                            Free
                            <Icon icon="mdi:pencil" className="option-edit-icon" />
                        </span>
                    </div>

                    <div className="event-option-row event-option-row-toggle">
                        <span className="option-label">Require Approval</span>
                        <SlideSwitch
                            checked={registrationRequired}
                            onChange={(e) => handleRegistrationRequiredChange(e)}
                        />
                    </div>

                    <div className="event-option-row">
                        <span className="option-label">Capacity</span>
                        <span className="option-value" onClick={() => setEditingCapacity(true)}>
                            {editingCapacity ? (
                                <input
                                    ref={capacityInputRef}
                                    type="number"
                                    placeholder="Unlimited"
                                    min="1"
                                    className="option-inline-input"
                                    defaultValue={maxAttendees || ''}
                                    onBlur={(e) => handleCapacityChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCapacityChange(e.target.value);
                                    }}
                                />
                            ) : (
                                <>
                                    {maxAttendees ? maxAttendees : 'Unlimited'}
                                    <Icon icon="mdi:pencil" className="option-edit-icon" />
                                </>
                            )}
                        </span>
                    </div>

                    <div className="event-option-row">
                        <span className="option-label">Registration deadline</span>
                        <span className="option-value">
                            {editingDeadline ? (
                                <input
                                    type="datetime-local"
                                    className="option-inline-input"
                                    defaultValue={registrationDeadline ? new Date(registrationDeadline).toISOString().slice(0, 16) : ''}
                                    onBlur={(e) => {
                                        handleDeadlineChange(e.target.value ? new Date(e.target.value) : null);
                                        setEditingDeadline(false);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleDeadlineChange(e.target.value ? new Date(e.target.value) : null);
                                            setEditingDeadline(false);
                                        }
                                    }}
                                />
                            ) : (
                                <span onClick={() => setEditingDeadline(true)}>
                                    {registrationDeadline
                                        ? new Date(registrationDeadline).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit'
                                        })
                                        : 'None'}
                                    <Icon icon="mdi:pencil" className="option-edit-icon" />
                                </span>
                            )}
                        </span>
                    </div>

                    {isOrg && orgId && (
                        <div className="event-option-row event-option-row-form" ref={formDropdownRef}>
                            <span className="option-label">Registration form</span>
                            <div className="option-value-wrapper">
                                <span
                                    className="option-value"
                                    onClick={() => setShowFormDropdown(!showFormDropdown)}
                                >
                                    {selectedForm?.title || 'None'}
                                    <Icon icon="mdi:chevron-down" className="option-edit-icon" />
                                </span>
                                {showFormDropdown && (
                                    <div className="option-form-dropdown">
                                        <button
                                            type="button"
                                            className="option-form-dropdown-item"
                                            onClick={() => {
                                                handleFormSelect(null);
                                                setShowFormDropdown(false);
                                            }}
                                        >
                                            None
                                        </button>
                                        {orgForms.map((f) => (
                                            <button
                                                key={f._id}
                                                type="button"
                                                className="option-form-dropdown-item"
                                                onClick={() => {
                                                    handleFormSelect(f._id);
                                                    setShowFormDropdown(false);
                                                }}
                                            >
                                                {f.title}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            className="option-form-dropdown-item option-form-create"
                                            onClick={() => {
                                                setShowFormDropdown(false);
                                                setEditingFormId(null);
                                                setShowFormModal(true);
                                            }}
                                        >
                                            <Icon icon="mdi:plus" /> Create form
                                        </button>
                                        {formData.registrationFormId && (
                                            <button
                                                type="button"
                                                className="option-form-dropdown-item"
                                                onClick={() => {
                                                    setShowFormDropdown(false);
                                                    setEditingFormId(formData.registrationFormId);
                                                    setShowFormModal(true);
                                                }}
                                            >
                                                <Icon icon="mdi:pencil" /> Edit form
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showFormModal && (
                <CreateRegistrationFormModal
                    orgId={orgId}
                    formId={editingFormId || undefined}
                    initialForm={editingFormId ? orgForms.find(f => f._id === editingFormId) : undefined}
                    onCreated={(newFormId) => {
                        refetchOrgForms();
                        if (!editingFormId && newFormId) handleFormSelect(newFormId);
                    }}
                    onClose={() => {
                        setShowFormModal(false);
                        setEditingFormId(null);
                    }}
                />
            )}
        </div>
    );
}

export default RegistrationSection;
