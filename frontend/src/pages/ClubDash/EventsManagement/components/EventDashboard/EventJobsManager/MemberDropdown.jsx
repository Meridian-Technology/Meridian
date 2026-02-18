import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import defaultAvatar from '../../../../../../assets/defaultAvatar.svg';
import './MemberDropdown.scss';

function MemberDropdown({ 
    members, 
    selectedMemberId,
    onMemberSelect,
    disabled,
    placeholder = "Select member"
}) {
    const [showDrop, setShowDrop] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const dropdownRef = useRef(null);

    const selectedMember = members.find(m => 
        (m.user_id?._id?.toString() || m.user_id?.toString()) === selectedMemberId
    );

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

    // Handle click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDrop(false);
            }
        };

        if (showDrop) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDrop]);

    const handleMemberClick = (member) => {
        const memberId = member.user_id?._id || member.user_id;
        if (onMemberSelect) {
            onMemberSelect(memberId);
        }
        setShowDrop(false);
    };

    return (
        <div className="member-dropdown" ref={dropdownRef} onClick={(e) => {
            if (!disabled) {
                e.stopPropagation();
                setShowDrop(!showDrop);
            }
        }}>
            {selectedMember ? (
                <>
                    <img 
                        src={selectedMember.user_id?.picture || defaultAvatar} 
                        alt={selectedMember.user_id?.name || 'Member'} 
                    />
                    <h1>{selectedMember.user_id?.name || 'Unknown'}</h1>
                </>
            ) : (
                <h1>{placeholder}</h1>
            )}
            <Icon 
                icon={`${showDrop ? "ic:round-keyboard-arrow-up" : "ic:round-keyboard-arrow-down"}`} 
                width="20" 
                height="20" 
            />
            {shouldRender && (
                <div className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`} onClick={(e) => e.stopPropagation()}>  
                    <div className="member-list">
                        {members.length === 0 ? (
                            <div className="no-members">
                                <p>No members available</p>
                            </div>
                        ) : (
                            members.map((member) => {
                                const memberId = member.user_id?._id?.toString() || member.user_id?.toString();
                                const isSelected = memberId === selectedMemberId;
                                return (
                                    <div 
                                        className={`drop-option ${isSelected ? "selected" : ""}`} 
                                        key={memberId}
                                        onClick={() => handleMemberClick(member)}
                                    >
                                        <img 
                                            src={member.user_id?.picture || defaultAvatar} 
                                            alt={member.user_id?.name || 'Member'} 
                                        />
                                        <div className="member-info">
                                            <p>{member.user_id?.name || 'Unknown'}</p>
                                            {member.role && (
                                                <span className="member-role">{member.role}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MemberDropdown;
