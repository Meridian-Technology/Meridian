import React from 'react';
import './FormConfigMenu.scss';
import SlideSwitch from '../SlideSwitch/SlideSwitch';

const FormConfigMenu = ({ form, onConfigChange }) => {
    const handleToggle = (field, value) => {
        onConfigChange({
            ...form,
            [field]: value
        });
    };

    return (
        <div className="form-config-menu">
            <h3>Form Configuration</h3>
            <div className="config-options">
                <div className="config-option">
                    <div className="config-label">
                        <label>Allow Multiple Responses</label>
                        <p>Let users submit more than one response</p>
                    </div>
                    <SlideSwitch
                        checked={form.allowMultipleResponses !== false}
                        onChange={(checked) => handleToggle('allowMultipleResponses', checked)}
                    />
                </div>

                <div className="config-option">
                    <div className="config-label">
                        <label>Require Authentication</label>
                        <p>Users must be logged in to respond</p>
                    </div>
                    <SlideSwitch
                        checked={form.requireAuth !== false}
                        onChange={(checked) => handleToggle('requireAuth', checked)}
                    />
                </div>

                <div className="config-option">
                    <div className="config-label">
                        <label>Accepting Responses</label>
                        <p>Allow new responses to be submitted</p>
                    </div>
                    <SlideSwitch
                        checked={form.acceptingResponses !== false}
                        onChange={(checked) => handleToggle('acceptingResponses', checked)}
                    />
                </div>
            </div>
        </div>
    );
};

export default FormConfigMenu;


