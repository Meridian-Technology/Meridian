import React from 'react';
import './FriendRequest.scss';
import Friend from '../Friend/Friend';
import { useNotification } from '../../../NotificationContext';
import { updateFriendRequest } from '../FriendsHelpers';
import { useCache } from '../../../CacheContext';

function FriendRequest({ friendRequest, reload, setReload }) {
    const { addNotification } = useNotification();
    const { refreshFriends } = useCache();

    const handleAccept = async () => {
        console.log('accepting friend request');
        try{
            const response =  await updateFriendRequest(friendRequest._id, 'accept');
            if(response === 'Friend request updated'){
                // Refresh friends cache after accepting request
                await refreshFriends();
                addNotification({title: 'Accepted friend request', message: `is now your friend`, type: 'success'});
            } else {
                addNotification({title: 'Error accepting friend request', message: response, type: 'error'});
            }
            setReload(reload + 1);
        } catch (error){
            console.error('Error accepting friend request:', error);
            addNotification({title: 'Error accepting friend request', message: error.message, type: 'error'});
            return;
        }
    }

    const handleDecline = async () => {
        console.log('declining friend request');
        try{
            const response =  await updateFriendRequest(friendRequest._id, 'reject');
            if(response === 'Friend request updated'){
                // Refresh friends cache after declining (to ensure cache is up to date)
                await refreshFriends();
                addNotification({title: 'Declined friend request', message: `request from ${friendRequest.requester.username} has been declined`, type: 'success'});
            } else {
                addNotification({title: 'Error declining friend request', message: response, type: 'error'});
            }
            setReload(reload + 1);
        } catch (error){
            console.error('Error accepting friend request:', error);
            addNotification({title: 'Error accepting friend request', message: error.message, type: 'error'});
            return;
        }
    }

    return (
        <div className="friend-request">
            <Friend friend={friendRequest.requester} isFriendRequest={true} reload={reload} setReload={setReload}/>
            <div className="friend-request-buttons">
                <button className='accept ' onClick={handleAccept}>accept</button>
                <button className='decline' onClick={handleDecline}>decline</button>
            </div>
        </div>
    );
}

export default FriendRequest;