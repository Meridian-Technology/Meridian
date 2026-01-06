import React from 'react';
import './SelectedUsers.scss';
import pfp from '../../assets/defaultAvatar.svg';

function SelectedUsers({ users, onRemoveUser, className = '' }) {
    if (!users || users.length === 0) {
        return null;
    }

    return (
        <div className={`selected-users-container ${className}`}>
            <div className="selected-users-header">
                <h3>Selected Users ({users.length})</h3>
            </div>
            <div className="selected-users-list">
                {users.map(user => (
                    <div key={user._id} className="selected-user-item">
                        <div className="user-content">
                            <div className="profile-picture">
                                <img src={user.picture || pfp} alt={user.name} />
                            </div>
                            <div className="user-info">
                                <h3>{user.name}</h3>
                                <p>@{user.username}</p>
                            </div>
                        </div>
                        {onRemoveUser && (
                            <button 
                                className="remove-button"
                                onClick={() => onRemoveUser(user)}
                                aria-label="Remove user"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default SelectedUsers; 