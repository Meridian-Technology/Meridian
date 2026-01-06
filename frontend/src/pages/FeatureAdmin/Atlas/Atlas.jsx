import React from 'react';
import './Atlas.scss';
import Dashboard from '../../../components/Dashboard/Dashboard';
import Home from './Home/Home';
import AtlasLogo from '../../../assets/Brand Image/SolutionLogos/Atlas.svg';
import { useNavigate } from 'react-router-dom';

const Atlas = () => {
    const navigate = useNavigate();
    const menuItems = [
        {
            label: 'Home',
            icon: 'material-symbols:home-outline',
            element: <Home />
        }
    ];
    return (
        <Dashboard menuItems={menuItems} additionalClass='root-dash' logo={AtlasLogo} onBack={()=>navigate('/root-dashboard')}></Dashboard>
    );
};

export default Atlas;