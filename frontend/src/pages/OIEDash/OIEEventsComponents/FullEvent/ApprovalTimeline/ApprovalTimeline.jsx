import React, { use, useEffect, useRef, useState } from "react";
import "./ApprovalTimeline.scss";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import useAuth from "../../../../../hooks/useAuth";
import HeaderContainer from '../../../../../components/HeaderContainer/HeaderContainer';
import postRequest from "../../../../../utils/postRequest";

const statusIcons = {
    active: "rivet-icons:circle-solid",
    completed: "stash:check-solid",
    // upcoming: "rivet-icons:circle-solid",

};

const gradient_colors = {

}

const EventTimeline = ({ event, showApproval=false, viewingRole }) => {
    const { approvalReference } = event || {};
    const [currentStepIndex, setCurrentStepIndex] = useState(approvalReference?.currentStepIndex ?? 2);
    const approvals = approvalReference?.approvals || [];
    const [decision, setDecision] = useState(0); //0 is none, 1 is approved, 2 is rejected

    const {user} = useAuth();

    const dateOptions = { year: "numeric", month: "short", day: "numeric" };
    const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };

    const [stepHeights, setStepHeights] = useState([]);

    // Refs for each timeline step
    const timelineRefs = useRef([]);

    console.log(event);

    // Build timeline steps
    const [timelineSteps, setSteps] = useState([
        {
            title: "Event Created",
            date: new Date(event?.createdAt || Date.now()),
            subText: `created by ${event.hostingType === 'Org' ? event.hostingId?.org_name : event.hostingId?.name || "someone"}`,
            status: "completed",
            approval:false
        },
        ...approvals.map((appr) => ({
            title: `${appr.role} Approval`,
            date: appr.approvedAt ? new Date(appr.approvedAt) : null,
            subText:
                appr.status === "approved"
                    ? `Approved by user #${appr.approvedByUserId}`
                    : appr.status === "rejected"
                        ? "Rejected"
                        : "Waiting for approval",
            status: appr.status,
            approval:true,
            role: appr.role
        })),
        {
            title: "Proposed Event Date",
            date: new Date(event?.start_time || Date.now()),
            subText: "",
            status: "upcoming",
            approval:false
        },
    ]);


    console.log(event);

    useEffect(() => {
        timelineRefs.current = timelineSteps.map((_, i) => timelineRefs.current[i] || React.createRef());
    }, [timelineSteps.length]);

    //reset refs on change
    useEffect(() => {
        let attempt = 0;
        const maxAttempts = 10;
        const interval = 50; // ms
      
        const checkRefsReady = () => {
          const allReady = timelineRefs.current.every(ref => ref?.current);
          if (!allReady && attempt < maxAttempts) {
            attempt++;
            setTimeout(checkRefsReady, interval);
            return;
          }
      
          const heights = timelineRefs.current.map((ref, i) => {
            const h = ref?.current?.clientHeight || 0;
            console.log(`Step ${i} height:`, h);
            return h;
          });
      
          setStepHeights(heights);
        };
      
        checkRefsReady();
      }, [timelineSteps.length, currentStepIndex]);

    async function onApprove() {
        setSteps(prev => {
            const newSteps = [...prev];
            newSteps[currentStepIndex + 1].subText = `Approved by ${user.name}`;
            newSteps[currentStepIndex+ 1].date = new Date();
            return newSteps;  
        })
        setCurrentStepIndex(currentStepIndex + 1);
        setDecision(1);
        const response = await postRequest('/approve-event', {event_id : event._id});
        if(response.error){
            console.log(response.error);
        } else {
            console.log('succcessful', response);
        }
    }

    return (
        <>
            <div className="timeline">
                <div className="header">
                    <Icon icon="mdi:tag-approve" />
                    <h2>timeline</h2>
                </div>
                <div className="timeline-container">
                    {timelineSteps.map((step, index) => {
                        let stepClass = "";
                        if (index < currentStepIndex + 1) stepClass = "completed";
                        else if (index === currentStepIndex + 1) stepClass = "active";
                        else stepClass = "upcoming";

                        return (
                            <div
                                className="timeline-step"
                                key={index}
                                ref={timelineRefs.current[index]}
                            >
                                <div className="step-date">
                                    <h3>{step.date?.toLocaleDateString('en-GB', dateOptions)}</h3>
                                    <p>{step.date?.toLocaleTimeString('en-US', timeOptions)}</p>
                                </div>

                                <div className="timeline-marker">
                                    <div className={`marker-container ${stepClass}`}>
                                        <Icon icon={statusIcons[stepClass]} class={stepClass} />
                                        <div className={`marker-circle ${stepClass}`} />
                                    </div>
                                    {index < timelineSteps.length - 1 && stepHeights[index] > 0 && (
                                        <div
                                            className={`marker-line ${index === currentStepIndex ? "active" : index < currentStepIndex ? "completed" : ""}`}
                                            style={{ height: `${stepHeights[index]}px` }}
                                        />
                                    )}
                                </div>

                                <div className="timeline-content">
                                    <div className="content-title"><h3>{step.title}</h3></div>
                                    {step.subText && (
                                        <div className="content-subtext">{step.subText}</div>
                                    )}
                                    {/* {
                                        index === currentStepIndex+1 && timelineSteps[currentStepIndex+1].approval && (
                                            <div className="content-actions">
                                                <button className="approve" onClick={onApprove}>Approve</button>
                                                <button className="reject">Reject</button>
                                            </div>
                                        )
                                    } */}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {
                showApproval && user.approvalRoles.includes(event.approvalReference.approvals[event.approvalReference.currentStepIndex].role) && viewingRole === event.approvalReference.approvals[event.approvalReference.currentStepIndex].role &&
                <HeaderContainer header="approve this event" subheader='this event requires your approval' classN="approve-container">
                    <div className="timeline-approval">
                        <button className={`button active approve`} onClick={onApprove}>approve</button>
                        <button className={`button active reject `}>reject</button>
                    </div>
                </HeaderContainer>
            }
        </>
    );
};

export default EventTimeline;