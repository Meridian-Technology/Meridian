import React, { useEffect, useState, useRef } from 'react';
import './Dash.scss';
import { useGradient } from '../../../hooks/useGradient';
import Week from '../../../pages/OIEDash/EventsCalendar/Week/Week';
import useAuth from '../../../hooks/useAuth';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import { useFetch } from '../../../hooks/useFetch';
import OIEEvent from '../../OIEDash/OIEEventsComponents/Event/OIEEvent';
import OIEEventSkeleton from '../../OIEDash/OIEEventsComponents/Event/OIEEventSkeleton';
import PulseDot from '../../../components/Interface/PulseDot/PulseDot';
import DashStatus from '../../../components/Dashboard/DashStatus/DashStatus';
import EventQuickLook from './EventQuickLook/EventQuickLook';
import { useNavigate } from 'react-router-dom';


function Dash({ expandedClass, openMembers, clubName, meetings, org}) {
    //define welcometext to be either good morning, good afternoon, or good evening, in one line
    const welcomeText = `Good ${new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}`;
    const {AtlasMain} = useGradient();

    const [events, setEvents] = useState([]);
    const weeklyRef = useRef(null);
    const [height, setHeight] = useState(0);
    const { user } = useAuth();
    const [selectedTab, setSelectedTab] = useState("upcoming");
    const navigate = useNavigate();



    const filter = {
        "hostingId": { "$eq": org.org.overview._id }
    }


    console.log(filter);

    useEffect(() => {
        if (weeklyRef.current) {
            setTimeout(() => {
                const height = weeklyRef?.current?.clientHeight;
                setHeight(height);
                console.log(height);
            }, 100);
        }
    }, []);


    const handleEventClick = () => {
        console.log("create event");
        navigate("/create-event", { state: { origin: clubName } });
    }

    return (
        <div className={`dash ${expandedClass}`}>
            <header className="header">
                <h1>{welcomeText}, {clubName}</h1>
                <p>welcome back to your organization portal</p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="org-content">
                <div className="actions row">
                    <div className="action" onClick={handleEventClick}>
                        <iconify-icon icon="mingcute:add-circle-fill" />
                        <p>Plan an Event</p>
                    </div>
                    <div className="action" onClick={openMembers}>
                        <p>Manage Members</p>
                    </div>
                </div>
                <DashStatus 
                    orgId={org.org.overview._id} 
                    action={openMembers} 
                    actionText="view all" 
                    color="var(--green)" 
                />
                <EventQuickLook org={org} />
                {/* <div className="row stats">
                    <div className="column">

                    <div className="header">
                        <h3>Stats</h3>
                        <button>view all</button>
                    </div>
                    <div className="row stats-container">

                    <div className="stat">
                        <div className="count">
                            <h1>{org.exhaustive.eventCount}</h1>
                        </div>
                        <h4>Upcoming Events</h4>
                    </div>
                    <div className="stat">
                        <div className="count">
                            <h1>3</h1>
                        </div>
                        <h4>Pending Submissions</h4>
                    </div>
                    <div className="stat">
                        <div className="count">
                            <h1>10</h1>
                        </div>
                        <h4>This Week's Meetings</h4>
                    </div>
                    <div className="stat">
                        <div className="count">
                            <h1>100</h1>
                        </div>
                        <h4>Members</h4>
                    </div>
                    </div>

                    </div>

                </div> */}
                {/* <div className="row activity">
                    <div className="column activity">
                        <div className="header">
                            <h3>Recent Activity</h3>
                            <button>view all</button>
                        </div>
                        <div className="activity">
                            <Notification title="'Night Market' approved" description="Event 1 description" time={new Date()}/> 
                        </div>
                    </div>
                    <div className="column quick-actions">
                        <div className="header">
                            <h3>Quick Actions</h3>
                        </div>
                        <div className="quick-actions">
                            <CreateEventButton row={true} color="red"/>
                        </div>
                    </div>
                </div> */}
                <div className="week-container" ref={weeklyRef}>
                    {
                        height !== 0 &&
                        <Week height={`${height-50}px`} changeToDay={() => { }} start={new Date()} nav={false} filter={filter} showSwitch={false} startingText="This Week at a Glance"/>
                    }
                </div>

            </div>

        </div>




    )
}


export default Dash;