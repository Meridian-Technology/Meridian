import React, { useState, useMemo, useEffect } from 'react';
import './RSSSync.scss';
import { useFetch } from '../../../../hooks/useFetch';
import Event from '../../../../components/EventsViewer/EventsGrid/EventsColumn/Event/Event';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import XmlViewer from '../../../../components/XmlViewer/XmlViewer';

const checkList = [
    ["fetching xml content", "xml content fetched"],
    ["transforming xml content", "xml content transformed"],
    ["updating events", "events updated"],
]

function RSSSync({rssfeed}) {
    const [checklist, setChecklist] = useState([false,false,false]);
    const [activeView, setActiveView] = useState('events'); // 'events', 'xml', or 'json'
    const options = useMemo(() => ({
        method: 'POST',
        data: {
            rssId: rssfeed._id
        }
    }), [rssfeed._id]);

    const {data, loading, error} = useFetch('/sync-rss', options);
    
    useEffect(()=>{
        if(!loading){
            setChecklist([true,true,true]);
        }
    }, [loading]);

    useEffect(() => {
        setTimeout(() => {
            if(loading){
                console.log("loading");
                setChecklist([true,false,false]);
            }
        }, 700);
        setTimeout(() => {
            if(!checklist[2]){
                setChecklist([true,true,true]);
            } else if(loading){
                console.log("loading");
                setChecklist([true,true,false]);
            }
        }, 1300);

    }, []);

    return (
        <div className='rss-sync'>
            <div className="rss-left">
                <h2>{rssfeed.name}</h2>
                <div className="checklist">
                    {
                        checklist.map((item, index) => (
                            <div className={`checklist-item ${item ? "done" : ""}`} key={index}>
                                <Icon icon={item ? "line-md:circle-to-confirm-circle-twotone-transition" : "line-md:loading-twotone-loop"} />
                                <p>{checkList[index][item ? 1 : 0]}</p>
                            </div>
                        ))
                    }
                </div>
                {
                    !loading && data && (
                        <HeaderContainer header="results" > 
                        <div className="results">
                    <div className="result-item">
                        <p>{data.eventsCreated}</p>
                        <p>events created</p>
                    </div>
                    <div className="result-item">
                        <p>{data.eventsUpdated}</p>
                        <p>events updated</p>
                        </div>
                    </div>
                    </HeaderContainer>
                )}
            </div>
            <div className="rss-right">
                <div className="rss-header">
                    <div 
                        className={`option ${activeView === 'events' ? 'active' : ''}`}
                        onClick={() => setActiveView('events')}
                    >
                        <Icon icon="ic:round-event-note" />
                        <p>events viewer</p>
                    </div>
                    <div 
                        className={`option ${activeView === 'xml' ? 'active' : ''}`}
                        onClick={() => setActiveView('xml')}
                    >
                        <Icon icon="fluent:code-block-16-filled"/>
                        <p>xml</p>
                    </div>
                    <div 
                        className={`option ${activeView === 'json' ? 'active' : ''}`}
                        onClick={() => setActiveView('json')}
                    >
                        <Icon icon="mdi:code-json"/>
                        <p>json</p>
                    </div>
                </div>
                <div className="workspace">
                    {
                        !loading && data && (
                            activeView === 'events' ? (
                                data.events.map((event) => (
                                    <Event event={event} key={event._id} />
                                ))
                            ) : activeView === 'xml' ? (
                                <XmlViewer xml={data.xml} />
                            ) : (
                                <XmlViewer xml={JSON.stringify(data.events, null, 2)} />
                            )
                        )
                    }
                </div>
            </div>
        </div>
    );
}

export default RSSSync;