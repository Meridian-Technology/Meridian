import React from 'react';
import './EditStakeholderRole.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import ApprovalConfig from '../../ApprovalConfig';


const EditStakeholderRole = ({stakeholderRole}) => {
    return (
        <div className="edit-stakeholder-container">  
            <div className="edit-stakeholder">
                <div className="edit-header">
                    <h2>Edit Stakeholder Role</h2>
                    <p>edit stakeholder role configuration</p>
                </div>
                {/* <ApprovalConfig /> */}
            </div>
        </div>
    );
}

export default EditStakeholderRole;