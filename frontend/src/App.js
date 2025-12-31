import React, { useEffect } from 'react';
import './App.scss';
import './assets/fonts.css';
import './assets/Fonts/Montserrat/Montserrat.css';
import './assets/Fonts/OpenSauce/OpenSauce.css';    
import AnimatedPageWrapper from './components/AnimatedPageWrapper/AnimatedPageWrapper';

import Room from './pages/Room/Room';
import Room1 from './pages/Room/Room1';
import Login from './pages/Login';
import Register from './pages/Register/Register';
import Redirect from './pages/Redirect/Redirect';
import Error from './pages/Error/Error';
import Onboard from './pages/OnBoarding/Onboard';
import Settings from './pages/Settings/Settings';
import Friends from './pages/Friends/Friends';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import Org from './pages/Org/Org';
import Profile from './pages/Profile/Profile';
import Landing from './pages/Landing/Landing';
import Events from './pages/Events/Events';
import DeveloperOnboard from './pages/DeveloperOnboarding/DeveloperOnboarding';
import QR from './pages/QR/QR';
import Admin  from './pages/Admin/Admin';
import OIEDash from './pages/OIEDash/OIEDash';
import NewBadge from './pages/NewBadge/NewBadge';
import CreateOrg from './pages/CreateOrg/CreateOrg';
import ClubDash from './pages/ClubDash/ClubDash';
import OrgDisplay from './pages/Org/OrgDisplay';
import RootDash from './pages/RootDash/RootDash';
import OrgManagement from './pages/FeatureAdmin/OrgManagement/Atlas';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PrivacyPolicy from './pages/PrivacyPolicy/PrivacyPolicy';
import SAMLCallback from './components/SAMLCallback/SAMLCallback';
import AppleCallback from './components/AppleCallback/AppleCallback';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { CacheProvider } from './CacheContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { NotificationProvider } from './NotificationContext';
import { ErrorProvider } from './ErrorContext';
import { ProfileCreationProvider } from './ProfileCreationContext';
import { WebSocketProvider } from './WebSocketContext';
import Layout from './pages/Layout/Layout';
import axios from 'axios';
import CreateEvent from './pages/CreateEventV2/CreateEventV2';
import EventsDash from './pages/EventsDash/EventsDash';
import EventPage from './pages/EventPage/EventPage';
import EventWorkspace from './pages/EventWorkspace/EventWorkspace';
import SubSidebarExample from './components/Dashboard/SubSidebarExample';
import RebrandingNotice from './components/RebrandingNotice/RebrandingNotice';
import Beacon from './pages/FeatureAdmin/Beacon/Beacon';
import Compass from './pages/FeatureAdmin/Compass/Compass';
import Atlas from './pages/FeatureAdmin/Atlas/Atlas';
import DomainDashboard from './pages/DomainDash/DomainDashboard';
import Contact from './pages/Contact/Contact';
import Booking from './pages/Booking/Booking';

