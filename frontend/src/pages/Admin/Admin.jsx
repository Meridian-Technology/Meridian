import React, { useEffect, useState } from 'react';
import Header from '../../components/Header/Header';
import useAuth from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import BlueGrad1 from '../../assets/BlueGrad1.png';
import BlueGrad2 from '../../assets/BlueGrad2.png';

import Dashboard from '../../components/Dashboard/Dashboard';
import General from './General/General'
import BadgeManager from './BadgeManager/BadgeManager';
import ManageUsers from './ManageUsers/ManageUsers';
import QRManager from './QRManager/QRManager';
import EventsAnalytics from '../../components/EventsAnalytics/EventsAnalytics';

import AdminLogo from '../../assets/Brand Image/ADMIN.svg';


import './Admin.scss';

function Admin(){
    const { user } = useAuth();
    const navigate = useNavigate();

    const [showPage, setShowPage] = useState("analytics");

    const toggleAnalytics = (page) => {
        if(showPage === page){
            setShowPage("");
            return;
        }
        setShowPage(page);
    }

    if(!user){
        return(
            <div className="admin">
                <Header />
            </div>
        );
    }

    const menuItems = [
        { 
            label: 'General', 
            icon: 'ic:round-dashboard',
            element: <General/>
        },
        { 
            label: 'Analytics', 
            icon: 'bx:stats',
            subItems: [
                {
                    label: 'Events Analytics',
                    icon: 'material-symbols:event',
                    element: <EventsAnalytics/>
                },
                {
                    label: 'QR Codes',
                    icon: 'mingcute:qrcode-fill',
                    element: <QRManager/>
                }
            ]
        },
        { 
            label: 'Manage Users', 
            icon: 'ic:round-dashboard',
            element: <ManageUsers/>
        },
        { 
            label: 'Badge Grants', 
            icon: 'bx:stats',
            element: <BadgeManager/>
        }
    ]

    return(
        <Dashboard 
            menuItems={menuItems} 
            additionalClass='admin' 
            logo={AdminLogo} 
            onBack={()=>navigate('/events-dashboard')}
            enableSubSidebar={true}
        >
        </Dashboard>
    );
}

export default Admin