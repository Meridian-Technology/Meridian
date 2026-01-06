import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ManageFlow.scss';
import { useGradient } from '../../../hooks/useGradient';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import {useFetch} from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import Popup from '../../../components/Popup/Popup';
import NewDomain from './NewDomain/NewDomain';
import NewStakeholderRole from './NewStakeholderRole/NewStakeholderRole';
import FlowCard from './FlowCard/FlowCard';
import postRequest from '../../../utils/postRequest';
import { 
    OverviewTab, 
    StakeholdersTab, 
    DomainsTab, 
    ManagementTab, 
    AnalyticsTab
} from './tabs';

function ManageFlow(){
    const navigate = useNavigate();
    const approvalGroupsData = useFetch('/approval-groups');
    const approvalFlowData = useFetch('/api/event-system-config/get-approval-flow');
    const domainsData = useFetch('/api/domains');
    const [popupOpen, setPopupOpen] = useState(false);
    const [popupType, setPopupType] = useState('stakeholder'); // 'stakeholder', 'domain'
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedDomain, setSelectedDomain] = useState(null);
    const [stakeholderRoles, setStakeholderRoles] = useState([]);
    const [loadingStakeholders, setLoadingStakeholders] = useState(false);
    const { addNotification } = useNotification();
    const {BeaconMain} = useGradient();
    const openPopup = (type = 'stakeholder') => {
        setPopupType(type);
        setPopupOpen(true);
    }

    const handleGroupDelete = async (groupId) => {
        if (!window.confirm('Are you sure you want to delete this approval group? This action cannot be undone.')) {
            return;
        }

        try {
            // TODO: Implement group deletion API
            addNotification({
                title: 'Success',
                message: 'Approval group deleted successfully',
                type: 'success'
            });
            approvalGroupsData.refetch();
            approvalFlowData.refetch();
            domainsData.refetch();
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to delete approval group',
                type: 'error'
            });
        }
    }

    const handleDomainSelect = async (domainId) => {
        setSelectedDomain(domainId);
        setLoadingStakeholders(true);
        
        try {
            const response = await postRequest(`/api/event-system-config/stakeholder-roles/${domainId}`, {}, {
                method: 'GET'
            });
            
            if (response.success) {
                setStakeholderRoles(response.data);
            } else {
                addNotification({
                    title: 'Error',
                    message: 'Failed to load stakeholder roles',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error loading stakeholder roles:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to load stakeholder roles',
                type: 'error'
            });
        } finally {
            setLoadingStakeholders(false);
        }
    }

    const handleCreateStakeholderRole = async (roleData) => {
        try {
            const response = await postRequest('/api/event-system-config/stakeholder-role', roleData);
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Stakeholder role created successfully',
                    type: 'success'
                });
                
                // Refresh stakeholder roles for the selected domain
                if (selectedDomain) {
                    handleDomainSelect(selectedDomain);
                }
                
                // Refresh domains
                domainsData.refetch();
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
    }

    
    useEffect(()=>{
        if(approvalGroupsData.data){
            console.log('Approval Groups:', approvalGroupsData.data);
        }
        if(approvalGroupsData.error){
            console.log('Approval Groups Error:', approvalGroupsData.error);
        }
    },[approvalGroupsData])

    useEffect(()=>{
        if(approvalFlowData.data){
            console.log('Approval Flow:', approvalFlowData.data);
        }
        if(approvalFlowData.error){
            console.log('Approval Flow Error:', approvalFlowData.error);
        }
    },[approvalFlowData])

    return (
        <div className="dash manage-flow">
            <Popup onClose={()=>setPopupOpen(false)} isOpen={popupOpen} defaultStyling={false}>
                {popupType === 'stakeholder' ? (
                    <NewStakeholderRole 
                        handleClose={() => setPopupOpen(false)} 
                        refetch={() => {
                            approvalFlowData.refetch();
                            domainsData.refetch();
                        }}
                    />
                ) : popupType === 'domain' ? (
                    <NewDomain 
                        handleClose={() => setPopupOpen(false)} 
                        refetch={() => {
                            approvalFlowData.refetch();
                            domainsData.refetch();
                        }}
                    />
                ) : null}
            </Popup>
            
            <header className="header">
                <img src={BeaconMain} alt="" />
                <h1>Event Workflow Management</h1>
                <p>Manage approval workflows, stakeholder configurations, and event processing rules</p>

            </header>
            <div className="actions row">
                    <button className="create-btn" onClick={() => openPopup('stakeholder')}>
                        <Icon icon="fluent:person-add-24-filled"/>
                        Create Stakeholder Role
                    </button>
                    <button className="create-btn" onClick={() => openPopup('domain')}>
                        <Icon icon="ic:round-add-home"/>
                        Create Domain
                    </button>
                </div>
            <div className="content">
                <div className="tabs">
                    <button 
                        className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        <Icon icon="mdi:workflow" />
                        Overview
                    </button>
                    <button 
                        className={`tab ${activeTab === 'domains' ? 'active' : ''}`}
                        onClick={() => setActiveTab('domains')}
                    >
                        <Icon icon="mdi:domain" />
                        Domains
                    </button>
                    <button 
                        className={`tab ${activeTab === 'stakeholders' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stakeholders')}
                    >
                        <Icon icon="mdi:account-group" />
                        Stakeholders
                    </button>
                    <button 
                        className={`tab ${activeTab === 'management' ? 'active' : ''}`}
                        onClick={() => setActiveTab('management')}
                    >
                        <Icon icon="mdi:cog" />
                        Management
                    </button>
                    <button 
                        className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analytics')}
                    >
                        <Icon icon="mdi:chart-line" />
                        Analytics
                    </button>
                </div>

                <div className="tab-content">
                    {activeTab === 'domains' && (
                        <DomainsTab 
                            domainsData={domainsData}
                            openPopup={openPopup}
                            selectedDomain={selectedDomain}
                            setSelectedDomain={setSelectedDomain}
                            handleDomainSelect={handleDomainSelect}
                            loadingStakeholders={loadingStakeholders}
                            stakeholderRoles={stakeholderRoles}
                        />
                    )}

                    {activeTab === 'management' && (
                        <ManagementTab 
                            approvalFlowData={approvalFlowData}
                            approvalGroupsData={approvalGroupsData}
                        />
                    )}

                    {activeTab === 'stakeholders' && (
                        <StakeholdersTab 
                            domainsData={domainsData}
                            openPopup={openPopup}
                        />
                    )}


                    {activeTab === 'overview' && (
                        <OverviewTab 
                            approvalGroups={approvalGroupsData.data?.data || []}
                            approvalFlow={approvalFlowData.data?.data}
                        />
                    )}

                    {activeTab === 'analytics' && (
                        <AnalyticsTab />
                    )}

                </div>
            </div>
        </div>
    )
}

export default ManageFlow;