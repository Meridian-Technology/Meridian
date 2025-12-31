import React, { useState } from 'react';
import './NewApproval.scss';
import Flag from '../../../../components/Flag/Flag';
import postRequest from '../../../../utils/postRequest';
import { UserSearch, SelectedUsers } from '../../../../components/UserSearch';
import { useNotification } from '../../../../NotificationContext';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';

function NewApproval({refetch, handleClose, refetchFlow}){
    const [approvalName, setApprovalName] = useState('');
    const [approvalDescription, setApprovalDescription] = useState('');
    const [selectedOwner, setSelectedOwner] = useState(null);
    const { addNotification } = useNotification();

    const handleOwnerSelect = (user) => {
        setSelectedOwner(user);
    };

    const handleRemoveOwner = () => {
        setSelectedOwner(null);
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        
        if (!approvalName.trim()) {
            addNotification({
                title: 'Missing information',
                message: 'Please enter an approval group name',
                type: 'error'
            });
            return;
        }
        
        if (!approvalDescription.trim()) {
            addNotification({
                title: 'Missing information',
                message: 'Please enter an approval group description',
                type: 'error'
            });
            return;
        }
        
        if (!selectedOwner) {
            addNotification({
                title: 'Missing information',
                message: 'Please select an owner for the approval group',
                type: 'error'
            });
            return;
        }
        
        try {
            // Create a new stakeholder role using the new system
            const response = await postRequest('/api/stakeholder-role', {
                stakeholderId: approvalName.toLowerCase().replace(/\s+/g, '_'),
                stakeholderName: approvalName,
                stakeholderType: 'approver',
                description: approvalDescription,
                isActive: true,
                members: selectedOwner ? [{
                    userId: selectedOwner._id,
                    assignedAt: new Date()
                    // assignedBy will be set by the backend
                }] : [],
                approvalConfig: {
                    requiredApprovals: 1,
                    totalMembers: selectedOwner ? 1 : 0,
                    allowSelfApproval: false,
                    requireAllMembers: false
                },
                escalationRules: {
                    timeout: 72,
                    autoEscalate: true
                },
                conditionGroups: [],
                groupLogicalOperators: []
            });
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Stakeholder role created successfully. You can now assign this role to domains in the Domains tab.',
                    type: 'success'
                });
                                
                // Reset form
                setApprovalName('');
                setApprovalDescription('');
                setSelectedOwner(null);
                refetch();
                if(refetchFlow) refetchFlow();
                handleClose();
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to create stakeholder role',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error creating stakeholder role:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to create stakeholder role',
                type: 'error'
            });
        }
    };

    return (
        <HeaderContainer classN="new-approval" icon="fluent:flowchart-24-filled" header="New Stakeholder Role" subHeader="create a new stakeholder role">
            <div className="header">
                <h2>New Stakeholder Role</h2>
                <p>create a new stakeholder role</p>
            </div>
            <Flag 
                text="Stakeholder roles define who can approve events for specific domains. Each role can be assigned to users and configured with approval conditions and escalation timeouts." 
                primary="rgba(235,226,127,0.32)" 
                accent='#B29F5F' 
                color="#B29F5F" 
                icon={'lets-icons:info-alt-fill'}
            />
            <form onSubmit={onSubmit} className="content">
                <div className="field">
                    <label htmlFor="stakeholder-name">Stakeholder Role Name</label>
                    <input 
                        type="text" 
                        name="stakeholder-name" 
                        id="stakeholder-name" 
                        className="short" 
                        value={approvalName} 
                        onChange={(e) => setApprovalName(e.target.value)}
                        placeholder="Enter stakeholder role name"
                    />
                </div>
                <div className="field">
                    <label htmlFor="stakeholder-description">Description</label>
                    <textarea 
                        name="stakeholder-description" 
                        id="stakeholder-description" 
                        className="long" 
                        value={approvalDescription} 
                        onChange={(e) => setApprovalDescription(e.target.value)}
                        placeholder="Describe the purpose of this stakeholder role"
                        rows="3"
                    />
                </div>
                <div className="field">
                    <label htmlFor="owner-search">Select Owner</label>
                    <UserSearch 
                        onUserSelect={handleOwnerSelect}
                        placeholder="Search for the owner by name or username"
                        excludeIds={selectedOwner ? [selectedOwner._id] : []}
                    />
                    {selectedOwner && (
                        <div className="selected-owner">
                            <div className="owner-info">
                                <span className="owner-name">{selectedOwner.name || selectedOwner.username}</span>
                                <span className="owner-email">{selectedOwner.email}</span>
                            </div>
                            <button 
                                type="button" 
                                className="remove-owner" 
                                onClick={handleRemoveOwner}
                            >
                                Remove
                            </button>
                        </div>
                    )}
                </div>
                <button type="submit" className="submit-button">
                    Create Stakeholder Role
                </button>
            </form>
        </HeaderContainer>
    );
}

export default NewApproval;