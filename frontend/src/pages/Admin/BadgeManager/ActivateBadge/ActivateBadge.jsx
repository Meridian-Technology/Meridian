import React, { useEffect, useState } from 'react';
import './ActivateBadge.scss';
import postRequest from '../../../../utils/postRequest';
import MockBadge from '../../../../components/Interface/MockBadge/MockBadge';

const ActivateBadge = ({badgeGrant, onActivate}) => {
    const [activateDays, setActivateDays] = useState(0);
    const [activeUntil, setActiveUntil] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(()=>{
        if(activateDays !== 0){
            // Calculate date deactivation using timestamp to avoid month/year rollover issues
            const date = new Date();
            const timestamp = date.getTime();
            const daysInMs = activateDays * 24 * 60 * 60 * 1000;
            const newDate = new Date(timestamp + daysInMs);
            setActiveUntil(newDate);
        }
    },[activateDays]);

    const handleActivate = async () => {
        if (activateDays <= 0) {
            return;
        }
        
        setIsLoading(true);
        try {
            await onActivate(activateDays);
        } finally {
            setIsLoading(false);
        }
    };

    return (   
        <div className="activate-badge">
            <MockBadge badgeColor={badgeGrant.badgeColor} badgeContent={badgeGrant.badgeContent} isInactive={false}/>
            <div className="activate-input">
                activate for:
                <input 
                    type="number" 
                    value={activateDays} 
                    onChange={(e)=>{
                        if(e.target.value < 0){
                            return;
                        }
                        setActivateDays(parseInt(e.target.value) || 0);
                    }}
                    min="1"
                    max="365"
                />
                days
            </div>
            {
                activeUntil && (
                    <div className="activate-input">
                        active until:
                        {activeUntil.toLocaleDateString()}
                    </div>
                )
            }
            <button 
                onClick={handleActivate}
                disabled={isLoading || activateDays <= 0}
                className={isLoading ? 'loading' : ''}
            >
                {isLoading ? 'Activating...' : 'Activate'}
            </button>
        </div>
    )
}

export default ActivateBadge;
