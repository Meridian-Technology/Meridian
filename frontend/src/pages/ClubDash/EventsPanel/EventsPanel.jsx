import EventsManager from '../../../components/EventsManager/EventsManager';
import { useState } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import './EventsPanel.scss';
import { useGradient } from '../../../hooks/useGradient';

function EventsPanel({orgId}){

    const {AtlasMain} = useGradient();
    const [fetchType, setFetchType] = useState('future');
    const [sort, setSort] = useState('desc');
    const myEvents = useFetch(`/get-my-events?orgId=${orgId}&type=${fetchType}&sort=${sort}`);

    const selectorItems = [
        {
            label: 'Upcoming',
            value: 'future'
        },
        {
            label: 'Past',
            value: 'past'
        },
        {
            label: 'Archived',
            value: 'archived'
        }
    ]

    const handleFetchTypeChange = (value) => {
        setFetchType(value);
        setSort('desc');
    }

    return( 
        <div className="events-panel dash">
            <header className="header">
                <h1>Events</h1>
                <p>manage your events</p>
                <img src={AtlasMain} alt="" />
            </header>
                <EventsManager events={myEvents.data?.events} refetch={myEvents.refetch} selectorItems={selectorItems} handleTabChange={handleFetchTypeChange} fetchType={fetchType} />
        </div>
    )
}

export default EventsPanel;