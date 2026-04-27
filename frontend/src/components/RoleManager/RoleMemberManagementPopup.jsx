import React, { useMemo, useState } from 'react';
import Popup from '../Popup/Popup';
import './RoleMemberManagementPopup.scss';

function RoleMemberManagementPopup({
    role,
    isOpen,
    onClose,
    assignedMembers = [],
    assignableMembers = [],
    getMemberId,
    getMemberDisplayName,
    getMemberInitial,
    onAssignMember,
    onRemoveMember,
    memberRoleActionPending = {}
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredAssignableMembers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return assignableMembers;
        return assignableMembers.filter((member) => getMemberDisplayName(member).toLowerCase().includes(query));
    }, [assignableMembers, getMemberDisplayName, searchTerm]);
    const filteredAssignedMembers = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return assignedMembers;
        return assignedMembers.filter((member) => getMemberDisplayName(member).toLowerCase().includes(query));
    }, [assignedMembers, getMemberDisplayName, searchTerm]);

    return (
        <Popup
            isOpen={Boolean(isOpen && role)}
            onClose={onClose}
            customClassName="role-member-management-popup medium-content"
        >
            {role ? (
                <div className="role-member-management">
                    <div className="role-member-management__header">
                        <h3>Manage {role.displayName || role.name}</h3>
                        <p>Search members to quickly assign or remove this role.</p>
                    </div>

                    <div className="role-member-management__search-wrap">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search members..."
                        />
                    </div>

                    <div className="role-member-management__columns">
                        <div className="role-member-management__section role-member-management__section--assigned">
                            <h4>Has role ({assignedMembers.length})</h4>
                            {filteredAssignedMembers.length === 0 ? (
                                <p className="role-member-management__empty">No matching members.</p>
                            ) : (
                                <div className="role-member-management__list">
                                    {filteredAssignedMembers.map((member) => (
                                        <button
                                            key={`${getMemberId(member)}-${role.name}`}
                                            type="button"
                                            className="role-member-management__member-row role-member-management__member-row--assigned"
                                            disabled={Boolean(memberRoleActionPending[`${getMemberId(member)}:${role.name}:remove`])}
                                            onClick={() => onRemoveMember(member)}
                                        >
                                            <div className="role-member-management__member">
                                                <span className="member-initial">{getMemberInitial(member)}</span>
                                                <span>{getMemberDisplayName(member)}</span>
                                            </div>
                                            <span className="action-text">
                                                {memberRoleActionPending[`${getMemberId(member)}:${role.name}:remove`] ? 'Removing...' : 'Remove'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="role-member-management__section role-member-management__section--available">
                            <h4>Available ({assignableMembers.length})</h4>
                            {filteredAssignableMembers.length === 0 ? (
                                <p className="role-member-management__empty">No matching members.</p>
                            ) : (
                                <div className="role-member-management__list">
                                    {filteredAssignableMembers.map((member) => (
                                        <button
                                            key={getMemberId(member)}
                                            type="button"
                                            className="role-member-management__member-row role-member-management__member-row--available"
                                            onClick={() => onAssignMember(member)}
                                        >
                                            <div className="role-member-management__member">
                                                <span className="member-initial">{getMemberInitial(member)}</span>
                                                <span>{getMemberDisplayName(member)}</span>
                                            </div>
                                            <span className="action-text">Assign</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </Popup>
    );
}

export default RoleMemberManagementPopup;
