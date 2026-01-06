import React from 'react';
import OrgMessageFeed from '../../../components/OrgMessages/OrgMessageFeed';
import {useGradient} from '../../../hooks/useGradient';

const ClubAnnouncements = ({ orgData, expandedClass }) => {

    const { AtlasMain } = useGradient();

    return (
        <div className={`announcements dash ${expandedClass}`}>
            <header className="header">
                <h1>Announcements</h1>
                <p>Post messages and announcements for your organization</p>
                    <img src={AtlasMain} alt="" />
            </header>
            <div className="org-content">
                <OrgMessageFeed 
                    orgId={orgData.data?.org?.overview?._id} 
                    orgData={orgData.data}
                />
            </div>
        </div>
    );
};

export default ClubAnnouncements;