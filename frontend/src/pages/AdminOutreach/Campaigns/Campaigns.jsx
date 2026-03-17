import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './Campaigns.scss';

function Campaigns() {
    return (
        <div className='campaigns'>
           
            <header className="campaigns-header">
                <h2>Campaigns</h2>
                <p className="subtitle">View and manage past outreach</p>
            </header>

            <div className="campaigns-toolbar"> 
                <div className="search-wrapper">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search by campaign..."
                        autoFocus
                    />

                    <button className="btn btn-primary">New Outreach</button>
                </div>


                <div className="campaigns-list">
                    <div className="campaign-card">

                        <div className="campaign-header">
                            <p>Recent campaign</p>
                            <p>3 campaigns</p>
                        </div>

                        

                        <div className="campaign-content">
                            <div className="campaign-content-body">
                                <p>CS Class of 2027 - Intership Fair</p>
                                <div className="campaign-content-stats">
                                    <p>Mar 10, 2025</p>
                                    <p>•</p>
                                    <p>342 recipients</p>
                                </div>
                            </div>

                            <div className="campaign-contenats-right">
                                <button className="btn btn-primary">Sent</button>
                                <p>View</p>
                            </div>
                        </div>

                        <div className="campaign-content">
                            <div className="campaign-content-body">
                                <p>Graduate Students - Thesis Deadlines</p>
                                <div className="campaign-content-stats">
                                    <p>Mar 8, 2025</p>
                                    <p>•</p>
                                    <p>89 recipients</p>
                                </div>
                            </div>

                            <div className="campaign-contenats-right">
                                <button className="btn btn-primary">Sent</button>
                                <p>View</p>
                            </div>
                        </div>

                         <div className="campaign-content">
                            <div className="campaign-content-body">
                                <p>Undergrad Active - Spring Events</p>
                                <div className="campaign-content-stats">
                                    <p>Mar 5, 2025</p>
                                    <p>•</p>
                                    <p>1204 recipients</p>
                                </div>
                            </div>

                            <div className="campaign-contenats-right">
                                <button className="btn btn-primary">Sent</button>
                                <p>View</p>
                            </div>
                        </div>

                        

                       
                    </div>
                </div>

                
            </div>
        </div>
    );
}

export default Campaigns;   