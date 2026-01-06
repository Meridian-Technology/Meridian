import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import './OrgDropdown.scss';

function OrgDropdown({ 
    showDrop, 
    setShowDrop, 
    user, 
    currentOrgName, 
    onOrgChange 
}) {
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        if (showDrop) {
            setShouldRender(true);
            setIsAnimating(true);
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 200); // Match the animation duration
            return () => clearTimeout(timer);
        }
    }, [showDrop]);

    return (
        <div className="org-dropdown" onClick={() => setShowDrop(!showDrop)}>
            <img src={user?.clubAssociations?.find(org => org.org_name === currentOrgName)?.org_profile_image} alt="" />
            <h1>{currentOrgName}</h1>
            <Icon 
                icon={`${showDrop ? "ic:round-keyboard-arrow-up" : "ic:round-keyboard-arrow-down"}`} 
                width="24" 
                height="24" 
            />
            {shouldRender && (
                <div className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`}>  
                    <div className="org-list">
                        {user?.clubAssociations?.map((org) => (
                            <div 
                                className={`drop-option ${org.org_name === currentOrgName && "selected"}`} 
                                key={org._id} 
                                onClick={() => onOrgChange(org)}
                            >
                                <img src={org.org_profile_image} alt="" />
                                <p>{org.org_name}</p>
                            </div>
                        ))}
                    </div>
                    <button className="create-org">
                        <p>new organization</p>
                    </button>
                </div>
            )}
        </div>
    );
}

export default OrgDropdown; 