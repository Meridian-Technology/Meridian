import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import SlideSwitch from '../../../../components/SlideSwitch/SlideSwitch';
import Popup from '../../../../components/Popup/Popup';
import FormBuilder from '../../../../components/FormBuilder/FormBuilder';
import FormPreview from '../../../../components/FormPreview/FormPreview';
import './Membership.scss';

const Membership = ({ formData, setFormData, onComplete }) => {
    const [requireApprovalForJoin, setRequireApprovalForJoin] = useState(
        formData.requireApprovalForJoin ?? false
    );
    const [memberForm, setMemberForm] = useState(formData.memberForm ?? null);
    const [showFormBuilder, setShowFormBuilder] = useState(false);

    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            requireApprovalForJoin,
            memberForm
        }));
    }, [requireApprovalForJoin, memberForm, setFormData]);

    useEffect(() => {
        // Membership settings are optional, allow proceeding once visited
        onComplete(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleToggleApproval = (e) => {
        const checked = e.target.checked;
        setRequireApprovalForJoin(checked);
        if (!checked) {
            setMemberForm(null);
        }
    };

    const handleFormSave = (form) => {
        setMemberForm(form);
        setShowFormBuilder(false);
    };

    const handleRemoveForm = () => {
        setMemberForm(null);
    };

    const defaultMemberForm = {
        title: 'Member Application Form',
        description: 'Prospective members will need to fill out this form. Their responses will be added to the approval process.',
        questions: []
    };

    return (
        <div className="membership-step">
            <div className="form-section">
                <h3>Membership settings</h3>
                <p>
                    Configure how new members join your organization. You can change these settings
                    anytime in your organization&apos;s Settings under Member Settings.
                </p>

                <div className="membership-options">
                    <div className="membership-option">
                        <div className="option-content">
                            <div className="option-header">
                                <Icon icon="mdi:account-check" className="option-icon" />
                                <span className="option-title">Require approval to join</span>
                            </div>
                            <p className="option-subtitle">
                                When enabled, new members must be approved before joining. You can
                                optionally add a custom application form to collect information from applicants.
                            </p>
                        </div>
                        <SlideSwitch
                            checked={requireApprovalForJoin}
                            onChange={handleToggleApproval}
                            primaryColor="#6d8efa"
                        />
                    </div>

                    {requireApprovalForJoin && (
                        <div className="membership-option member-form-option">
                            <div className="option-content">
                                <div className="option-header">
                                    <Icon icon="mdi:form-select" className="option-icon" />
                                    <span className="option-title">Application form</span>
                                </div>
                                <p className="option-subtitle">
                                    Collect information from applicants with a custom form, or skip and approve members without one.
                                </p>
                                <div className="member-form-actions">
                                    {memberForm ? (
                                        <>
                                            <FormPreview form={memberForm} />
                                            <div className="form-action-buttons">
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => setShowFormBuilder(true)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    onClick={handleRemoveForm}
                                                >
                                                    Remove form
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="form-action-buttons">
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => setShowFormBuilder(true)}
                                            >
                                                Create form
                                            </button>
                                            <span className="skip-hint">or skip — no form needed</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="config-later-note">
                    <Icon icon="mdi:information-outline" className="note-icon" />
                    <p>
                        <strong>You can configure this later.</strong> Additional options like the
                        member renewal process are available in your organization dashboard under
                        Settings → Member Settings.
                    </p>
                </div>
            </div>

            <Popup
                title="Member Application Form"
                isOpen={showFormBuilder}
                onClose={() => setShowFormBuilder(false)}
                customClassName="wide-content"
                defaultStyling={false}
            >
                <FormBuilder
                    initialForm={memberForm ?? defaultMemberForm}
                    onSave={handleFormSave}
                />
            </Popup>
        </div>
    );
};

export default Membership;
