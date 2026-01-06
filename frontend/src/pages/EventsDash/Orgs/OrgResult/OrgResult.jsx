import React from 'react';
import './OrgResult.scss'
import { Link } from 'react-router-dom';
import { useDashboard } from '../../../../contexts/DashboardContext';
import OrgDisplay from '../../../Org/OrgDisplay';

const OrgResult = ({org}) => {
    const { showOverlay } = useDashboard();
    const onOrgPress = () => {
        showOverlay(<OrgDisplay name={org.org_name}/>);
    }
    return (
        <div className="org-result" onClick={()=>{onOrgPress()}}>
            <img src={org.org_profile_image} alt="" />
            <div className="info">
                <h3>{org.org_name}</h3>
                <p>{org.org_description}</p>
            </div>
        </div>
    )
};

export default OrgResult;