import React, { useEffect, useState } from 'react';
import './Error.scss';
import '../../assets/fonts.css'
import { useNavigate, useParams } from 'react-router-dom';

import Header from '../../components/Header/Header';
import Loader from '../../components/Loader/Loader';

import Info from '../../assets/Icons/Info.svg';

function Error() {
    const { errorCode } = useParams();
    const navigate = useNavigate();

    const [errorMessage, setErrorMessage] = useState("");
    const [showMessage, setShowMessage] = useState(false);
    
    useEffect(() => {
        if(!errorCode){
            // navigate("/error/404");
        }
        const message = localStorage.getItem("error");
        if (message) {
            localStorage.removeItem("error");
            setErrorMessage(message);
            console.log(message);
        }
    }, []);

    return (
        <div className="errorPage">
            <Header />
            <div className="content">
                <Loader />
                <div className="message">
                    <h1 className='whoops'>Whoops! </h1>
                    <h1>{parseInt(errorCode) === 404 ? "There's Nothing Here" : "Something Went Wrong"}</h1>
                </div>
                {parseInt(errorCode) === 404 ? 
                    <div className='details'>
                        <p>This page is not available! We suggest you go home</p>
                    </div>
                    :
                    <div className='details'>
                        <p>Something on our end didn't work as expected.</p>
                        <p>If this issue persists, <a href="">contact support</a></p>
                    </div>
                }
                <div className="error-message">
                    <p>Error {errorCode}</p>
                    <img src={Info} alt="Info" onClick={()=>{setShowMessage(!showMessage)}}/>
                    {/* <p>{errorMessage}</p> */}

                </div>
                {showMessage && 
                    <div className="error-popup">
                        <p>{errorMessage}</p>
                    </div>
            

                }
                <div className="button-container">
                    <button className="button active lightred" onClick={() => navigate("/")}>Go Home</button>
                </div>

            </div>
        </div>
    );
}

export default Error;