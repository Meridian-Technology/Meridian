import React, { useState } from 'react';
import './RSSFeed.scss';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../components/Popup/Popup';
import RSSSync from '../RSSSync/RSSSync';

function RSSFeed({rssfeed}) {
    const [isSyncing, setIsSyncing] = useState(false);
    
    return (
        <>  
            <div className='rss-feed'>
                <div className="header-left">
                    <h2>{rssfeed.name}</h2>
                    <p>{rssfeed.lastSynced ? `last synced: ${new Date(rssfeed.lastSynced).toLocaleString()}` : 'Never synced'}</p>
                </div>
                <div className="header-right">
                    <button onClick={() => setIsSyncing(true)}>
                        <Icon icon="iconamoon:synchronize-bold" />
                        <p>sync</p>
                    </button>
                </div>
            </div>
            <Popup isOpen={isSyncing} onClose={() => setIsSyncing(false)} customClassName='wide-content' defaultStyling={false}>
                {
                    isSyncing && <RSSSync rssfeed={rssfeed} />
                }
            </Popup>
        </>
    );
}

export default RSSFeed;