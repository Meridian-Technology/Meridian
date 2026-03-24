import React, { useEffect, useState } from 'react';
import Header from '../../components/Header/Header';
import useAuth from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

import Dashboard from '../../components/Dashboard/Dashboard';
import AdminLogo from '../../assets/Brand Image/ADMIN.svg';
import Campaigns from './Campaigns/Campaigns';
import NewOutreach from './NewOutreach/NewOutreach';
import Configurations from './Configurations/Configurations';


import './AdminOutreach.scss';

function AdminOutreach(){
    const { user } = useAuth();
    const navigate = useNavigate();



    if(!user){
        return(
            <div className="admin">
                <Header />
            </div>
        );
    }

    const menuItems = [
        { 
            label: 'Campaigns', 
            icon: 'mdi:email-multiple',
            element: <Campaigns/>
        },
        { 
            label: 'New Outreach', 
            icon: 'mdi:send',
            element: <NewOutreach/>
        },
        { 
            label: 'Configurations', 
            icon: 'mdi:cog',
            element: <Configurations/>
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

export default AdminOutreach;