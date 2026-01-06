import React, { useEffect, useState, useCallback } from 'react';
import './AccountSettings.scss';
import rightarrow from '../../assets/Icons/RightArrow.svg';
import pfp from '../../assets/defaultAvatar.svg';
import { saveUser, checkUsername } from '../../DBInteractions';
import { useNotification } from '../../NotificationContext';
import { debounce} from '../../Query.js';
import check from '../../assets/Icons/Check.svg';
import waiting from '../../assets/Icons/Waiting.svg';
import error from '../../assets/circle-warning.svg';
import unavailable from '../../assets/Icons/Circle-X.svg';
import useAuth from '../../hooks/useAuth.js';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import ImageUpload from '../ImageUpload/ImageUpload';
import axios from 'axios';
import GradientHeader from '../../assets/Gradients/ApprovalGrad.png';


function AccountSettings({ userInfo }) {

    const { validateToken } = useAuth();

    // const [active, setActive] = useState(false);

    // const [changeUsername, setChangeUsername] = 
    const [name, setName] = useState(userInfo.name);
    const [username, setUsername] = useState(userInfo.username);
    const [editUsername, setEditUsername] = useState(false);

    const [usernameValid, setUsernameValid] = useState(1);
    const { addNotification } = useNotification();
    const [initialUsername, setInitialUsername] = useState(userInfo.username);
    const [intialName, setInitialName] = useState(userInfo.name);

    const [uploadPfp, setUploadPfp] = useState(false);
    const [profilePicture, setProfilePicture] = useState(userInfo.picture);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    
    const [editEmail, setEditEmail] = useState(false);
    const [email, setEmail] = useState(userInfo.email);
    
    const handleFileSelect = (file) => {
        setSelectedFile(file);
    };

    const handleProfilePictureUpload = async (file) => {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await axios.post('/upload-user-image', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.data.success) {
                setProfilePicture(response.data.imageUrl);
                setUploadPfp(false);
                validateToken();
                addNotification({title: 'Profile Picture Updated', message: 'Your profile picture has been updated successfully', type: 'success'});
            } else {
                addNotification({title: 'Upload Failed', message: response.data.message || 'Failed to upload profile picture', type: 'error'});
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            addNotification({title: 'Upload Error', message: error.response?.data?.message || 'Error uploading profile picture', type: 'error'});
        } finally {
            setIsUploading(false);
            setSelectedFile(null);
        }
    };

    const handleFileClear = () => {
        setSelectedFile(null);
        setUploadPfp(false);
    };

    const validUsername = async (username) => {
        if (username === null || username === "") {
            return;
        }
        if (username === initialUsername) {
            setUsernameValid(1);
            return;
        }
        setUsernameValid(0);
        try{
            const response = await checkUsername(username);
            if(response){
                setUsernameValid(1);
            } else {
                setUsernameValid(2);
            }
        } catch (error){
            addNotification({title: 'Error checking username', message: error.message, type: 'error'});
        }
    };

    const debounced = useCallback(debounce(validUsername, 500),[]);


    useEffect(() => {
        if (username === null || username === "") {
            setUsernameValid(3);
            return;
        }
        if (username === initialUsername) {
            setUsernameValid(1);
            return;
        }
        setUsernameValid(0);
        debounced(username);
    }, [username]);


    const handleNameChange = (e) => {
            setName(e.target.value);
    };

    const handleUsernameChange = (e) => {
        setUsername(e.target.value);
    };

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
    };

    const saveUsername = () => {
        if (editUsername){
            try{
                saveUser(null, username, null, null, null, null);
                setInitialUsername(username);
                addNotification({title: 'Username saved', message: 'Your username has been changed successfully', type: 'success'});
            } catch (error) {
                addNotification({title: 'Error saving user', message: error.message, type: 'error'});
            }
        }
        setEditUsername(!editUsername);
    };

    const saveName = () => {
        try{
            saveUser(name, null, null, null, null, null);
            setInitialName(name);
            addNotification({title: 'Name saved', message: 'Your name has been changed successfully', type: 'success'});
        } catch (error) {
            addNotification({title: 'Error saving user', message: error.message, type: 'error'});
        }
    };

    const deleteAccount = () => {
        addNotification({title: 'Interanl Error', message: 'an internal error occurred', type: 'error'});
    };
    

    const uploadPfpToggle = () => {
        setUploadPfp(!uploadPfp);
    }

    return (
        <div className="header dash">
            <div className={`settings-right `}>
                <header className='header'>
                    <img src={GradientHeader} alt="" className="" />

                    <h1>Account Settings</h1>
                    <p>welcome back to your account settings</p>
                  
                </header>

                <div className='profile'>

                    <h2>profile settings</h2>
                    <hr />

                    <div className='name-settings'>
                        <div className="picture-container">
                            <img className="pfp" src={profilePicture ? profilePicture : pfp} alt="" />
                            <div className="add-picture" onClick={uploadPfpToggle}>
                                <Icon icon="mdi:image-add"/>
                            </div>
                        </div>

                        <div className='input-name'>
                            <h3>name:</h3>
                            <input type="text" value={name} onChange={handleNameChange}/>
                            {name !== intialName && <button className='save-name' onClick={saveName}>save</button>}
                        </div>

                    </div>
                    <div className={`pfp-upload ${uploadPfp && "active"}`}>
                        <ImageUpload 
                            uploadText="Drag your image here" 
                            onFileSelect={handleFileSelect}
                            onUpload={handleProfilePictureUpload}
                            onFileClear={handleFileClear}
                            isUploading={isUploading}
                            uploadMessage="Maximum size: 5MB"
                            fontSize={13}
                            orientation="horizontal"
                        />
                    </div>

                    <h2>security settings</h2>
                    <hr />
                    <div className="settings-rows-container">
                        <div className='user-container'>
                            <div className='user'>
                            {editUsername ? (
                                    <>  
                                        <input type="text" value={username} onChange={handleUsernameChange}
                                            // onBlur={saveUsername}
                                            // autoFocus
                                        />
                                            <div className="status">
                                                { usernameValid === 0 && <div className="checking"><img src={waiting} alt="" /><p>checking username...</p></div>}
                                                { usernameValid === 1 && <div className="available"><img src={check} alt="" /><p>username is available</p></div>}
                                                { usernameValid === 2 && <div className="taken"><img src={unavailable} alt="" /><p>username is taken</p></div>}
                                                { usernameValid === 3 && <div className="invalid"><img src={error} alt="" /><p>invalid username</p></div>}   
                                            </div>
                                    </>
                                    ): 
                                    (
                                    <>
                                        <h3>username</h3>
                                        <p>@{username}</p>
                                    </>
                                    )
                            }
                            
                            </div>
                            {/* <button onClick={(saveUsername) => setEditUsername(true)}>change username</button> */}
                            
                            <button disabled={usernameValid !== 1} onClick={(saveUsername)}> {editUsername ? 'save' : 'change username'} </button>

                        </div>
                        <div className='user-container'>
                            <div className='email'>
                            {editEmail ? (
                                    <input
                                        type="text" value={email} onChange={handleEmailChange}
                                        onBlur={saveUsername}
                                        autoFocus
                                    /> ): 
                                    (
                                    <>
                                        <h3>email</h3>
                                        <p>{userInfo.email}</p>
                                    </>
                                    )  
                            }
                            </div>
                            <button onClick={() => setEditEmail(true)}>change email</button>

                        </div>
                        <div className='user-container'>
                            <div className='password'>
                                <h3>password</h3>
                                <p>enabled</p>
                            </div>
                            <button>change password</button>

                        </div>
                    </div>

                    <h2>danger zone</h2>
                    <hr />
                    <div className="settings-rows-container">
                        <div className='delete' onClick={deleteAccount}>
                            <button>
                                <h3>delete account</h3>
                            </button>
                            <p>warning: this is a permanent action !</p>
                        </div>
                    </div>

                </div>
                <div className='security'>

                </div>

                <div className='danger'>

                </div>

            </div>

        </div>
    )

}

export default AccountSettings;