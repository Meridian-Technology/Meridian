import HeaderContainer from "../../../../components/HeaderContainer/HeaderContainer";
import OIEEvent from "../../../OIEDash/OIEEventsComponents/Event/OIEEvent";
import PulseDot from "../../../../components/Interface/PulseDot/PulseDot";
import OIEEventSkeleton from "../../../OIEDash/OIEEventsComponents/Event/OIEEventSkeleton";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFetch } from "../../../../hooks/useFetch";
import { useDashboardOverlay } from "../../../../hooks/useDashboardOverlay";
import './EventQuickLook.scss';

function timeUntil(date) {
    const now = new Date();
    const diffMs = date - now;
  
    if (diffMs <= 0) {
      return "now";
    }
  
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
    if (diffMinutes < 60) {
      return `${diffMinutes} min${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      return `${diffHours} hr${diffHours !== 1 ? 's' : ''}`;
    } else {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }
  }
  

const EventQuickLook = ({ org, canManageEvents = false }) => {
    const [selectedTab, setSelectedTab] = useState("upcoming");
    const navigate = useNavigate();
    const { showEventDashboard } = useDashboardOverlay();
    const orgId = org?.org?.overview?._id;
    const upcomingEvents = useFetch(`/get-my-events?orgId=${orgId}&type=${selectedTab === "upcoming" ? "future" : "pending"}&sort=asc&limit=5`);

    const handleOpenEventDashboard = (event) => {
        if (canManageEvents && orgId) {
            showEventDashboard(event, orgId, { persistInUrl: true });
        } else {
            navigate(`/event/${event._id}`);
        }
    };


    return(
        <HeaderContainer icon="mingcute:calendar-fill" classN="event-quick-look" header="Quick Look" scroll={true} subheaderRow={
            <div className="row subheader">
                <div className={`column ${selectedTab === "upcoming" ? "selected" : ""}`}>
                    <p onClick={() => setSelectedTab("upcoming")}>Upcoming Events</p>
                </div>
                <div className={`column ${selectedTab === "pending" ? "selected" : ""}`}>
                    <p onClick={() => setSelectedTab("pending")}>Pending Submissions</p>
                </div>
            </div>}>
            <div className="row events-container">
                {
                    upcomingEvents.data && upcomingEvents.data.events.map((event) => (
                        <OIEEvent
                            key={event._id}
                            event={event}
                            showOIE={event.approvalReference}
                            manage={false}
                            refetch={upcomingEvents.refetch}
                            showHosting={true}
                            showHostingType={false}
                            onOpenDashboard={handleOpenEventDashboard}
                            extraInfo={
                            <div className="row live-event-info">
                                <div>
                                    <PulseDot color="var(--green)" size="8px" pulse={true} />
                                    <p className="live-event-info-text">Stats</p>
                                </div>
                                <div>
                                    <p className="time-until">In {timeUntil(new Date(event.start_time))}</p>
                                    <p className="rsvps">0 rsvps</p>
                                </div>
                            </div>
                        }/>
                    ))
                }
                { 
                    (upcomingEvents.loading || !upcomingEvents.data || upcomingEvents.data.events.length === 0) &&
                    <OIEEventSkeleton 
                        howHosting={true} 
                        extraInfo={
                            <div className="row live-event-info">
                                <div>
                                    <PulseDot color="var(--green)" size="8px" pulse={true} />
                                    <p className="live-event-info-text">Stats</p>
                                </div>
                            </div>
                        } 
                        loading={upcomingEvents.loading}
                    />
                }
            </div>
        </HeaderContainer>
    )
}

export default EventQuickLook;


