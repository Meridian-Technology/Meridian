import './EventsManager.scss';
import OIEEvent from '../../pages/OIEDash/OIEEventsComponents/Event/OIEEvent';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function EventsManager({events, refetch, selectorItems, handleTabChange, fetchType}){

    return(

            <div className="item-container">
                <div className="item-header">
                    <div className="header-row">
                        <div>
                            <Icon icon="mingcute:calendar-fill" />
                            <h2>
                                events
                            </h2>
                        </div>
                    </div>
                    <div className="selector-row">
                        { 
                            selectorItems.map((item)=>(
                                <div className={`selector-item ${item.value === fetchType ? 'selected' : ''}`} key={item.value} onClick={()=>handleTabChange(item.value)}>
                                    <h3>
                                        {item.label}
                                    </h3>
                                </div>
                            ))
                        }
                        
                    </div>
                </div>
                <div className="items-container">
                    <div className="items item-grid">
                        {events && events.map((event)=>(
                            <OIEEvent key={event._id} event={event} showOIE={event.approvalReference} manage={true} refetch={refetch} />
                        ))}
                    </div>
                </div>
            </div>
    )
}

export default EventsManager;