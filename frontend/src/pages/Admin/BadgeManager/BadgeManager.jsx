import React, {useEffect, useState} from 'react';
import './BadgeManager.scss';
import { useFetch } from '../../../hooks/useFetch';
import CreateButton from '../../../components/CreateButton/CreateButton';
import BadgeGrant from './BadgeGrant/BadgeGrant';
import Popup from '../../../components/Popup/Popup';
import { useNotification } from '../../../NotificationContext';
import postRequest from '../../../utils/postRequest';

const BadgeManager = ({}) => {
    const badgeGrants = useFetch('/get-badge-grants');
    const { addNotification } = useNotification();
    const [createPopup, setCreatePopup] = useState(false);
    const [newBadge, setNewBadge] = useState({
        badgeContent: '',
        badgeColor: '#3B82F6',
        daysValid: 30
    });

    const handleCreateBadge = async () => {
        try {
            const response = await postRequest('/create-badge-grant', newBadge);
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Success',
                    message: 'Badge grant created successfully',
                    type: 'success'
                });
                setCreatePopup(false);
                setNewBadge({
                    badgeContent: '',
                    badgeColor: '#3B82F6',
                    daysValid: 30
                });
                // Refresh the badge grants list
                if (badgeGrants.refetch) {
                    badgeGrants.refetch();
                }
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to create badge grant',
                type: 'error'
            });
        }
    };

    return (
        <div className="badge-manager">
            <CreateButton 
                text="create new badge grant" 
                handleEventClick={() => setCreatePopup(true)} 
                color='red' 
                row='true'
            />
            
            <Popup onClose={() => setCreatePopup(false)} isOpen={createPopup} customClassName='narrow-content'>
                <div className="create-badge-popup">
                    <h2>Create New Badge Grant</h2>
                    <div className="form-group">
                        <label>Badge Content:</label>
                        <input 
                            type="text" 
                            value={newBadge.badgeContent}
                            onChange={(e) => setNewBadge({...newBadge, badgeContent: e.target.value})}
                            placeholder="e.g., RCOS Expo 2024"
                        />
                    </div>
                    <div className="form-group">
                        <label>Badge Color:</label>
                        <input 
                            type="color" 
                            value={newBadge.badgeColor}
                            onChange={(e) => setNewBadge({...newBadge, badgeColor: e.target.value})}
                        />
                    </div>
                    <div className="form-group">
                        <label>Valid for (days):</label>
                        <input 
                            type="number" 
                            value={newBadge.daysValid}
                            onChange={(e) => setNewBadge({...newBadge, daysValid: parseInt(e.target.value) || 30})}
                            min="1"
                            max="365"
                        />
                    </div>
                    <div className="button-group">
                        <button onClick={handleCreateBadge} className="create-btn">Create Badge Grant</button>
                        <button onClick={() => setCreatePopup(false)} className="cancel-btn">Cancel</button>
                    </div>
                </div>
            </Popup>

            <div className="badge-grants">
                {
                    badgeGrants.data && badgeGrants.data.badgeGrants?.map((badgeGrant, index) => 
                        <BadgeGrant 
                            key={`${index}-badge-grant`} 
                            badgeGrant={badgeGrant}
                            onRefresh={() => badgeGrants.refetch && badgeGrants.refetch()}
                        />
                    )
                }
            </div>
        </div>
    );
}

export default BadgeManager;