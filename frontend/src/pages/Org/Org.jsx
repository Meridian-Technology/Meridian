import React, {useState, useEffect} from 'react';
import rpiLogo from "../../assets/Icons/rpiLogo.svg";
import person from "../../assets/Icons/Profile.svg";
import defaultAvatar from "../../assets/defaultAvatar.svg";
import FormViewer from '../../components/FormViewer/FormViewer';
import Popup from '../../components/Popup/Popup';
import OrgEvents from '../../components/OrgEvents/OrgEvents';
import OrgMessageFeed from '../../components/OrgMessages/OrgMessageFeed';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { useCache } from '../../CacheContext';
import { sendFriendRequest } from '../Friends/FriendsHelpers';
import { getOrgRoleColor } from '../../utils/orgUtils';
import './Org.scss';
import { useNavigate } from 'react-router-dom';

const Org = ({ orgData, refetch }) => {

    const { overview, members, followers } = orgData.org;
    const [showForm, setShowForm] = useState(false);
    const {user, friendRequests, refreshFriendRequests} = useAuth();
    const [activeTab, setActiveTab] = useState('home');
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [isLoading, setIsLoading] = useState({ join: false, follow: false, leave: false });
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const { getFriends } = useCache();
    const [friendsData, setFriendsData] = useState(null);
    const [friendRequestLoading, setFriendRequestLoading] = useState({});

    // Fetch friends using cache
    useEffect(() => {
        const fetchFriends = async () => {
            const data = await getFriends();
            setFriendsData(data);
        };
        fetchFriends();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only fetch once on mount, cache handles subsequent calls

    // Calculate mutual friends (friends who are members)
    const mutualFriends = React.useMemo(() => {
        if (!friendsData?.success || !members || !Array.isArray(members)) {
            return [];
        }
        
        const friendIds = new Set(friendsData.data.map(friend => friend._id.toString()));
        
        return members
            .filter(member => {
                const memberUserId = member.user_id?._id?.toString() || member.user_id?.toString();
                return memberUserId && friendIds.has(memberUserId);
            })
            .map(member => ({
                _id: member.user_id?._id || member.user_id,
                name: member.user_id?.name || '',
                username: member.user_id?.username || '',
                picture: member.user_id?.picture || null
            }));
    }, [friendsData, members]);

    const handleApply = async (formAnswers = null) => {
        try {
            setIsLoading({ ...isLoading, join: true });
            // Only include formResponse in request body if formAnswers is provided
            const requestBody = formAnswers ? { formResponse: formAnswers } : {};
            const response = await apiRequest(`/${overview._id}/apply-to-org`, requestBody);
            
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Success',
                    message: response.message || (overview.requireApprovalForJoin ? 'Application submitted successfully' : 'You are now a member'),
                    type: 'success'
                });
                refetch();
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to submit application. Please try again.',
                type: 'error'
            });
        } finally {
            setIsLoading({ ...isLoading, join: false });
        }
    }
    

    const initiateApply = () => {
        if(overview.requireApprovalForJoin) {
            if(overview.memberForm) {
                setShowForm(true);
            } else {
                // No form but approval required - apply without form
                handleApply(null);
            }
        } else {
            // No approval needed - join directly
            handleApply(null);
        }
    }

    const handleFormSubmit = (answers) => {
        setShowForm(false);
        handleApply(answers);
    }

    const handleFollow = async () => {
        // Optimistically update the UI immediately
        orgData.org.isFollower = true;
        
        try {
            const response = await apiRequest(`/follow-org/${overview._id}`);
            
            if (response.error) {
                // Revert on error
                orgData.org.isFollower = false;
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
                // Refetch to sync state
                setTimeout(() => refetch(), 100);
            } else {
                addNotification({
                    title: 'Success',
                    message: 'You are now following this organization',
                    type: 'success'
                });
                // Refetch in background to sync state
                setTimeout(() => refetch(), 100);
            }
        } catch (error) {
            // Revert on error
            orgData.org.isFollower = false;
            addNotification({
                title: 'Error',
                message: 'Failed to follow organization. Please try again.',
                type: 'error'
            });
            // Refetch to sync state
            setTimeout(() => refetch(), 100);
        }
    }

    const handleUnfollow = async () => {
        // Optimistically update the UI immediately
        orgData.org.isFollower = false;
        
        try {
            const response = await apiRequest(`/unfollow-org/${overview._id}`);
            
            if (response.error) {
                // Revert on error
                orgData.org.isFollower = true;
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
                // Refetch to sync state
                setTimeout(() => refetch(), 100);
            } else {
                addNotification({
                    title: 'Success',
                    message: 'You have unfollowed this organization',
                    type: 'success'
                });
                // Refetch in background to sync state
                setTimeout(() => refetch(), 100);
            }
        } catch (error) {
            // Revert on error
            orgData.org.isFollower = true;
            addNotification({
                title: 'Error',
                message: 'Failed to unfollow organization. Please try again.',
                type: 'error'
            });
            // Refetch to sync state
            setTimeout(() => refetch(), 100);
        }
    }

    const handleFollowToggle = () => {
        if (orgData.org.isFollower) {
            handleUnfollow();
        } else {
            handleFollow();
        }
    }

    const handleLeave = async () => {
        try {
            setIsLoading({ ...isLoading, leave: true });
            const response = await apiRequest(`/leave-org/${overview._id}`);
            
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Success',
                    message: response.message || 'You have left the organization',
                    type: 'success'
                });
                refetch();
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to leave organization. Please try again.',
                type: 'error'
            });
        } finally {
            setIsLoading({ ...isLoading, leave: false });
        }
    }

    const handleLeaveClick = () => {
        if (window.confirm(`Are you sure you want to leave ${overview.org_name}?`)) {
            handleLeave();
        }
    }

    // Check if a user is already a friend
    const isFriend = (userId) => {
        if (!friendsData?.success || !friendsData?.data) return false;
        const friendIds = friendsData.data.map(friend => friend._id.toString());
        const memberUserId = userId?._id?.toString() || userId?.toString();
        return memberUserId && friendIds.includes(memberUserId);
    }

    // Check if a friend request is pending (sent by current user)
    const isPendingFriendRequest = (userId) => {
        if (!friendRequests?.sent || !Array.isArray(friendRequests.sent)) return false;
        const memberUserId = userId?._id?.toString() || userId?.toString();
        if (!memberUserId) return false;
        
        // Check if this user is in the sent requests list
        return friendRequests.sent.some(request => {
            const recipientId = request.recipient?._id?.toString() || request.recipient?.toString();
            return recipientId === memberUserId;
        });
    }

    // Get role order for sorting

    // Note: we likely need to refactor custome roles a bit to apply ordering
    const getRoleOrder = (roleName) => {
        // Default role order mapping
        const defaultOrder = {
            'owner': 0,
            'admin': 1,
            'officer': 2,
            'member': 3
        };

        // Check if org has positions/roles defined
        if (overview?.positions && Array.isArray(overview.positions)) {
            const role = overview.positions.find(pos => pos.name === roleName);
            if (role && typeof role.order === 'number') {
                return role.order;
            }
        }

        // Fall back to default order
        return defaultOrder[roleName] !== undefined ? defaultOrder[roleName] : 999;
    }

    // Sort members by role order (lower order = higher role)
    const sortedMembers = React.useMemo(() => {
        if (!members || !Array.isArray(members)) return [];
        
        return [...members].sort((a, b) => {
            const roleA = a.role || 'member';
            const roleB = b.role || 'member';
            const orderA = getRoleOrder(roleA);
            const orderB = getRoleOrder(roleB);
            
            // Sort by role order first
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            
            // If same role, sort alphabetically by name
            const nameA = a.user_id?.name || a.user_id?.username || '';
            const nameB = b.user_id?.name || b.user_id?.username || '';
            return nameA.localeCompare(nameB);
        });
    }, [members, overview]);

    // Handle sending friend request
    const handleAddFriend = async (member) => {
        const memberUserId = member.user_id?._id || member.user_id;
        const memberUserIdStr = (memberUserId?.toString() || memberUserId || '').toString();
        const username = member.user_id?.username;
        
        if (!username) {
            addNotification({
                title: 'Error',
                message: 'Unable to send friend request',
                type: 'error'
            });
            return;
        }

        setFriendRequestLoading(prev => ({ ...prev, [memberUserIdStr]: true }));

        try {
            const result = await sendFriendRequest(username);
            
            if (result === 'Friend request sent') {
                // Refresh friend requests from AuthContext
                await refreshFriendRequests();
                addNotification({
                    title: 'Success',
                    message: `Friend request sent to ${member.user_id?.name || username}`,
                    type: 'success'
                });
            } else if (result === 'User not found') {
                addNotification({
                    title: 'Error',
                    message: 'User not found',
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Error',
                    message: result,
                    type: 'error'
                });
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to send friend request',
                type: 'error'
            });
        } finally {
            setFriendRequestLoading(prev => ({ ...prev, [memberUserIdStr]: false }));
        }
    }
    
    return (
        <div className="org-page page">
            <Popup isOpen={showForm} onClose={() => setShowForm(false)}>
                <FormViewer form={overview.memberForm} onSubmit={handleFormSubmit} /> 
            </Popup>
            <div className='org-content'>
                <div className="org-header-container">
                    <div className="top-header-box">
                        {overview.org_banner_image ? (
                            <img 
                                src={overview.org_banner_image} 
                                alt={`${overview.org_name} banner`}
                                className="banner-image"
                            />
                        ) : null}
                    </div>

                    <div className="org-info">
                        <div className="org-logo">
                            <div className="img-container">
                                <img src={overview.org_profile_image ? overview.org_profile_image : rpiLogo} alt=""/>
                            </div>
                        </div>
                        <div className="org-content-section">
                            <div className="org-header-row">
                                <div className="title-row">
                                    <h2 className="name">{overview.org_name}</h2>
                                    <div className="verification-badge">
                                        <Icon icon="material-symbols:verified-rounded" />
                                    </div>
                                </div>
                                <div className="header-stats">
                                    <img src = {person} alt =""/>
                                    <span>{orgData?.org?.members?.length}</span>
                                </div>
                            </div>
                            <p className="description desktop-description">
                                {overview.org_description}
                            </p>
                        </div>
                    </div>
                </div>

                <div 
                    className={`mobile-description-box ${isDescriptionExpanded ? 'expanded' : 'collapsed'}`}
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                >
                    <div className="mobile-description-header">
                        <span>Description</span>
                        <Icon 
                            icon={isDescriptionExpanded ? "material-symbols:expand-less" : "material-symbols:expand-more"} 
                            className="expand-icon"
                        />
                    </div>
                    <div className="mobile-description-wrapper">
                        <p className="description mobile-description">
                            {overview.org_description}
                        </p>
                    </div>
                </div>

                {/* 2 base states: joined, not joined */}
                <div className="actions-container">
                    <div className="actions">
                        {/* {
                            overview.requireApprovalForJoin ? (
                                <button onClick={initiateApply}>Apply</button>
                            ) : (
                                <button>Join</button>
                            )
                        } */}
                        {
                            orgData.org.isMember ? (
                                <button 
                                    className="no-action joined" 
                                    onClick={handleLeaveClick}
                                    disabled={isLoading.leave}
                                >
                                    <Icon icon="material-symbols:check-rounded" />
                                    {isLoading.leave ? 'Leaving...' : 'Joined'}
                                </button>
                            ) : orgData.org.isPending ? (
                                <button disabled={true}>Pending...</button>
                            ) : overview.requireApprovalForJoin ? (
                                <button onClick={initiateApply} disabled={isLoading.join}>
                                    {isLoading.join ? 'Applying...' : 'Apply'}
                                </button>
                            ) : (
                                <button onClick={initiateApply} disabled={isLoading.join}>
                                    {isLoading.join ? 'Joining...' : 'Join'}
                                </button>
                            )
                        }
                        <button 
                            onClick={handleFollowToggle} 
                            className={`follow-button ${orgData.org.isFollower ? 'following' : 'not-following'}`}
                            title={orgData.org.isFollower ? 'Unfollow' : 'Follow'}
                        >
                            <Icon icon={orgData.org.isFollower ? "material-symbols:notifications-active" : "material-symbols:notifications-outline"} />
                        </button>
                        {overview.socialLinks && overview.socialLinks.length > 0 && (
                            <div className="social-links-pips">
                                {overview.socialLinks
                                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                                    .map((link, index) => {
                                        let url, icon, label;
                                        
                                        if (link.type === 'website') {
                                            url = link.url;
                                            icon = 'mdi:link';
                                            label = link.title || 'Website';
                                        } else {
                                            const baseUrls = {
                                                instagram: 'https://instagram.com/',
                                                youtube: 'https://youtube.com/@',
                                                tiktok: 'https://tiktok.com/@'
                                            };
                                            url = `${baseUrls[link.type]}${link.username}`;
                                            const icons = {
                                                instagram: 'mdi:instagram',
                                                youtube: 'mdi:youtube',
                                                tiktok: 'simple-icons:tiktok'
                                            };
                                            icon = icons[link.type];
                                            label = `${link.type.charAt(0).toUpperCase() + link.type.slice(1)}: ${link.username}`;
                                        }
                                        
                                        return (
                                            <a
                                                key={index}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="social-link-pip"
                                                title={label}
                                            >
                                                <Icon icon={icon} />
                                            </a>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                    {
                        user.clubAssociations.find(club => club.org_name === overview.org_name) && (
                            <button 
                                className="dashboard-button"
                                onClick={()=>{
                                    navigate(`/club-dashboard/${overview.org_name}`);
                                }}
                            >
                                <Icon icon="material-symbols:admin-panel-settings" />
                                Dashboard
                            </button>
                        ) 
                    }
                </div>

                {!orgData.org.isMember && mutualFriends.length > 0 && (
                    <div className="mutuals-stats">
                        <div className="mutual-friends-avatars">
                            {mutualFriends.slice(0, 3).map((friend, index) => (
                                <img 
                                    key={friend._id} 
                                    src={friend.picture || defaultAvatar} 
                                    alt={friend.name || friend.username}
                                    className="mutual-avatar"
                                    style={{ zIndex: 3 - index }}
                                />
                            ))}
                        </div>
                        <span className="mutual-friends-text">
                            {mutualFriends.length === 1 
                                ? `${mutualFriends[0].name || mutualFriends[0].username} is already a member`
                                : mutualFriends.length === 2
                                ? `${mutualFriends[0].name || mutualFriends[0].username} and ${mutualFriends[1].name || mutualFriends[1].username} are already members`
                                : `${mutualFriends.slice(0, 2).map(f => f.name || f.username).join(' and ')}, and ${mutualFriends.length - 2} other friend${mutualFriends.length - 2 === 1 ? '' : 's'} ${mutualFriends.length - 2 === 1 ? 'is' : 'are'} already members`
                            }
                        </span>
                    </div>
                )}

                <div className="org-dashboard">
                    <div className="filter-buttons">
                        <button
                            className={`filter-button ${activeTab === 'home' ? 'active' : ''}`}
                            onClick={() => setActiveTab('home')}
                        >
                            Discussion
                        </button>
                        <button
                            className={`filter-button ${activeTab === 'events' ? 'active' : ''}`}
                            onClick={() => setActiveTab('events')}
                        >
                            Events
                        </button>
                        <button
                            className={`filter-button ${activeTab === 'members' ? 'active' : ''}`}
                            onClick={() => setActiveTab('members')}
                        >
                            Members
                        </button>
                    </div>
                </div>
                {
                    activeTab === 'events' ? (
                        <div className="events-content">
                            <OrgEvents orgId={overview?._id} />
                        </div>
                    ) : activeTab === 'members' ? (
                        <div className="members-content">
                            {sortedMembers && sortedMembers.length > 0 ? (
                                <div className="members-list">
                                    {sortedMembers.map((member) => {
                                        const memberUser = member.user_id;
                                        const memberUserId = memberUser?._id || memberUser;
                                        const memberUserIdStr = (memberUserId?.toString() || memberUserId || '').toString();
                                        const isAlreadyFriend = isFriend(memberUser);
                                        const isPending = isPendingFriendRequest(memberUser);
                                        const isLoading = friendRequestLoading[memberUserIdStr];
                                        const role = member.role || 'member';
                                        const roleColor = getOrgRoleColor(role, 1);
                                        const roleBgColor = getOrgRoleColor(role, 0.1);
                                        
                                        return (
                                            <div key={member._id || memberUserIdStr} className="member-card">
                                                <div className="member-info">
                                                    <img 
                                                        src={memberUser?.picture || defaultAvatar} 
                                                        alt={memberUser?.name || memberUser?.username || 'Member'}
                                                        className="member-avatar"
                                                    />
                                                    <div className="member-details">
                                                        <h3 className="member-name">
                                                            {memberUser?.name || memberUser?.username || 'Unknown'}
                                                        </h3>
                                                        <p className="member-username">
                                                            @{memberUser?.username || 'unknown'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="member-actions">
                                                    <span 
                                                        className="member-role" 
                                                        style={{ 
                                                            backgroundColor: roleBgColor, 
                                                            color: roleColor 
                                                        }}
                                                    >
                                                        {role}
                                                    </span>
                                                    {(() => {
                                                        const currentUserId = (user?._id?.toString() || user?._id || '').toString();
                                                        return memberUserIdStr && memberUserIdStr !== currentUserId;
                                                    })() && (
                                                        <button
                                                            className={`add-friend-button ${isAlreadyFriend ? 'already-friend' : ''} ${isPending ? 'pending' : ''}`}
                                                            onClick={() => !isAlreadyFriend && !isPending && handleAddFriend(member)}
                                                            disabled={isAlreadyFriend || isLoading || isPending}
                                                            title={isAlreadyFriend ? 'Friends' : isPending ? 'Request Pending' : 'Add Friend'}
                                                        >
                                                            {isLoading ? (
                                                                <Icon icon="material-symbols:hourglass-empty" />
                                                            ) : isAlreadyFriend ? (
                                                                <Icon icon="material-symbols:check-rounded" />
                                                            ) : isPending ? (
                                                                <Icon icon="material-symbols:schedule" />
                                                            ) : (
                                                                <Icon icon="material-symbols:person-add" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="no-members">No members found</p>
                            )}
                        </div>
                    ) : activeTab === 'home' ? (
                        <div className="announcements-content">
                            <OrgMessageFeed orgId={overview._id} orgData={orgData} />
                        </div>
                    ) : null
                }
                {/* <div className="meeting-schedule">
                    <h3>meetings schedule</h3>
                    <div className="meeting-card">
                        <div className='title'>
                            <img src={rpiLogo} alt="" className='logo'/>
                            <h4>YDSA Weekly GBM</h4>
                        </div>
                        <div className='info'>
                            <div className='item'> 
                                <img src={calendar} alt="" />
                                <p>Weekly on Thursday at 5:00</p>
                                <img src={locate} alt="" />
                                <p>Phalanx</p>
                            </div>

                        </div>
                    </div>
                </div> */}
            </div>
        </div>
    );
};

export default Org;
