import React, { useEffect, useState, useRef } from 'react';
import './Configuration.scss';
import { Icon } from '@iconify-icon/react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../../NotificationContext';
import { useAuth } from '../../../AuthContext';

import { useFetch } from '../../../hooks/useFetch';

import Loader from '../../../components/Loader/Loader';
import axios from 'axios';

function CheckItem({ item, index, handleCheck, editOnLoad=false, editing, setEditing }) {
    const {addNotification} = useNotification();
    const [edit, setEdit] = useState(false);
    const [title, setTitle] = useState(item.title);
    const [description, setDescription] = useState(item.description);

    const editRef = useRef();

    const toggleEdit = (del = false) => {
        if(editing && !edit){
            addNotification({title: "Error", message: "Finish editing current item first", type: "error"});
            return;
        }
        if(edit) {
            if(!title && !del){
                addNotification({title: "Error", message: "Title cannot be empty", type: "error"});
                return;
            }
            handleCheck((prev) => {
                const checkList = prev.config.checklist;
                const newChecklist = [...checkList];
                newChecklist[index] = { title, description };
                return {config: {checklist:newChecklist}};
            });
            setEditing(false);
        } else {
            setTimeout(() => {
                if(editRef.current){
                    editRef.current.focus();
                }
            }, 100);
            setEditing(true);
        }
        setEdit(!edit);
    }

    const cancelEdit = () => {
        setTitle(item.title);
        setDescription(item.description);
        setEdit(false);
        setEditing(false);
    }

    const deleteItem = () => {
        toggleEdit(true);
        handleCheck((prev) => {
            const checkList = prev.config.checklist;
            const newChecklist = [...checkList];
            newChecklist.splice(index, 1);
            return {config: {checklist:newChecklist}};
        });
    }

    useEffect(() => {
        if(item.title === ""){
            toggleEdit();
        }
    }, []);

    const onSubmit = (e) => {
        e.preventDefault();

    }

    return (
        <div className={`check-item ${edit && "edit"}`} style={{ animationDelay: editOnLoad ? "0s" : `${index * 0.1}s` }}>
            <div className="row">
                <div className="col">
                    <form onSubmit={onSubmit}>
                        { edit ? 
                            (
                                <input type="text" placeholder="checklist title" value={title} onChange={(e) => setTitle(e.target.value)} ref={editRef} />
                            ) : 
                            <h2>{item.title}</h2> 
                        }
                        {       
                            edit ? 
                            (
                                <input type="text" placeholder="checklist description"value={description} onChange={(e) => setDescription(e.target.value)} />
                            ) : 
                            item.description && 
                            <p>{item.description}</p>
                        }
                        {edit && <button type='submit' onClick={toggleEdit}>save</button>}
                    </form>
                </div>
                <div className="edit-container">
                    <button className={`${edit && "edit"}`}onClick={edit ? cancelEdit : toggleEdit}><Icon icon={edit ? "mingcute:close-circle-fill":"fluent:edit-48-filled"} /></button>
                    {edit && <button className="trash" onClick={deleteItem}><Icon icon="iconamoon:trash-fill" /></button> }
                </div>
                
            </div>
        </div>
    );
}

function Configuration() {
    const { data, loading, error } = useFetch('/config');
    const { addNotification } = useNotification();

    const [clientData, setClientData] = useState(null);
    const [editing, setEditing] = useState(false);

    let editOnLoad = true;
    const navigate = useNavigate();

    useEffect(() => {
        if (error) {
            addNotification({ title: 'Error', message: error, type: 'error' });
        }
    }
        , [error, addNotification]);

    useEffect(() => {
        if (data) {
            setClientData(data);
        }
    }, [data]);

    const handleSave = async () => {
        try {
            console.log(clientData);
            await axios.post('/config', clientData, {headers: {"Authorization": `Bearer ${localStorage.getItem("token")}`}});
            addNotification({ title: 'Success', message: 'Configuration saved', type: 'success' });
        } catch (error) {
            addNotification({ title: 'Error', message: error.message, type: 'error' });
            navigate('/');
        }
    }       
    
    const onAdd = () => {
        if(editing){
            addNotification({title: "Error", message: "Finish editing current item first", type: "error"});
            return;
        }
        setClientData((prev) => {
            const checkList = prev.config.checklist;
            const newChecklist = [...checkList];
            newChecklist.push({ title: '', description: '' });
            return {config: {checklist:newChecklist}};
        });
    }

    if (error) {
        return (
            <div className="configuration">
                <h1>Configuration</h1>
                <div className="content">
                    <p>{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="configuration">
            <h1>Configuration</h1>
            <div className="content">
                <div className="col-header">
                    <h2>Checklist Items</h2>
                    <div onClick={onAdd}>
                        <Icon icon="icon-park-solid:add-one" />
                    </div>
                </div>
                <div className="check-items">
                    {
                        !loading && clientData && clientData.config.checklist.map((config, index) => {
                            return (
                                <CheckItem key={index} item={config} index={index} handleCheck={setClientData} editOnLoad={editOnLoad} editing={editing} setEditing={setEditing}/>
                            );
                        })
                    }
                    {
                        loading && <Loader />
                    }
                </div>
            </div>
            <button onClick={handleSave}>save</button>
        </div>
    );
}

export default Configuration;