import React, { useEffect, useState } from 'react';
import './ApprovalConfig.scss';
import { useFetch } from '../../hooks/useFetch';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import FormBuilder from '../../components/FormBuilder/FormBuilder';
import FormViewer from '../../components/FormViewer/FormViewer';
import Popup from '../../components/Popup/Popup';
import HeaderContainer from '../../components/HeaderContainer/HeaderContainer';
import Rule from '../OIEDash/ApprovalConfig/Rule/Rule';
import postRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';

const ApprovalConfig = ({ approvalId, domainId, stakeholderRole }) => {
    const { addNotification } = useNotification();
    
    // Data fetching
    const approvalFlowData = useFetch('/api/event-system-config/get-approval-flow');
    const domainData = useFetch(`/api/domain/${domainId}`);
    
    // State management
    const [fieldDefinitions, setFieldDefinitions] = useState([]);
    const [allowedOperators, setAllowedOperators] = useState([]);
    const [selectedStep, setSelectedStep] = useState(null);
    const [showFormBuilder, setShowFormBuilder] = useState(false);
    const [showFormViewer, setShowFormViewer] = useState(false);
    const [currentForm, setCurrentForm] = useState(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [pendingChanges, setPendingChanges] = useState({});
    const [domain, setDomain] = useState(null);

    useEffect(() => {
        if (approvalFlowData.data) {
            setFieldDefinitions(approvalFlowData.data.data.fieldDefinitions || []);
            setAllowedOperators(approvalFlowData.data.data.allowedOperators || []);
        }
    }, [approvalFlowData.data]);

    useEffect(() => {
        if (domainData.data) {
            setDomain(domainData.data.data);
        }
    }, [domainData.data]);

    useEffect(() => {
        if (stakeholderRole) {
            // Create a step object from the stakeholder role
            const step = {
                role: stakeholderRole.stakeholderName,
                stakeholderRoleId: stakeholderRole._id,
                conditionGroups: stakeholderRole.conditionGroups || [],
                groupLogicalOperators: stakeholderRole.groupLogicalOperators || []
            };
            setSelectedStep(step);
        }
    }, [stakeholderRole]);

    const handleFormSave = (form) => {
        setCurrentForm(form);
        setShowFormBuilder(false);
    };

    const handleFormSubmit = (responses) => {
        setShowFormViewer(false);
    };

    const handleRuleChange = (updates) => {
        setHasChanges(true);
        setPendingChanges(prev => ({
            ...prev,
            ...updates
        }));
    };

    const handleSave = async () => {
        if (!selectedStep || !hasChanges || !stakeholderRole) return;

        try {
            // Update the stakeholder role with new condition groups
            const response = await postRequest(`/api/stakeholder-roles/${stakeholderRole._id}`, {
                conditionGroups: pendingChanges.conditionGroups || selectedStep.conditionGroups || [],
                groupLogicalOperators: pendingChanges.groupLogicalOperators || selectedStep.groupLogicalOperators || []
            }, {
                method: 'PUT'
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Approval rules updated successfully',
                    type: 'success'
                });
                setHasChanges(false);
                setPendingChanges({});
                // Update the selected step with the new data
                setSelectedStep(prev => ({
                    ...prev,
                    conditionGroups: pendingChanges.conditionGroups || prev.conditionGroups,
                    groupLogicalOperators: pendingChanges.groupLogicalOperators || prev.groupLogicalOperators
                }));
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to save approval rules',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error saving approval rules:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to save approval rules',
                type: 'error'
            });
        }
    };

    const handleAddRuleGroup = () => {
        if (!fieldDefinitions.length) return;

        const newGroup = {
            conditions: [{
                field: fieldDefinitions[0].name,
                operator: allowedOperators.find(op => op.type === fieldDefinitions[0].type)?.operators[0] || 'equals',
                value: ''
            }],
            conditionLogicalOperators: []
        };

        const newGroupLogicalOperators = selectedStep.conditionGroups.length > 0 ? 
            [...selectedStep.groupLogicalOperators, 'OR'] : 
            selectedStep.groupLogicalOperators;

        setSelectedStep(prev => ({
            ...prev,
            conditionGroups: [...prev.conditionGroups, newGroup],
            groupLogicalOperators: newGroupLogicalOperators
        }));

        setHasChanges(true);
        setPendingChanges(prev => ({
            ...prev,
            conditionGroups: [...selectedStep.conditionGroups, newGroup],
            groupLogicalOperators: newGroupLogicalOperators
        }));
    };

    const handleDeleteRuleGroup = (index) => {
        const newGroups = selectedStep.conditionGroups.filter((_, i) => i !== index);
        const newGroupLogicalOperators = selectedStep.groupLogicalOperators.filter((_, i) => i !== index - 1);

        setSelectedStep(prev => ({
            ...prev,
            conditionGroups: newGroups,
            groupLogicalOperators: newGroupLogicalOperators
        }));

        setHasChanges(true);
        setPendingChanges(prev => ({
            ...prev,
            conditionGroups: newGroups,
            groupLogicalOperators: newGroupLogicalOperators
        }));
    };

    const mockForm = {
        title: `${stakeholderRole?.stakeholderName || 'Stakeholder'} Approval Form`,
        description: "Please provide additional information for your event approval request.",
        questions: [
            {
                _id: "1",
                type: "short",
                question: "Will you require catering?",
                required: true
            },
            {
                _id: "2",
                type: "multiple_choice",
                question: "Event type classification",
                required: true,
                options: ["Academic", "Social", "Professional", "Other"]
            },
            {
                _id: "3",
                type: "long",
                question: "Please provide any additional comments or special requirements",
                required: false
            }
        ]
    };

    if (!selectedStep) {
        return (
            <div className="approval-config loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinning" />
                    <span>Loading approval configuration...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="approval-config">
            <div className="header">    
                <h1>Approval Configuration - {stakeholderRole?.stakeholderName}</h1>
                <div className="form-buttons">
                    <button onClick={() => {
                        if (!currentForm) {
                            setCurrentForm(mockForm);
                        }
                        setShowFormBuilder(true);
                    }}>
                        <Icon icon="mdi:pencil" />
                        Edit Approval Form
                    </button>
                    <button onClick={() => {
                        if (!currentForm) {
                            setCurrentForm(mockForm);
                        }
                        setShowFormViewer(true);
                    }}>
                        <Icon icon="mdi:eye" />
                        View Sample Form
                    </button>
                </div>
            </div>

            <div className="config-item">
                <div className="approval-container">
                    <HeaderContainer 
                        icon="mage:wrench-fill" 
                        header="Approval Conditions" 
                        subheader={`Configure the approval process for ${stakeholderRole?.stakeholderName}`}
                        right={
                            <div className="header-actions">
                                <button className="add-group-button" onClick={handleAddRuleGroup}>
                                    <Icon icon="mdi:plus" />
                                    Add Rule Group
                                </button>
                                {hasChanges && (
                                    <button className="save-button" onClick={handleSave}>
                                        <Icon icon="mdi:content-save" />
                                        Save Changes
                                    </button>
                                )}
                            </div>
                        }
                    >
                        <div className="config-container-content">
                            {selectedStep.conditionGroups.length === 0 ? (
                                <div className="no-rules">
                                    <Icon icon="mdi:filter-off" />
                                    <h3>No Approval Rules</h3>
                                    <p>This stakeholder role currently has no approval conditions. All events will be automatically approved.</p>
                                    <button className="add-first-rule-btn" onClick={handleAddRuleGroup}>
                                        <Icon icon="mdi:plus" />
                                        Add First Rule
                                    </button>
                                </div>
                            ) : (
                                selectedStep.conditionGroups.map((group, i) => (
                                    <Rule 
                                        index={i}
                                        key={`${group}${i}`} 
                                        group={group} 
                                        onChange={(updates) => {
                                            const newGroups = [...selectedStep.conditionGroups];
                                            newGroups[i] = {
                                                ...newGroups[i],
                                                ...updates.conditionGroups[0]
                                            };
                                            setSelectedStep(prev => ({
                                                ...prev,
                                                conditionGroups: newGroups
                                            }));
                                            setHasChanges(true);
                                            setPendingChanges(prev => ({
                                                ...prev,
                                                conditionGroups: newGroups
                                            }));
                                        }} 
                                        fieldDefinitions={fieldDefinitions} 
                                        allowedOperators={allowedOperators}
                                        onDelete={handleDeleteRuleGroup}
                                    />
                                ))
                            )}
                        </div>
                    </HeaderContainer>
                </div>
            </div>
            
            <Popup isOpen={showFormBuilder} onClose={() => setShowFormBuilder(false)} customClassName="wide-content">
                <FormBuilder initialForm={currentForm} onSave={handleFormSave} />
            </Popup>

            <Popup isOpen={showFormViewer} onClose={() => setShowFormViewer(false)} customClassName="wide-content">
                <FormViewer form={currentForm} onSubmit={handleFormSubmit} />
            </Popup>
        </div>
    );
};

export default ApprovalConfig;



