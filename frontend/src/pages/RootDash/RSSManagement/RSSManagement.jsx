import React, { useState } from 'react';
import './RSSManagement.scss';
import {useFetch} from '../../../hooks/useFetch';
import RSSFeed from './RSS/RSSFeed';
import CreateRSSForm from './RSS/CreateRSSForm';
import Popup from '../../../components/Popup/Popup';

function RSSManagement() {
    const {data: rssfeeds, loading, error} = useFetch('/get-rss-feeds');
    const [isCreatePopupOpen, setIsCreatePopupOpen] = useState(false);
    if(!rssfeeds) return null;

    return (
        <>
        <div className='rss-management'>   
            <h1>RSS Management</h1>
            <div className='rss-feeds'>
                {rssfeeds.data.map((rssfeed) => (
                    <RSSFeed key={rssfeed._id} rssfeed={rssfeed} />
                ))}
            </div>
            <button onClick={() => setIsCreatePopupOpen(true)}>Create New RSS</button>
        </div>
        <Popup isOpen={isCreatePopupOpen} onClose={() => setIsCreatePopupOpen(false)}>
            <CreateRSSForm handleClose={() => setIsCreatePopupOpen(false)} />
        </Popup>
        </>
    );
}

export default RSSManagement;