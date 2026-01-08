import React, { useEffect, useState } from 'react';
import './Orgs.scss'
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import OrgResult from './OrgResult/OrgResult';
import AtlasGradient from '../../../assets/Gradients/ATLAS/Main1.png';

const Orgs = ({}) => {
    const orgs = useFetch('/get-orgs');
    useEffect(()=>{
        console.log(orgs.data);
    },[orgs.data])
    return(
        <div className="orgs dash">
            <header className="header">
                <img src={AtlasGradient} alt="" />
                <h1>Organizations</h1>
                <p>Explore organizations at RPI</p>
            </header>
            <div className="org-container">
                {
                    orgs.data?.orgs.map(org=><OrgResult key={org.org_name} org={org}/>)
                }
            </div>
        </div>
    )
}

export default Orgs;
