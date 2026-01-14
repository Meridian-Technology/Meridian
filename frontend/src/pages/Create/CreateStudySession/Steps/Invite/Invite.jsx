import React, { useState, useEffect } from 'react';
import './Invite.scss';
import { Icon } from '@iconify-icon/react';
import { useCache } from '../../../../../CacheContext';

const Invite = ({ formData, setFormData, onComplete }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [allFriends, setAllFriends] = useState([]);
    const [filteredFriends, setFilteredFriends] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState(formData.invitedUsers || []);
    const [hasVisited, setHasVisited] = useState(false);
    const [friendsLoading, setFriendsLoading] = useState(true);
    const { getFriends } = useCache();

    // Get all friends using cache
    useEffect(() => {
        const fetchFriends = async () => {
            try {
                setFriendsLoading(true);
                const friendsData = await getFriends();
                if (friendsData && friendsData.success) {
                    setAllFriends(friendsData.data || []);
                    setFilteredFriends(friendsData.data || []);
                }
            } catch (error) {
                console.error('Error fetching friends:', error);
            } finally {
                setFriendsLoading(false);
            }
        };
        fetchFriends();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only fetch once on mount, cache handles subsequent calls

    // Filter friends based on search term
    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredFriends(allFriends);
        } else {
            const filtered = allFriends.filter(friend => 
                friend.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                friend.username.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredFriends(filtered);
        }
    }, [searchTerm, allFriends]);

    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            invitedUsers: selectedUsers
        }));
    }, [selectedUsers, setFormData]);

    // Mark as visited when component mounts
    useEffect(() => {
        setHasVisited(true);
        // Mark this step as visited in the form data
        setFormData(prev => ({
            ...prev,
            inviteStepVisited: true
        }));
        // Call onComplete once when visited, not in a reactive useEffect
        onComplete(true);
    }, [setFormData]);

    const handleUserSelect = (user) => {
        if (!selectedUsers.find(u => u._id === user._id)) {
            setSelectedUsers(prev => [...prev, user]);
        }
        setSearchTerm('');
    };

    const handleUserRemove = (userId) => {
        setSelectedUsers(prev => prev.filter(u => u._id !== userId));
    };

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
    };

    return (
        <div className="invite-step">
            <div className="form-section">
                <h3>Invite Friends</h3>
                <p>Invite friends to join your study session. This is optional - you can always send invites later!</p>
                
                <div className="search-section">
                    <div className="search-input-container">
                        <Icon icon="mingcute:search-line" className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search your friends..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                            className="search-input"
                        />
                        {friendsLoading && (
                            <div className="search-loading">
                                <Icon icon="mingcute:loading-line" className="spinning" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Fixed height container for friends grid */}
                <div className="friends-container">
                    {filteredFriends.length > 0 && !friendsLoading && (
                        <div className="friends-grid">
                            {filteredFriends.map(user => {
                                const isSelected = selectedUsers.find(u => u._id === user._id);
                                return (
                                    <div
                                        key={user._id}
                                        className={`friend-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => isSelected ? handleUserRemove(user._id) : handleUserSelect(user)}
                                    >
                                        <div className="friend-avatar">
                                            {user.picture ? (
                                                <img 
                                                    src={user.picture} 
                                                    alt={user.name}
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                            ) : null}
                                            <div className="avatar-fallback" style={{ display: user.picture ? 'none' : 'flex' }}>
                                                {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                        </div>
                                        <div className="friend-name">
                                            {user.name}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {allFriends.length === 0 && !friendsLoading && (
                        <div className="no-results">
                            <Icon icon="mingcute:group-line" />
                            <p>You don't have any friends yet. Add some friends first to invite them to study sessions!</p>
                        </div>
                    )}

                    {searchTerm.length >= 2 && filteredFriends.length === 0 && allFriends.length > 0 && !friendsLoading && (
                        <div className="no-results">
                            <Icon icon="mingcute:user-search-line" />
                            <p>No friends found matching "{searchTerm}"</p>
                        </div>
                    )}
                </div>

                {/* Always show selection summary */}
                <div className={`selection-summary ${selectedUsers.length > 0 ? 'has-selections' : 'empty'}`}>
                    <Icon icon="mingcute:group-fill" />
                    <span>
                        {selectedUsers.length > 0 
                            ? `${selectedUsers.length} friend${selectedUsers.length !== 1 ? 's' : ''} selected`
                            : "No friends invited, pick someone to study with!"
                        }
                    </span>
                </div>
            </div>
        </div>
    );
};

export default Invite;
