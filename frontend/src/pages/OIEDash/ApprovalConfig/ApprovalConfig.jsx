import React, {useEffect, useState} from 'react';
import './ApprovalConfig.scss';
import { useFetch } from '../../../hooks/useFetch';
import Select from '../../../components/Select/Select';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import FormBuilder from '../../../components/FormBuilder/FormBuilder';
import FormViewer from '../../../components/FormViewer/FormViewer';
import Popup from '../../../components/Popup/Popup';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import SlideSwitch from '../../../components/SlideSwitch/SlideSwitch';
import ApprovalCriteria from './ApprovalCriteria/ApprovalCriteria';
import Rule from './Rule/Rule';
import postRequest from '../../../utils/postRequest';

const ApprovalConfig = ({ approvalId }) => {
    const approvalGroupsData = useFetch('/approval-groups');
    const approvalFlowData = useFetch('/api/event-system-config/get-approval-flow');
    const eventSystemConfigData = useFetch('/api/event-system-config');
    const [approvalGroups, setApprovalGroups] = useState([]);
    const [steps, setSteps] = useState([]);
    const [fieldDefinitions, setFieldDefinitions] = useState([]);
    const [allowedOperators, setAllowedOperators] = useState([]);
    const [selectedStep, setSelectedStep] = useState(null);
    const [showFormBuilder, setShowFormBuilder] = useState(false);
    const [showFormViewer, setShowFormViewer] = useState(false);
    const [currentForm, setCurrentForm] = useState(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [pendingChanges, setPendingChanges] = useState({});
    const [systemConfig, setSystemConfig] = useState(null);

    const [saveButton, setSaveButton] = useState(0);

    const [conditionalApproval, setConditionalApproval] = useState(true); //temporary for demo, make this dynamic

    const onChange = (option) => {
        setSelectedStep(steps.find((step)=>step.role === option));
        setHasChanges(false);
        setPendingChanges({});
    }

    useEffect(()=>{
        if(approvalGroupsData.data){
            setApprovalGroups(approvalGroupsData.data.data || []);
        }
        if(approvalGroupsData.error){
            console.log(approvalGroupsData.error);
        }
    },[approvalGroupsData.data]);

    useEffect(()=>{
        if(approvalFlowData.data){
            setSteps(approvalFlowData.data.data.steps || []);
            setFieldDefinitions(approvalFlowData.data.data.fieldDefinitions || []);
            setAllowedOperators(approvalFlowData.data.data.allowedOperators || []);
            
            // Find the step that matches the approvalId (which is now an org name)
            const matchingStep = approvalFlowData.data.data.steps?.find((step) => {
                // Find the org that matches this step
                const matchingOrg = approvalGroups.find(org => org._id === step.orgId);
                return matchingOrg && matchingOrg.org_name === approvalId;
            });
            setSelectedStep(matchingStep || null);
        }
        if(approvalFlowData.error){
            console.log(approvalFlowData.error);
        }
    },[approvalFlowData.data, approvalGroups]);

    useEffect(()=>{
        if(eventSystemConfigData.data){
            setSystemConfig(eventSystemConfigData.data.data);
        }
        if(eventSystemConfigData.error){
            console.log(eventSystemConfigData.error);
        }
    },[eventSystemConfigData.data]);

    useEffect(()=> {console.log(selectedStep)}, [selectedStep])

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
        if (!selectedStep || !hasChanges || !systemConfig) return;

        try {
            // Find the domain that matches this approval group
            const matchingOrg = approvalGroups.find(org => org.org_name === approvalId);
            if (!matchingOrg) {
                console.error('Matching organization not found');
                return;
            }

            // Find the domain in system config
            const domain = systemConfig.domains.find(d => d.domainId === matchingOrg._id);
            if (!domain) {
                console.error('Domain not found in system config');
                return;
            }

            // Update the approval workflow for this domain
            const response = await postRequest(`/api/event-system-config/approval-workflow/${matchingOrg._id}`, {
                ...domain.domainSettings.approvalWorkflow,
                stakeholderRoles: domain.domainSettings.approvalWorkflow.stakeholderRoles.map(roleRef => {
                    if (roleRef.stakeholderRoleId === selectedStep.role) {
                        return {
                            ...roleRef,
                            conditionGroups: pendingChanges.conditionGroups || roleRef.conditionGroups,
                            groupLogicalOperators: pendingChanges.groupLogicalOperators || roleRef.groupLogicalOperators
                        };
                    }
                    return roleRef;
                })
            });

            if (response.success) {
                setHasChanges(false);
                setPendingChanges({});
                // Refetch the data to get updated state
                approvalFlowData.refetch();
                eventSystemConfigData.refetch();
            } else {
                console.error('Failed to save changes:', response.message);
            }
        } catch (error) {
            console.error('Error saving changes:', error);
        }
    };

    const mockForm = {
        title: "Heffner Alumni House Form",
        description: "The space you requested requires additional information, please fill out the form below.",
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
                question: "example multiple choice question",
                required: true,
                options: ["Approve", "Reject", "Request Changes"]
            },
            {
                _id: "3",
                type: "long",
                question: "Please provide any additional comments or feedback",
                required: false
            },
            {
                _id: "5",
                type: "select_multiple",
                question: "example select all choice question",
                required: true,
                options: ["Option 1", "Option 2", "Option 3"]
            },
        ]
    };

    const hasStepChanged = (selectedStep) => {
        console.log('asdf');
        return JSON.stringify(selectedStep) === JSON.stringify(steps.find((step)=>step.role === approvalId));
    }

    const handleCriteriaChange = (index, key, value) => {
        const newCriteria = [...selectedStep.criteria]
        console.log(newCriteria);
        newCriteria[index] = {_id:selectedStep.criteria[index]._id,[key]: value};
        console.log(newCriteria);
        setSelectedStep({...selectedStep, criteria:newCriteria})
    }

    const handleAddRuleGroup = (i) => {
        const newGroup = {
            conditions: [{
                field: fieldDefinitions[0].name,
                operator: allowedOperators.find(op => op.type === fieldDefinitions[0].type)?.operators[0] || 'equals',
                value: ''
            }],
            conditionLogicalOperators: []
        };

        const newGroupLogicalOperators = selectedStep.conditionGroups.length > 0 ? [...selectedStep.groupLogicalOperators, 'OR'] : selectedStep.groupLogicalOperators;

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

    if(!selectedStep){
        return null;
    }

    return(
        <div className="approval-config">
            <div className="header">    
                <h1>Approval Configuration</h1>
                <div className="form-buttons">
                    <button onClick={() => {
                        if(!currentForm){
                            setCurrentForm(mockForm);
                        }
                        setShowFormBuilder(true);
                        }}>Edit Approval Form</button>
                    <button onClick={() => {
                        if(!currentForm){
                            setCurrentForm();
                        }
                        setShowFormViewer(true);
                    }}>View Sample Form</button>
                </div>
            </div>
            <div className="config-item">
                {/* <div className="config-title">
                    <div className="">
                        <h2>Conditional Approval</h2>
                        <p>asdf</p>
                    </div>
                    
                    <SlideSwitch checked={conditionalApproval} onChange={()=>setConditionalApproval(!conditionalApproval)}/>
                </div> */}
                {
                    conditionalApproval && 
                    <div className="approval-container">
                        <HeaderContainer 
                            icon="mage:wrench-fill" 
                            header="Approval Conditions" 
                            subheader="Configure the approval process for your organization" 
                            right={
                                <div className="header-actions">
                                    <button className="add-group-button" onClick={handleAddRuleGroup}>
                                        <Icon icon="mdi:plus" />
                                        add rule
                                    </button>
                                    {hasChanges && (
                                        <button className="save-button" onClick={handleSave}>
                                            save changes
                                        </button>
                                    )}
                                </div>
                            }
                        >
                            <div className="config-container-content">
                                {
                                    selectedStep.conditionGroups.map((group, i)=>{
                                        return(
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
                                        )
                                    })
                                }
                            </div>
                        </HeaderContainer>
                    </div>
                }
            </div>
            
            <Popup isOpen={showFormBuilder} onClose={() => setShowFormBuilder(false)} customClassName="wide-content">
                <FormBuilder initialForm={currentForm} onSave={handleFormSave} />
            </Popup>

            <Popup isOpen={showFormViewer} onClose={() => setShowFormViewer(false)} customClassName="wide-content">
                <FormViewer form={currentForm} onSubmit={handleFormSubmit} />
            </Popup>
        </div>
    )
}

export default ApprovalConfig;