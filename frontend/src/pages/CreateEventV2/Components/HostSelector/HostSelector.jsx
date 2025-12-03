import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../../../hooks/useAuth';
import defaultAvatar from '../../../../assets/defaultAvatar.svg';
import './HostSelector.scss';

function HostSelector({ 
    selectedHost, 
    onHostChange 
}) {
    const { user } = useAuth();
    const [showDrop, setShowDrop] = useState(false);
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
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [showDrop]);

    // Get display info for selected host
    const getSelectedHostInfo = () => {
        if (!selectedHost) {
            return {
                image: user?.pfp || defaultAvatar,
                name: user?.username || 'Student',
                type: 'User'
            };
        }
        
        if (selectedHost.type === 'User') {
            return {
                image: user?.pfp || defaultAvatar,
                name: user?.username || 'Student',
                type: 'User'
            };
        } else {
            const org = user?.clubAssociations?.find(org => org._id === selectedHost.id);
            return {
                image: org?.org_profile_image || defaultAvatar,
                name: org?.org_name || 'Organization',
                type: 'Org'
            };
        }
    };

    const selectedInfo = getSelectedHostInfo();

    const handleSelect = (host) => {
        onHostChange(host);
        setShowDrop(false);
    };

    return (
        <div className="host-selector">
            <label className="host-selector-label">Create Event As</label>
            <div className="host-dropdown" onClick={() => setShowDrop(!showDrop)}>
                <img src={selectedInfo.image} alt={selectedInfo.name} />
                <h3>{selectedInfo.name}</h3>
                <span className="host-type">{selectedInfo.type === 'User' ? 'Student' : 'Organization'}</span>
                <Icon 
                    icon={`${showDrop ? "ic:round-keyboard-arrow-up" : "ic:round-keyboard-arrow-down"}`} 
                    width="24" 
                    height="24" 
                />
                {shouldRender && (
                    <div className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`}>
                        <div className="host-list">
                            {/* Student/User option */}
                            <div 
                                className={`host-option ${selectedHost?.type === 'User' && "selected"}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelect({
                                        id: user?._id,
                                        type: 'User'
                                    });
                                }}
                            >
                                <img src={user?.pfp || defaultAvatar} alt="Student" />
                                <div className="host-option-info">
                                    <p>{user?.username || 'Student'}</p>
                                    <span className="host-option-type">Student</span>
                                </div>
                            </div>
                            
                            {/* Organization options */}
                            {user?.clubAssociations?.map((org) => (
                                <div 
                                    className={`host-option ${selectedHost?.type === 'Org' && selectedHost?.id === org._id && "selected"}`}
                                    key={org._id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelect({
                                            id: org._id,
                                            type: 'Org'
                                        });
                                    }}
                                >
                                    <img src={org.org_profile_image || defaultAvatar} alt={org.org_name} />
                                    <div className="host-option-info">
                                        <p>{org.org_name}</p>
                                        <span className="host-option-type">Organization</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default HostSelector;




