import React, { useEffect, useState } from 'react';
import './BadgeGrant.scss';
import PulseDot from '../../../../components/Interface/PulseDot/PulseDot';
import postRequest from '../../../../utils/postRequest';
import { useNotification } from '../../../../NotificationContext';
import Popup from '../../../../components/Popup/Popup';
import ActivateBadge from '../ActivateBadge/ActivateBadge';
import MockBadge from '../../../../components/Interface/MockBadge/MockBadge';

const BadgeGrant = ({badgeGrant, onRefresh}) => {
    const { addNotification } = useNotification();

    const today = new Date();
    const validFrom = new Date(badgeGrant.validFrom);
    const validTo = new Date(badgeGrant.validTo);
    const isInactive = (today < validFrom || today > validTo);
    const [activatePopup, setActivatePopup] = useState(false);
    const [addPopup, setAddPopup] = useState(false);
    const [activateDays, setActivateDays] = useState(0);

    async function onActivateDays(daysValid){
        try {
            const response = await postRequest('/renew-badge-grant', {
                badgeGrantId: badgeGrant._id,
                daysValid: daysValid
            });
            
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Success',
                    message: 'Badge grant activated successfully',
                    type: 'success'
                });
                setActivatePopup(false);
                if (onRefresh) {
                    onRefresh();
                }
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to activate badge grant',
                type: 'error'
            });
        }
    }

    return (
        <>
            <Popup onClose={()=>setActivatePopup(false)} isOpen={activatePopup} customClassName='narrow-content'>
                {/* activate popup */}  
                {
                    badgeGrant && <ActivateBadge badgeGrant={badgeGrant} onActivate={onActivateDays}/>
                }
            </Popup>
            <div className="badge-grant">
                <MockBadge badgeColor={badgeGrant.badgeColor} badgeContent={badgeGrant.badgeContent} isInactive={isInactive}/>
                <div className={`badge-status ${isInactive ? 'inactive' : 'active'}`}>
                    <PulseDot color={isInactive ? 'var(--darkborder)' : 'var(--green)'} pulse={!isInactive} size={'7px'}/>
                    <p>{isInactive ? 'inactive' : 'active'}</p>
                </div>
                {
                    isInactive ? 
                    <div className="inactive-data">
                        <p>
                            last active:<br/>{validTo.toDateString()}
                        </p>
                    </div>
                    :
                    <div className="inactive-data">
                        <p>
                            active until:<br/>{validTo.toDateString()}
                        </p>
                    </div>
                }

                <button className={`badge-button ${isInactive ? 'inactive' : 'active'}`} onClick={()=>setActivatePopup(true)}>
                    <p>{isInactive ? 'activate' : 'deactivate'}</p>
                </button>
                
                <div className="badge-hash">
                    <p>Share URL:</p>
                    <div className="hash-container">
                        <input 
                            type="text" 
                            value={`${window.location.origin}/new-badge/${badgeGrant.hash}`}
                            readOnly
                            onClick={(e) => e.target.select()}
                        />
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/new-badge/${badgeGrant.hash}`);
                                addNotification({
                                    title: 'Copied!',
                                    message: 'Badge URL copied to clipboard',
                                    type: 'success'
                                });
                            }}
                            className="copy-btn"
                        >
                            Copy
                        </button>
                    </div>
                </div>

            </div>
        </>
    )
}

export default BadgeGrant;
