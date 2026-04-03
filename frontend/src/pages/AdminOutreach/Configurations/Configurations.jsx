import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './Configurations.scss';

function Configurations() {
    return (
        <div className='configurations'>
            <header className="configurations-header">
                <h2>Outreach configurations</h2>
                <p className="subtitle">Student attributes, data source, roles, and delivery settings.</p>
            </header>

            <div className="configurations-toolbar">

                <div className="configurations-list">
                        <div className="configurations-card">
                            <div className="configurations-header">
                                <p>Student attributes</p>
                                <p className="subtext">Attributes used for targeting. List updates when data source syncs.</p>
                                
                                <div className="configurations-card">
                                    <div className="configurations-att">
                                        <p>Attribute</p>
                                        <p>Source</p>
                                        <p>Editable</p>
                                    </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p className="btn">major</p>
                                        <p>━</p>
                                        <p>Major / Department</p>
                                    </div>
                                        <p>SIS</p>
                                        <p>No</p>
                                </div>


                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p className="btn">graduation_year</p>
                                        <p>━</p>
                                        <p>Graduation year</p>
                                    </div>
                                        <p>SIS</p>
                                        <p>No</p>
                                </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p className="btn">program_type</p>
                                        <p>━</p>
                                        <p>Program type</p>
                                    </div>
                                        <p>SIS</p>
                                        <p>No</p>
                                </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p className="btn">enrollment_status</p>
                                        <p>━</p>
                                        <p>Enrollment status</p>
                                    </div>
                                        <p>SIS</p>
                                        <p>No</p>
                                </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p className="btn">college</p>
                                        <p>━</p>
                                        <p>College</p>
                                    </div>
                                        <p>SIS</p>
                                        <p>No</p>
                                </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p className="btn">custom_cohort</p>
                                        <p>━</p>
                                        <p>Custom cohort</p>
                                    </div>
                                        <p>Manual</p>
                                        <p>Yes</p>
                                </div>

                            </div>
                        </div>
                        </div>
                </div>



                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Data Source</p>
                            <p className="subtext">Where student attributes are pulled from.</p>

                        </div>

                            <div className="configurations-body">

                                <div className="search-wrapper">
                                    <p className="subject">
                                        Primary source
                                    </p>
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Student Information System (SIS)"
                                        autoFocus
                                    />
                                    <div className="count">
                                        <p>Last sync: Mar 12, 2025 2:00 PM ─ 4,201 students </p>
                                    </div>

                                    
                                </div>
                            </div>
                                    
                           
                    </div>
                </div>


                <div className="configurations-list">
                        <div className="configurations-card">
                            <div className="configurations-header">
                                <p>Admin role & permissions</p>
                                <p className="subtext">Who can send outreach and who can change these settings.</p>
                                
                                <div className="configurations-card">
                                    <div className="configurations-att">
                                        <p>Role</p>
                                        <p>Can send</p>
                                        <p>Can configure</p>
                                    </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p>Admin</p>
                                    </div>
                                        <p>Yes</p>
                                        <p>Yes</p>
                                </div>


                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p>Outreach manager</p>
                                    </div>
                                        <p>Yes</p>
                                        <p>No</p>
                                </div>

                                <div className="configurations-content">
                                    <div className="configurations-content-body">
                                        <p>Viewer</p>
                                    </div>
                                        <p>No</p>
                                        <p>No</p>
                                </div>
                            

                            </div>
                        </div>
                        </div>
                </div>
                
                <div className="configurations-list">
                    <div className="configurations-card">
                        <div className="configurations-header">
                            <p>Delivery</p>
                            <p className="subtext">How outreach messages are delivered.</p>

                        </div>

                            <div className="configurations-body">

                                <div className="delivery-wrapper">
                                    <label className="container">
                                        <input type="checkbox" defaultChecked />
                                        <span className="checkmark" />
                                        Send via email
                                    </label>

                                    <label className="container">
                                        <input type="checkbox" defaultChecked />
                                        <span className="checkmark" />
                                        Send in-app notification  
                                    </label>

                                    <div className="count">
                                        <p>Defult from address and templates are set in system email config.</p>
                                    </div>

                                    
                                </div>
                            </div>         
                    </div>
                </div>

                <div className="send">
                    <button className="btn btn-send">Save configuration</button>
                    <button className="btn btn-draft">Discard changes</button>
                </div>

            </div>
        </div>
    );
}

export default Configurations;