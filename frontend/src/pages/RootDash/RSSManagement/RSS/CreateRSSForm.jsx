import React, { useState } from 'react';
import './CreateRSSForm.scss';
import postRequest from '../../../../utils/postRequest';

function CreateRSSForm({ handleClose }) {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await postRequest('/create-rss-feed', { name, url });
            handleClose();
        } catch (error) {
            console.error('Error creating RSS feed:', error);
        }
    };

    return (
        <div className="create-rss-form">
            <h2>Create New RSS Feed</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="name">Name:</label>
                    <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="url">URL:</label>
                    <input
                        type="url"
                        id="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                    />
                </div>
                <div className="form-actions">
                    <button type="button" onClick={handleClose}>Cancel</button>
                    <button type="submit">Create</button>
                </div>
            </form>
        </div>
    );
}

export default CreateRSSForm; 