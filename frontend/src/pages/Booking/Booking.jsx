import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Booking.scss';
import Header from '../../components/Header/Header';

function Booking() {
    const navigate = useNavigate();

    return (
        <div className="main-booking">
            <Header />
            <div className="booking-container">
                <div className="booking-content">
                    <h1>Schedule Your Demo</h1>
                    <p className="booking-subtitle">
                        Select a time that works best for you. We'll send you a confirmation email shortly.
                    </p>
                    
                    <div className="calendar-embed">
                        <iframe 
                            src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ3nUg9AkIrT5Ee22m3DyZHEIgkfq6ixmo3rSt6uo0S8BC3hPoZ39wHgQmuzO0uNz93O0fhFqdNV?gv=true" 
                            style={{ border: 0, display: 'block' }} 
                            width="100%" 
                            height="600" 
                            frameBorder="0"
                            scrolling="yes"
                            title="Schedule Appointment"
                        />
                    </div>
                    
             
                </div>
            </div>
        </div>
    );
}

export default Booking;

