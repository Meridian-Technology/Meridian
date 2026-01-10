import React, { useState, useEffect } from 'react';
import './Roles.scss';
import RoleManager from '../../../../components/RoleManager/RoleManager';

const Roles = ({ formData, setFormData, onComplete }) => {
    const [customRoles, setCustomRoles] = useState(formData.customRoles || []);

    useEffect(() => {
        setFormData(prev => ({ ...prev, customRoles }));
    }, [customRoles, setFormData]);

    useEffect(() => {
        // Roles are optional, so always allow proceeding once component is mounted (user has visited this step)
        onComplete(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRolesChange = (roles) => {
        setCustomRoles(roles);
    };

    return (
        <div className="roles-step">
            <div className="form-section">
                <h3>Define custom roles (optional)</h3>
                <p>Create custom roles for your organization members. You can always add or modify these later.</p>
                
                <div className="role-manager-container">
                    <RoleManager
                        roles={customRoles}
                        onRolesChange={handleRolesChange}
                        isEditable={true}
                    />
                </div>
            </div>
        </div>
    );
};

export default Roles;

