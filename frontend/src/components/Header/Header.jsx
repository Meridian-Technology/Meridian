import React,{ useEffect, useState } from 'react'
import { useNavigate,useLocation, Link } from 'react-router-dom';
import logo from '../../assets/Brand Image/BEACON.svg';
import './Header.scss';
import ProfilePicture from '../ProfilePicture/ProfilePicture';
import useAuth from '../../hooks/useAuth';
import MobileLogo from '../../assets/Brand Image/BEACON.svg';
import { useWebSocket } from '../../WebSocketContext';
import RpiLogo from '../../assets/Brand Image/RpiLogo.svg';
import BerkeleyLogo from '../../assets/Brand Image/BerkeleyLogo.svg';
import NotificationInbox from '../NotificationInbox/NotificationInbox';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function getLogo() {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');

    if (parts.length > 2) {
        let subdomain = parts[0];
        if (subdomain.toLowerCase() === 'www') {
            subdomain = parts[1]; 
        }
        if (subdomain.toLowerCase() === 'rpi') {
            return RpiLogo;
        } else if (subdomain.toLowerCase() === 'berkeley') {
            return BerkeleyLogo;
        }
    }
    return logo; 
}


const Header = React.memo(()=>{
    const { isAuthenticating, isAuthenticated, logout, user, checkedIn } = useAuth();
    const [page, setPage] = useState(useLocation().pathname);
    const [pageClass, setPageClass] = useState(null);
    const navigate = useNavigate();
    const [checkedInClassroom, setCheckedInClassroom] = useState(null);
    const [isScrolled, setIsScrolled] = useState(false);

    const [width, setWidth] = useState(window.innerWidth);

    const goToMeridian = ()=>{
        navigate('/events-dashboard');
    }

    const goHome = ()=>{
        if(!page.includes("/room")){
            navigate('/room/none',{replace : true});
        }
    }

    useEffect(()=>{
        if(checkedIn){
            setCheckedInClassroom(checkedIn.classroom);
        }
    },[checkedIn]);

    useEffect(()=>{
        if(page.includes("/room")){
            setTimeout(() => {             
                setPageClass("room");
            }, 100);
        } else if(page.includes("/friends")){
            setTimeout(() => {
                setPageClass("friends");
            }, 100);
        } else if(page.includes("/events")){
            setTimeout(() => {
                setPageClass("events");
            }, 100);
        }
    },[page]);

    useEffect(() => { //useEffect for window resizing
        function handleResize() {
          setWidth(window.innerWidth);
        }
        window.addEventListener('resize', handleResize);
    
        return () => window.removeEventListener('resize', handleResize);
      }, []);

    useEffect(() => { //useEffect for scroll detection
        // Try multiple scroll sources to ensure we catch scroll events
        // Use hysteresis: show background at 50px, hide only when back at top (0-30px)
        // This prevents flickering during scroll
        const scrollHandler = () => {
          // Check both window scroll AND container scroll (same logic as interval)
          const currentPos = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
          const container = document.querySelector('.landing-container');
          const containerPos = container ? container.scrollTop : 0;
          const scrollPosition = currentPos || containerPos;
          
          // Hysteresis: different thresholds for showing vs hiding
          // Show background when scrolled past 50px
          // Only hide when scrolled back to very top (below 30px)
          setIsScrolled(prev => {
            let nowScrolled;
            if (prev) {
              // Currently showing background - only hide if scrolled back to top
              nowScrolled = scrollPosition > 30;
            } else {
              // Currently transparent - show background when scrolled down
              nowScrolled = scrollPosition > 50;
            }
            
            return nowScrolled;
          });
        };
        
        // Listen to landing-container scroll (this is what actually scrolls)
        const container = document.querySelector('.landing-container');
        if (container) {
          container.addEventListener('scroll', scrollHandler, { passive: true });
        }
        
        // Also listen to window/document as backup (but they might read 0, so container takes priority)
        window.addEventListener('scroll', scrollHandler, { passive: true });
        document.addEventListener('scroll', scrollHandler, { passive: true });
        
        // Check initial scroll position
        scrollHandler();
        
        // Periodic check to see if scroll position changes (as a fallback)
        const intervalId = setInterval(() => {
          const currentPos = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
          const container = document.querySelector('.landing-container');
          const containerPos = container ? container.scrollTop : 0;
          const totalPos = currentPos || containerPos;
          
          // Use same hysteresis logic as scrollHandler
          setIsScrolled(prev => {
            let nowScrolled;
            if (prev) {
              // Currently showing background - only hide if scrolled back to top
              nowScrolled = totalPos > 30;
            } else {
              // Currently transparent - show background when scrolled down
              nowScrolled = totalPos > 50;
            }
            
            if (prev !== nowScrolled) {
              return nowScrolled;
            }
            return prev;
          });
        }, 100);
        
        // Store interval for cleanup
        const storedIntervalId = intervalId;
        
        return () => {
          window.removeEventListener('scroll', scrollHandler);
          document.removeEventListener('scroll', scrollHandler);
          const container = document.querySelector('.landing-container');
          if (container) container.removeEventListener('scroll', scrollHandler);
          if (storedIntervalId) clearInterval(storedIntervalId);
        };
      }, [page]); // Re-run when page changes

    return(
        <div className={`Header ${isScrolled ? 'scrolled' : ''}`}>
            <div className="header-content">
                {/* {page === "/login" || page === "/register"  || page === "/"  ? "" :
                    <div className="nav-container">
                        <nav>
                            {isAuthenticated && <Link className={`nav-link ${ pageClass === "room" ? "active" : ""}`} to="/room/none" ><h2>search</h2></Link>}
                            {isAuthenticated && <Link className={`nav-link ${ pageClass === "friends" ? "active" : ""}`} to="/friends" ><h2>friends</h2></Link>}
                            <Link className={`nav-link ${ pageClass === "events" ? "active" : ""}`} to="/events-dashboard" ><h2>events</h2></Link>                         
                        </nav>  
                    </div>
                    
                } */}
                {
                    isAuthenticated ? 

                    <Link to='/room/none'>
                        <img className="logo" src={ isAuthenticated || isAuthenticating ? width < 800 ? MobileLogo : getLogo() : getLogo()} alt="logo"/>
                    </Link>
                    :
                    <Link to='/'>
                    <img className="logo" src={ isAuthenticated || isAuthenticating ? width < 800 ? MobileLogo : getLogo() : getLogo()} alt="logo"/>
                    </Link>
                }

                {page === "/login" || page === "/register" ? "" :
                    <div className="header-right">
                        {/* {isAuthenticated ? <NotificationInbox/> : ""}
                        {isAuthenticated ? <ProfilePicture/> : ""} */}
                        <button onClick={goToMeridian}>Go to Meridian
                            <Icon icon="mdi:arrow-right" className="arrow-right" />
                        </button>
                    </div>    
                }
            </div>
        </div>
    );
});

export default Header;