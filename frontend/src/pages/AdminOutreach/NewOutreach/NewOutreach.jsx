import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './NewOutreach.scss';

function NewOutreach() {
    return (
        <div className='new-outreach'>
               <header className="new-outreach-header">
                <h2>New outreach</h2>
                <p className="subtitle">Target student by attributes. Recipients update as data changes.</p>
            </header>

            <div className="new-outreach-toolbar">

                <div className="new-outreach-list">
                        <div className="new-outreach-card">
                            <div className="new-outreach-header">
                                <p>Who recives this message?</p>
                                <p className="subtext">Targeting updates automatically as student attributes changes.</p>
                            </div>

                            <div className="new-outreach-body">

                                <div className="search-wrapper">
                                    <p className="subject">
                                        Major / Department
                                    </p>
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Any"
                                        autoFocus
                                    />

                                    <p className="subject">
                                        Graduation year
                                    </p>
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Any"
                                        autoFocus
                                    />


                                    <p className="subject">
                                        Program type
                                    </p>
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Any"
                                        autoFocus
                                    />


                                    <p className="subject">
                                        Enrollment status
                                    </p>
                                    <input
                                        type="text"
                                        className="search-input"
                                        placeholder="Any"
                                        autoFocus
                                    />

                                    <div className="count">
                                        <p className="Estimated">Estimated recipients:  </p>
                                        <p className="live-count"> 342 students (live count)</p>

                                    </div>

                          




                                </div>

                            </div>



                        </div>
                </div>



                <div className="new-outreach-list">
                    <div className="new-outreach-card">
                        <div className="new-outreach-header">
                            <p>Recent campaign</p>
                            <p>3 campaigns</p>
                           </div>
                    </div>
                </div>
                


            </div>


        </div>
    );
}

export default NewOutreach;