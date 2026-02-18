import React, { useState, useRef, useEffect } from 'react';
import { DatePicker } from 'rsuite';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import SlideSwitch from '../../../../components/SlideSwitch/SlideSwitch';
import CreateRegistrationFormModal from '../../../ClubDash/EventsManagement/components/EventDashboard/CreateRegistrationFormModal';
import 'rsuite/DatePicker/styles/index.css';
import './RegistrationSection.scss';

function RegistrationSection({ formData, setFormData, selectedHost }) {
    const [showFormModal, setShowFormModal] = useState(false);
    const [showFormDropdown, setShowFormDropdown] = useState(false);
    const [editingFormId, setEditingFormId] = useState(null);
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

    const handleDeadlineChange = (date) => {
        setFormData(prev => ({
            ...prev,
            registrationDeadline: date ? new Date(date) : null,
            rsvpDeadline: date ? new Date(date) : null
        }));
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
                    <div className="event-option-row event-option-row-toggle">
                        <span className="option-label">Require Approval</span>
                        <SlideSwitch
                            checked={registrationRequired}
                            onChange={(e) => handleRegistrationRequiredChange(e)}
                        />
                    </div>

                    <div className="event-option-row event-option-row-deadline">
                        <span className="option-label">Registration deadline</span>
                        <span className="option-value option-value-datepicker">
                            <DatePicker
                                format="MMM d, yyyy h:mm a"
                                showMeridiem
                                placeholder="None"
                                value={registrationDeadline ? new Date(registrationDeadline) : null}
                                onChange={handleDeadlineChange}
                                className="registration-deadline-picker"
                                caretAs={() => <Icon icon="mdi:calendar" />}
                                cleanable
                            />
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
