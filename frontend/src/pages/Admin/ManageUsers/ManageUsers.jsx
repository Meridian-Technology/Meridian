import React, { useEffect, useState } from 'react';
import UserSearch from '../../../components/UserSearch';
import './ManageUsers.scss'
import useAuth from '../../../hooks/useAuth';
import CardHeader from '../../../components/ProfileCard/CardHeader/CardHeader';
import Popup from '../../../components/Popup/Popup';
import ManageUser from './ManageUser/ManageUser';

function ManageUsers({}){
    const {user} = useAuth();
    const [selectedUser, setSelectedUser] = useState(user);
    const [isManagingUsers, setIsManaging] = useState(false);

    return (
        <>
            <Popup isOpen={isManagingUsers} onClose={setIsManaging} popout={true} customClassName='manage-user'>
                <ManageUser user={selectedUser}/>
            </Popup>
            <div className="manage-users">
                <CardHeader userInfo={selectedUser} />
                <button onClick={()=>{setIsManaging(true)}}>
                    manage user
                </button>
                <UserSearch onUserSelect={setSelectedUser}/>
            </div>
        </>
    )
}

export default ManageUsers;