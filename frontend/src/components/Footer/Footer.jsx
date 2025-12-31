import React from 'react';
import './Footer.scss';
import Github from '../../assets/Icons/Cute-Github.svg';


function Footer(){
    return(
        <div className="mini-footer">
            <p>© {new Date().getFullYear()} Study Compass Inc.</p> 
            <p>|</p>
            <p>AGPL-3.0 license</p>
            <p>|</p>
            <p className="githubText">Github</p>
            <a href="https://github.com/Study-Compass/Study-Compass" className="github" ><img src={Github} alt="" className="github" /></a>
        </div>

    );
}

export default Footer;