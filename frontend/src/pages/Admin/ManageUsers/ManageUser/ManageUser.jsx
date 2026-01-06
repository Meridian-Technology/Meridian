import React, { useEffect, useState } from 'react';
import './ManageUser.scss';
import CardHeader from '../../../../components/ProfileCard/CardHeader/CardHeader';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';

function ManageUser({user, refetch}){
    const [roleInput, setRoleInput] = useState('');
    const {addNotification} = useNotification();
    const updateRole = async () => {
        const result = await postRequest('/manage-roles',{role: roleInput, userId: user._id});
        if(result.error){
            addNotification({title:'Problem changing roles',  message:'if this error keeps happening, you\'re out of luck'})
        } else {
            if(user.roles.includes(roleInput)){
                addNotification({title:'Changed roles', type: 'success', message: `you removed ${user.username}'s role successfully!`});
                user.roles = user.roles.filter((a)=>a!==roleInput);
            } else {
                addNotification({title:'Changed roles', type: 'success', message: `you changed ${user.username}'s role successfully!`});
                user.roles.push(roleInput);
            }
            setRoleInput('');
        }
    }
    return (
        <div className="manage-user">
            <CardHeader userInfo={user} />
            <div className="actions-container">
                <HeaderContainer header='user roles' icon="ic:round-dashboard" classN="roles-container" size='14px'>
                    <div className="roles">
                        {user.roles.map((role, i) => {
                            return(
                                <div className="role" key={`role-${i}`}>
                                    <p>{role}</p>
                                </div>
                            )
                        })}
                    </div>
                    <div className="manage-roles">
                        <input 
                            type="text" 
                            id="manage-role" 
                            placeholder='add/remove roles'
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    updateRole();
                                }
                            }}
                            value={roleInput}
                            onChange={(e)=>setRoleInput(e.target.value)}
                        />
                        <label htmlFor="manage-role">
                            <button onClick={updateRole}>
                                +
                            </button>
                        </label>
                    </div>
                </HeaderContainer>
                <div className="dangerous-actions">
                    <button className="action">
                        <p>delete</p>
                    </button>
                    <button className="action">
                        <p>ban</p>
                    </button>
                </div>
            </div>

        </div>
    )
}

export default ManageUser;