import React, { useState, useEffect } from 'react';
import './CreateEvent.scss';
import Header from '../../components/Header/Header';
import EventInfo from '../../assets/Icons/EventInfo.svg';
import Calendar from '../../assets/Icons/Calendar.svg';
import CheckBlack from '../../assets/Icons/CheckBlack.svg';
import WhenWhere from '../../components/CreateEvent/WhenWhere/WhenWhere';
import GenInfo from '../../components/CreateEvent/GenInfo/GenInfo';
import Review from '../../components/CreateEvent/Review/Review';
import CustomFormFill from '../../components/CreateEvent/CustomFormFill/CustomFormFill';
import { useNotification } from '../../NotificationContext';
import { createEvent } from './CreateEventHelpers';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import defaultAvatar from '../../assets/defaultAvatar.svg'
import postRequest from '../../utils/postRequest';

function CreateEvent(){
    const location = useLocation();
    const origin = location.state ? location.state.origin : "";
    const [step, setStep] = useState(0);
    const [info, setInfo] = useState({});
    const [finishedStep, setFinishedStep] = useState(0);
    const {isAuthenticated, isAuthenticating, user} = useAuth();
    const [alias, setAlias] = useState(null);
    const navigate = useNavigate();
    const [showDrop, setShowDrop] = useState(false);

    const [showForm, setShowForm] = useState(false);

    useEffect(()=>{
        if(isAuthenticating){
            return;
        }
        // if(!isAuthenticated){
        //     navigate('/');
        // }
        if(!user){
            return;
        }
        // if(!(user.roles.includes('oie') || user.roles.includes('admin') || user.roles.includes('developer'))){
        //     navigate('/');
        // }
        if(origin && origin !== ""){
            const club = user.clubAssociations.find((org)=>org.org_name === origin);
            if(club){
                setAlias({
                    img: club.org_profile_image,
                    text: club.org_name,
                    id: club._id,
                    type: 'club'
                });
            } else {
                navigate('/');
            }
        } else {
            setAlias({
                img: user.pfp ? user.pfp : defaultAvatar,
                text: user.username,
                id: user._id,
                type: 'user'
            });
        }
    }, [isAuthenticating, isAuthenticated, user]);

    const {addNotification} = useNotification();
    
    const nextStep = () => {
        setStep(step+1);
        setFinishedStep(step+1);
    }

    useEffect(()=>{
        if(info.location === 'Darrin Communications Center 174'){
            setShowForm(true);
        } else {
            setShowForm(false);
        }
    }, [info])

    const renderStep = () => {
        switch(step){
            case 0:
                return <GenInfo next={nextStep}/>
            case 1:
                return <WhenWhere next={nextStep}/>
            case 2:
                if(showForm){
                    
                    return <CustomFormFill next={nextStep}/>
                } else {
                    console.log("here")
                    return <Review next={nextStep}/>
                }
            case 3:
                return <Review next={nextStep}/>
            default:
                return <GenInfo next={nextStep}/>
        }
    }

    const handleSwitch = (step) => {
        if(finishedStep < step){
            addNotification({title: "Please complete previous steps", message: "Please complete the previous steps before proceeding", type: "error"});
        } else{
            setStep(step);
        }
    }

    const onSubmit = async () => {
        const location1 = info.location;
        console.log(location1);
        let formattedInfo = {
            ...info
        }
        if (alias.text !== user.username){
            formattedInfo = {
                ...formattedInfo,
                orgId: alias.id,
            }
        }

        // Create FormData if we have an image
        const formData = new FormData();
        if (info.selectedFile) {
            console.log('Uploading image');
            formData.append('image', info.selectedFile);
        }

        // Append all other event data
        Object.keys(formattedInfo).forEach(key => {
            if (key !== 'selectedFile' && key !== 'image') {
                formData.append(key, formattedInfo[key]);
            }
        });

        const response = await createEvent(formData);

        if(response){
            addNotification({title: "Event created", message: "Your event has been created successfully", type: "success"});
            navigate('/events-dashboard');
        } else {
            addNotification({title: "Failed to create event", message: "An error occurred while creating your event", type: "error"});
        }
    }

    const onSelectAlias = (alias) => {
        setAlias(alias);
        setShowDrop(false);
    }

    return(
        <div className="create-event page">
            <Header/>
            <div className="content-container">
                <div className="content">
                    <div className="create-steps">
                        <div className="create-header">
                            <h1>create event</h1>
                            <div className="alias">
                                <p>as</p>
                                <div className="choice-container">
                                    <div className="choose" onClick={()=>setShowDrop(!showDrop)}>
                                        {
                                            alias && 
                                            <div className="choice">
                                                <img src={alias.img} alt="" />
                                                <p>{alias.text}</p>
                                            </div>
                                        }
                                        <Icon icon={`${showDrop ? "ic:round-keyboard-arrow-up" : "ic:round-keyboard-arrow-down"}`} width="24" height="24"  />
                                    </div>
                                    {
                                        showDrop && 
                                        <div className={`dropdown`} >
                                            {user && 
                                                <div className="drop-option" onClick={()=>onSelectAlias({img: user.pfp ? user.pfp : defaultAvatar, text: user.username, id: user._id, type: 'user'})}>
                                                    <img src={user.pfp ? user.pfp : defaultAvatar} alt="" />
                                                    <p>{user.username}</p>
                                                </div>
                                            }
                                            {
                                                user && user.clubAssociations && user.clubAssociations.map((org)=>{
                                                    return(
                                                        <div className="drop-option" key={org._id} onClick={()=>onSelectAlias({img: org.org_profile_image, text: org.org_name, id: org._id, type: "club"})}>
                                                            <img src={org.org_profile_image} alt="" />
                                                            <p>{org.org_name}</p>
                                                        </div>
                                                    )
                                                })
                                            }
                                        </div>
                                    }
                                </div>
                            </div>
                        </div>
                        <div className="steps">
                            <div className={`step ${step === 0 && "selected"}`} onClick={()=>{handleSwitch(0)}}>
                                <img src={EventInfo} alt="" />
                                <p>information</p>
                            </div>
                            <div className={`step ${step === 1 && "selected"}`}  onClick={()=>{handleSwitch(1)}}>
                                <img src={Calendar} alt="" />
                                <p>when & where</p>
                            </div>
                            {
                                showForm &&
                                <div className={`step ${step === 2 && "selected"}`} onClick={()=>{handleSwitch(2)}}>
                                    <Icon icon="mdi:form" />
                                    <p>form</p> 
                                </div>
                            }
                            <div className={`step ${(showForm ? step === 3 : step === 2 )&& "selected"}`}  onClick={()=>{handleSwitch(showForm ? 3 : 2)}}>
                                <img src={CheckBlack} alt="" />
                                <p>review</p>
                            </div>
                        </div>
                    </div>
                    <div className="create-workspace">
                        <GenInfo next={nextStep} visible={step === 0} setInfo={setInfo}/>
                        <WhenWhere next={nextStep} visible={step === 1} setInfo={setInfo}/>
                        {
                            showForm &&
                            <CustomFormFill next={nextStep} visible={step === 2} setInfo={setInfo}/>
                        }
                        <Review next={nextStep} visible={showForm ? step === 3 : step === 2} info={info} setInfo={setInfo} onSubmit={onSubmit}/>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CreateEvent;

