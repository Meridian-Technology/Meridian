import React, {useEffect} from 'react';
import './General.scss';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import SiteHealth from './SiteHealth/SiteHealth';
import Analytics from '../../../components/Analytics/Analytics';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';

function General({}){
    return(
        <div className="general">
            <img src={GradientHeader} alt="" className="grad" />
            <div className="simple-header">
                <h1>Administrator</h1>
            </div>
            <div className="general-content">
                <SiteHealth />
                <div style={{ marginTop: 16 }}>
                    <Analytics />
                </div>
            </div>
        </div>
    )
}

export default General;