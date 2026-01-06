import React, {useEffect, useState} from 'react';
import { useNavigate } from 'react-router-dom';
import './Approval.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function Approval({step, approvalGroup}){
    const navigate = useNavigate();
    
    // Use approval group info if available, otherwise fall back to step role
    const displayName = approvalGroup ? approvalGroup.org_name : step.role;
    const description = approvalGroup ? approvalGroup.org_description : `Approval step for ${step.role}`;
    
    return(
        <div className="approval col">
            <div className="row">
                <div className="col">
                    <h3>{displayName}</h3>
                    <p className="description">{description}</p>
                    {approvalGroup && approvalGroup.owner && (
                        <div className="owner-info">
                            <p className="owner-text">Owner: {approvalGroup.owner.name || approvalGroup.owner.username}</p>
                        </div>
                    )}
                    <div className="approval-status low">
                        <p className="low">0 pending approvals</p>
                    </div>
                    {step.conditionGroups && step.conditionGroups.length > 0 && (
                        <div className="approval-criteria">
                            <p className="criteria-text">Has {step.conditionGroups.length} condition group(s)</p>
                        </div>
                    )}
                </div>
            </div>
            <div className="row info">
                <div className="col actions">
                    <button className="button" onClick={()=>{
                        navigate(`/approval-dashboard/${displayName}`);
                    }}> 
                        <Icon icon="material-symbols:arrow-outward-rounded"/>
                        <p>dashboard</p>
                    </button>
                    {approvalGroup && (
                        <button className="button" onClick={()=>{
                            navigate(`/club-dashboard/${approvalGroup.org_name}`);
                        }}> 
                            <Icon icon="material-symbols:settings-rounded" />
                            <p>manage</p>
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
    
export default Approval;