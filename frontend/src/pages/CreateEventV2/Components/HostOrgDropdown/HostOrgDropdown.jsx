import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../../../hooks/useAuth';
import useOutsideClick from '../../../../hooks/useClickOutside';
import defaultAvatar from '../../../../assets/defaultAvatar.svg';
import './HostOrgDropdown.scss';

function HostOrgDropdown({ selectedHost, onHostChange, allowIndividualUserHosting = true, orgsWithEventPermission }) {
    const { user } = useAuth();
    const displayOrgs = orgsWithEventPermission ?? user?.clubAssociations ?? [];
    const [showDrop, setShowDrop] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const dropdownRef = useRef(null);

    const handleClose = useCallback(() => {
        setShowDrop(false);
    }, []);

    useOutsideClick(dropdownRef, handleClose);

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

    const getSelectedDisplay = () => {
        if (!selectedHost) {
            return {
                image: defaultAvatar,
                name: 'Select host',
                isPlaceholder: true,
            };
        }
        if (selectedHost.type === 'User') {
            return {
                image: user?.pfp || defaultAvatar,
                name: user?.username || 'Student',
                isPlaceholder: false,
            };
        }
        const org = displayOrgs.find(o => o._id === selectedHost.id);
        return {
            image: org?.org_profile_image || defaultAvatar,
            name: org?.org_name || 'Organization',
            isPlaceholder: false,
        };
    };

    const selected = getSelectedDisplay();

    const handleSelect = (host) => {
        onHostChange(host);
        setShowDrop(false);
    };

    return (
        <div className="host-org-dropdown-wrapper" ref={dropdownRef}>
            <div className="host-org-dropdown" onClick={() => setShowDrop(!showDrop)}>
                <div className="host-org">
                    <img src={selected.image} alt={selected.name} />
                    <h1 className={selected.isPlaceholder ? 'placeholder' : ''}>{selected.name}</h1>
                </div>
            <Icon
                icon={`${showDrop ? "ic:round-keyboard-arrow-up" : "ic:round-keyboard-arrow-down"}`}
                width="24"
                height="24"
            />
            {shouldRender && (
                <div className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="org-list">
                        {/* User option - only when individual hosting is allowed */}
                        {allowIndividualUserHosting && (
                            <div
                                className={`drop-option ${selectedHost?.type === 'User' && selectedHost?.id === user?._id ? "selected" : ""}`}
                                onClick={() => handleSelect({ id: user?._id, type: 'User' })}
                            >
                                <img src={user?.pfp || defaultAvatar} alt="" />
                                <p>{user?.username || 'Student'}</p>
                            </div>
                        )}
                        {/* Organization options */}
                        {displayOrgs.map((org) => (
                            <div
                                className={`drop-option ${selectedHost?.type === 'Org' && selectedHost?.id === org._id ? "selected" : ""}`}
                                key={org._id}
                                onClick={() => handleSelect({ id: org._id, type: 'Org' })}
                            >
                                <img src={org.org_profile_image || defaultAvatar} alt="" />
                                <p>{org.org_name}</p>
                            </div>
                        ))}
                        {allowIndividualUserHosting === false && displayOrgs.length === 0 && (
                            <div className="drop-option drop-option-disabled">
                                <p>You don&apos;t have permission to host events</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

export default HostOrgDropdown;
