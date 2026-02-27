import React from 'react';
import './FormConfigMenu.scss';
import SlideSwitch from '../SlideSwitch/SlideSwitch';

const FormConfigMenu = ({ form, onConfigChange }) => {
    const handleToggle = (field, value) => {
        const boolFields = ['allowAnonymous', 'collectGuestDetails'];
        const safeValue = boolFields.includes(field) ? value === true : value;
        const updates = { ...form, [field]: safeValue };
        onConfigChange(updates);
    };

    const handleSwitchChange = (field) => (e) => {
        let checked = false;
        if (e && typeof e === 'object' && 'target' in e && e.target) {
            checked = Boolean(e.target.checked);
        } else if (e === true) {
            checked = true;
        }
        handleToggle(field, checked);
    };

    const allowAnonymous = form.allowAnonymous === true;

    return (
        <div className="form-config-menu">
            <h3>Form Configuration</h3>
            <div className="config-options">
                <div className="config-option">
                    <div className="config-label">
                        <label>Allow Anonymous Responses</label>
                        <p>Let users respond without logging in</p>
                    </div>
                    <SlideSwitch
                        checked={allowAnonymous}
                        onChange={handleSwitchChange('allowAnonymous')}
                    />
                </div>

                {allowAnonymous && (
                    <div className="config-option">
                        <div className="config-label">
                            <label>Collect Guest Details (Name & Email)</label>
                            <p>Ask for name and email when anonymous users respond</p>
                        </div>
                        <SlideSwitch
                            checked={form.collectGuestDetails !== false}
                            onChange={handleSwitchChange('collectGuestDetails')}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default FormConfigMenu;