function App() {
    useEffect(() => {
        // check if the user has already visited
        //don't do anything if /qr
        if (window.location.pathname === '/qr') {
            return;
        }
        const hasVisited = localStorage.getItem('hasVisited');

        if (!hasVisited) {
            // Log the visit to the backend
            axios.post('/log-visit')
                .then(response => {
                    localStorage.setItem('hasVisited', true);  // Mark as visited
                })
                .catch(error => {
                    console.error('Error logging visit', error);
                });
        } else {
            // console.log('User has already visited');
            // generate 10 char hash
            // store in local storage
            // send to backend
            console.log('User has already visited');
            let hash = localStorage.getItem('hash');
            let timestamp = localStorage.getItem('timestamp');
            if (!hash) {
                // generate hash
                hash = Math.random().toString(36).substring(2, 12);
                // store hash
                localStorage.setItem('hash', hash);
            }
            if (!timestamp) {
                timestamp = new Date().toISOString();
                localStorage.setItem('timestamp', timestamp);
            }

            //log how many minutes it has been since last visit
            console.log("minutes since last visit: ", (new Date().getTime() - new Date(timestamp).getTime()) / 1000 / 60);


            //if 20 minutes from last timestamp
            if (new Date().getTime() - new Date(timestamp).getTime() > 20 * 60 * 1000) {
                //send to backend
                localStorage.setItem('timestamp', new Date().toISOString());
                axios.post('/log-repeated-visit', {
                    hash: hash
                })
                    .then(response => {
                        localStorage.setItem('timestamp', new Date().toISOString());
                    })
                    .catch(error => {
                        console.error('Error logging visit', error);
                    });
            }
        }

        
    }, []);
    // document.documentElement.classList.add('dark-mode');
    return (
        <GoogleOAuthProvider clientId="639818062398-k4qnm9l320phu967ctc2l1jt1sp9ib7p.apps.googleusercontent.com">
            <RebrandingNotice />
            <ErrorProvider>
                <NotificationProvider>
                    <WebSocketProvider>
                        <AuthProvider>
                            <CacheProvider>
                                <Router>
                                    <ProfileCreationProvider>
                                    <Routes>
                                        <Route path='/' element={<Layout/>}>
                                            {/* publicly accessible pages */}
                                            <Route path="/qr/:id" element={<QR/>}/>
                                            <Route index element={<AnimatedPageWrapper><Landing/></AnimatedPageWrapper>} />
                                            <Route path="/room/:roomid" element={<AnimatedPageWrapper><Room1 /></AnimatedPageWrapper>}/>
                                            <Route path="/room1/:roomid" element={<AnimatedPageWrapper><Room1 /></AnimatedPageWrapper>}/>
                                            <Route path="/register" element={<AnimatedPageWrapper><Register /></AnimatedPageWrapper>}/>
                                            <Route path="/login" element={<AnimatedPageWrapper><Login /></AnimatedPageWrapper>}/>
                                            <Route path="/contact" element={<AnimatedPageWrapper><Contact /></AnimatedPageWrapper>}/>
                                            <Route path="/booking" element={<AnimatedPageWrapper><Booking /></AnimatedPageWrapper>}/>
                                            <Route path="/privacy-policy" element={<AnimatedPageWrapper><PrivacyPolicy /></AnimatedPageWrapper>}/>
                                            <Route path="/forgot-password" element={<AnimatedPageWrapper><ForgotPassword /></AnimatedPageWrapper>}/>
                                            <Route path="/reset-password" element={<AnimatedPageWrapper><ResetPassword /></AnimatedPageWrapper>}/>
                                            <Route path="/auth/saml/callback" element={<SAMLCallback />}/>
                                            <Route path="/auth/apple/callback" element={<AppleCallback />}/>
                                            <Route path="*" element={<Error />}/>
                                            <Route path="/error/:errorCode" element={<Error />}/>
                                            <Route path="/landing" element={<AnimatedPageWrapper><Landing/></AnimatedPageWrapper>}/>
                                            <Route path="/org" element={<AnimatedPageWrapper><Org/></AnimatedPageWrapper>}/>
                                            <Route path="/documentation" element={<Redirect/>}/>
                                            <Route path="/new-badge/:hash" element={<AnimatedPageWrapper><NewBadge/></AnimatedPageWrapper>}/>
                                            <Route path="/new-badge" element={<AnimatedPageWrapper><NewBadge/></AnimatedPageWrapper>}/>

                                            {/* logged in routes */}
                                            <Route element={ <ProtectedRoute/> }>
                                                <Route path="/profile" element={<AnimatedPageWrapper><Profile/></AnimatedPageWrapper>}/>
                                                <Route path="/onboard" element={<AnimatedPageWrapper><Onboard /></AnimatedPageWrapper>}/>
                                                {/* <Route path="/friends" element={<AnimatedPageWrapper><Friends/></AnimatedPageWrapper>}/> */}
                                                <Route path="/settings" element={<AnimatedPageWrapper><Settings/></AnimatedPageWrapper>}/>
                                                <Route path="/developer-onboarding" element={<AnimatedPageWrapper><DeveloperOnboard/></AnimatedPageWrapper>}/>
                                            </Route>

                                            <Route path="/org/:name" element={<AnimatedPageWrapper><OrgDisplay/></AnimatedPageWrapper>}/>
                                            {/* admin routes */}
                                            <Route element={ <ProtectedRoute authorizedRoles={['admin']}/> }>
                                                <Route path="/admin" element={<AnimatedPageWrapper><Admin/></AnimatedPageWrapper>}/>
                                            </Route>

                                            {/* features under development */}
                                            <Route element={ <ProtectedRoute authorizedRoles={['admin', 'developer']}/> }>
                                                <Route path="/events" element={<AnimatedPageWrapper><Events/></AnimatedPageWrapper>}/>
                                                <Route path="/club-dashboard/:id" element={<AnimatedPageWrapper><ClubDash/></AnimatedPageWrapper>}/>
                                                <Route path='/create-org' element={<AnimatedPageWrapper><CreateOrg/></AnimatedPageWrapper>}/>
                                                <Route path="/root-dashboard" element={<AnimatedPageWrapper><RootDash/></AnimatedPageWrapper>}/>
                                                <Route path="/approval-dashboard/:id" element={<AnimatedPageWrapper><OIEDash/></AnimatedPageWrapper>}/>
                                                <Route path="/domain-dashboard/:domainId" element={<AnimatedPageWrapper><DomainDashboard/></AnimatedPageWrapper>}/>
                                            </Route>
                                            <Route path="/events-dashboard" element={<AnimatedPageWrapper><EventsDash/></AnimatedPageWrapper>}/>
                                            <Route path="/event/:eventId" element={<AnimatedPageWrapper><EventPage/></AnimatedPageWrapper>}/>
                                            <Route path="/event/:eventId/workspace" element={<AnimatedPageWrapper><EventWorkspace/></AnimatedPageWrapper>}/>

                                            {/* oie routes */}
                                            <Route element={ <ProtectedRoute authorizedRoles={['admin', 'developer', 'oie']}/> }>
                                                <Route path="/oie-dashboard" element={<AnimatedPageWrapper><OIEDash/></AnimatedPageWrapper>}/>
                                                <Route path="/feature-admin/beacon" element={<AnimatedPageWrapper><Beacon/></AnimatedPageWrapper>}/>
                                                <Route path="/feature-admin/compass" element={<AnimatedPageWrapper><Compass/></AnimatedPageWrapper>}/>
                                                <Route path="/feature-admin/atlas" element={<AnimatedPageWrapper><OrgManagement/></AnimatedPageWrapper>}/>
                                            </Route>
                                            <Route path="/create-event" element={<AnimatedPageWrapper><CreateEvent/></AnimatedPageWrapper   >}/>
                                        </Route>
                                    </Routes>
                                    </ProfileCreationProvider>
                                </Router>
                            </CacheProvider>
                        </AuthProvider>
                    </WebSocketProvider>
                </NotificationProvider>
            </ErrorProvider>
        </GoogleOAuthProvider>
    );
}

export default App;
