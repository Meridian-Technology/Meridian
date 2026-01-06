import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import ApprovalConfig from '../ApprovalConfig';
import '../DomainDashboard.scss';

function DomainApprovalRules() {
    const { domainId } = useParams();
    const stakeholderRolesData = useFetch(`/api/stakeholder-roles/domain/${domainId}`);
    const [selectedStakeholderRole, setSelectedStakeholderRole] = useState(null);

    const stakeholderRoles = stakeholderRolesData.data?.data || [];

    useEffect(() => {
        if (stakeholderRoles.length > 0 && !selectedStakeholderRole) {
            setSelectedStakeholderRole(stakeholderRoles[0]);
        }
    }, [stakeholderRoles, selectedStakeholderRole]);

    if (stakeholderRolesData.loading) {
        return (
            <div className="domain-approval-rules loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinning" />
                    <span>Loading approval rules...</span>
                </div>
            </div>
        );
    }

    if (stakeholderRoles.length === 0) {
        return (
            <div className="domain-approval-rules no-roles">
                <div className="empty-state">
                    <Icon icon="mdi:cog" />
                    <h3>No Stakeholder Roles</h3>
                    <p>Create stakeholder roles first to configure approval rules.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="domain-approval-rules">
            <div className="approval-rules-header">
                <h2>Approval Rules Configuration</h2>
                <div className="role-selector">
                    <label>Select Stakeholder Role:</label>
                    <select 
                        value={selectedStakeholderRole?._id || ''}
                        onChange={(e) => {
                            const role = stakeholderRoles.find(r => r._id === e.target.value);
                            setSelectedStakeholderRole(role);
                        }}
                    >
                        {stakeholderRoles.map((role) => (
                            <option key={role._id} value={role._id}>
                                {role.stakeholderName} ({role.stakeholderType})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedStakeholderRole && (
                <div className="approval-config-container">
                    <ApprovalConfig 
                        approvalId={selectedStakeholderRole.stakeholderName}
                        domainId={domainId}
                        stakeholderRole={selectedStakeholderRole}
                    />
                </div>
            )}
        </div>
    );
}

export default DomainApprovalRules;
