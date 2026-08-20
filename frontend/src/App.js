import React, { lazy, useEffect } from 'react';
import './App.scss';
import AnimatedPageWrapper, { StaticFullBleedPage } from './components/AnimatedPageWrapper/AnimatedPageWrapper';
import { analytics } from './services/analytics/analytics';
import { isWww, isJustGoHost, setLastTenant, setTenantConfigCache } from './config/tenantRedirect';

import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import JustGoLanding from './pages/JustGoLanding/JustGoLanding';
import JustGoQrHop from './pages/JustGoLanding/JustGoQrHop';
import { JustGoApexCityLanding } from './pages/JustGoLanding/justGoHostRoutes';
import PlatformProtectedRoute from './components/PlatformProtectedRoute/PlatformProtectedRoute';
import JustGoCreatorProtectedRoute from './components/JustGoCreatorProtectedRoute/JustGoCreatorProtectedRoute';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { CacheProvider } from './CacheContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { NotificationProvider } from './NotificationContext';
import { ErrorProvider } from './ErrorContext';
import { ProfileCreationProvider } from './ProfileCreationContext';
import { WebSocketProvider } from './WebSocketContext';
import Layout from './pages/Layout/Layout';
import axios from 'axios';
import RebrandingNotice from './components/RebrandingNotice/RebrandingNotice';
import DevTenantSelector from './components/DevTenantSelector/DevTenantSelector';
import CommunityOrganizerFeatureAdminRedirect from './components/CommunityOrganizerFeatureAdminRedirect/CommunityOrganizerFeatureAdminRedirect';

if (typeof window !== 'undefined' && !isJustGoHost()) {
    import('./assets/fonts.css');
    import('./assets/Fonts/Montserrat/Montserrat.css');
    import('./assets/Fonts/OpenSauce/OpenSauce.css');
}

const Room1 = lazy(() => import('./pages/Room/Room1'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register/Register'));
const Redirect = lazy(() => import('./pages/Redirect/Redirect'));
const Error = lazy(() => import('./pages/Error/Error'));
const Onboard = lazy(() => import('./pages/OnBoarding/Onboard'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const Org = lazy(() => import('./pages/Org/Org'));
const Profile = lazy(() => import('./pages/Profile/Profile'));
const Landing = lazy(() => import('./pages/Landing/Landing'));
const MobileLanding = lazy(() => import('./pages/MobileLanding/MobileLanding'));
const InviteLanding = lazy(() => import('./pages/InviteLanding/InviteLanding'));
const DeveloperOnboard = lazy(() => import('./pages/DeveloperOnboarding/DeveloperOnboarding'));
const QR = lazy(() => import('./pages/QR/QR'));
const EventQRRedirect = lazy(() => import('./pages/QR/EventQRRedirect'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin/PlatformAdmin'));
const PivotTenantDashboard = lazy(() => import('./pages/PlatformAdmin/PivotTenantDashboard/PivotTenantDashboard'));
const PivotFleetDashboard = lazy(() => import('./pages/PlatformAdmin/PivotTenantDashboard/PivotFleetDashboard'));
const JustGoCreatorShell = lazy(() => import('./pages/JustGoCreator/JustGoCreatorShell'));
const JustGoCreatorHome = lazy(() => import('./pages/JustGoCreator/JustGoCreatorHome'));
const JustGoCreatorNew = lazy(() => import('./pages/JustGoCreator/JustGoCreatorNew'));
const JustGoCreatorEventWorkspace = lazy(() => import('./pages/JustGoCreator/JustGoCreatorEventWorkspace'));
const JustGoCreatorLogin = lazy(() => import('./pages/JustGoCreator/JustGoCreatorLogin'));
const OIEDash = lazy(() => import('./pages/OIEDash/OIEDash'));
const NewBadge = lazy(() => import('./pages/NewBadge/NewBadge'));
const CreateOrg = lazy(() => import('./pages/CreateOrg/CreateOrg'));
const SignUpCreateClub = lazy(() => import('./pages/SignUpCreateClub/SignUpCreateClub'));
const ClubDash = lazy(() => import('./pages/ClubDash/ClubDash'));
const PendingApprovalScreen = lazy(() => import('./pages/ClubDash/PendingApprovalScreen/PendingApprovalScreen'));
const OrgDisplay = lazy(() => import('./pages/Org/OrgDisplay'));
const RootDash = lazy(() => import('./pages/RootDash/RootDash'));
const AdminEventOperatorPage = lazy(() => import('./pages/RootDash/AdminEventOperatorPage'));
const AdminEventsListPage = lazy(() => import('./pages/RootDash/AdminEventsListPage'));
const OrgManagement = lazy(() => import('./pages/FeatureAdmin/OrgManagement/Atlas'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService/TermsOfService'));
const ChildSafetyStandards = lazy(() => import('./pages/ChildSafetyStandards/ChildSafetyStandards'));
const SAMLCallback = lazy(() => import('./components/SAMLCallback/SAMLCallback'));
const EmailVerification = lazy(() => import('./pages/EmailVerification'));
const CreateEvent = lazy(() => import('./pages/CreateEventV3/CreateEventV3'));
const EventsHub = lazy(() => import('./pages/EventsHub/EventsHub'));
const EventPage = lazy(() => import('./pages/EventPage/EventPage'));
const Beacon = lazy(() => import('./pages/FeatureAdmin/Beacon/Beacon'));
const Compass = lazy(() => import('./pages/FeatureAdmin/Compass/Compass'));
const AnalyticsDashboard = lazy(() => import('./pages/FeatureAdmin/AnalyticsDashboard/AnalyticsDashboard'));
const MobileAnalyticsDashboard = lazy(() => import('./pages/FeatureAdmin/MobileAnalyticsDashboard/MobileAnalyticsDashboard'));
const UserJourneyAnalytics = lazy(() => import('./pages/FeatureAdmin/UserJourneyAnalytics/UserJourneyAnalytics'));
const IndividualUserJourney = lazy(() => import('./pages/FeatureAdmin/IndividualUserJourney/IndividualUserJourney'));
const DomainDashboard = lazy(() => import('./pages/DomainDash/DomainDashboard'));
const Contact = lazy(() => import('./pages/Contact/Contact'));
const Booking = lazy(() => import('./pages/Booking/Booking'));
const Form = lazy(() => import('./pages/Form/Form'));
const Support = lazy(() => import('./pages/Support/Support'));
const CheckInConfirmation = lazy(() => import('./pages/CheckIn/CheckInConfirmation'));
const OrgInviteLanding = lazy(() => import('./pages/OrgInviteLanding/OrgInviteLanding'));
const SelectSchool = lazy(() => import('./pages/SelectSchool/SelectSchool'));
const OrgInviteLandingToken = lazy(() => import('./pages/OrgInviteLanding/OrgInviteLandingToken'));
const OrgInviteRedirect = lazy(() => import('./pages/OrgInviteAccept/OrgInviteRedirect'));
const StudySessionCallback = lazy(() => import('./pages/StudySessionCallback/StudySessionCallback'));
const StudySessionResponses = lazy(() => import('./pages/StudySessionResponses/StudySessionResponses'));
const PostMortemPdfPreview = lazy(() => import('./pages/ClubDash/EventsManagement/components/EventPostMortem/PostMortemPdfPreview'));
const TenantStatus = lazy(() => import('./pages/TenantStatus/TenantStatus'));

function App() {
    // Initialize analytics on app start
    useEffect(() => {
        const initAnalytics = async () => {
            const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
            await analytics.init({
                env,
                appVersion: '0.1.0',
                build: '1',
            });
        };

        initAnalytics().catch(error => {
            console.error('Failed to initialize analytics:', error);
        });
    }, []);

    // Remember tenant for next time user visits www (single-tenant: no picker)
    useEffect(() => {
        if (typeof window !== 'undefined' && !isWww() && !isJustGoHost() && window.location.hostname) {
            const sub = window.location.hostname.split('.')[0];
            if (sub && sub !== 'www' && sub !== 'justgo') setLastTenant(sub);
        }
    }, []);

    useEffect(() => {
        // check if the user has already visited
        //don't do anything if /qr
        if (isJustGoHost() || window.location.pathname === '/qr') {
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

    useEffect(() => {
        let cancelled = false;
        const loadTenantConfig = async () => {
            try {
                const response = await fetch('/api/tenant-config', { credentials: 'include' });
                if (!response.ok) return;
                const payload = await response.json();
                if (cancelled) return;
                if (payload?.success && Array.isArray(payload?.data?.tenants)) {
                    setTenantConfigCache(payload.data.tenants);
                }
            } catch (_) {}
        };
        loadTenantConfig();
        return () => {
            cancelled = true;
        };
    }, []);
    // document.documentElement.classList.add('dark-mode');
    const justGoHost = isJustGoHost();
    return (
        <GoogleOAuthProvider clientId="639818062398-k4qnm9l320phu967ctc2l1jt1sp9ib7p.apps.googleusercontent.com">
            <RebrandingNotice />
            <DevTenantSelector />
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
                                            {justGoHost ? (
                                                <Route path="/qr/:name" element={<JustGoQrHop />} />
                                            ) : (
                                                <>
                                                    <Route path="/qr/e/:shortId" element={<EventQRRedirect/>}/>
                                                    <Route path="/qr/:id" element={<QR/>}/>
                                                </>
                                            )}
                                            <Route path="/check-in/:eventId/:token" element={<AnimatedPageWrapper><CheckInConfirmation/></AnimatedPageWrapper>}/>
                                            <Route path="/check-in/:eventId" element={<AnimatedPageWrapper><CheckInConfirmation/></AnimatedPageWrapper>}/>
                                            <Route index element={justGoHost ? <JustGoLanding /> : <AnimatedPageWrapper><Landing/></AnimatedPageWrapper>} />
                                            <Route path="/room/:roomid" element={<AnimatedPageWrapper><Room1 /></AnimatedPageWrapper>}/>
                                            <Route path="/room1/:roomid" element={<AnimatedPageWrapper><Room1 /></AnimatedPageWrapper>}/>
                                            <Route path="/register" element={<AnimatedPageWrapper><Register /></AnimatedPageWrapper>}/>
                                            <Route path="/org-invites" element={<AnimatedPageWrapper><OrgInviteLanding /></AnimatedPageWrapper>}/>
                                            <Route path="/org-invites/landing/:token" element={<AnimatedPageWrapper><OrgInviteLandingToken /></AnimatedPageWrapper>}/>
                                            <Route path="/org-invites/accept" element={<OrgInviteRedirect />}/>
                                            <Route path="/org-invites/decline" element={<OrgInviteRedirect />}/>
                                            <Route path="/select-school" element={<AnimatedPageWrapper><SelectSchool /></AnimatedPageWrapper>}/>
                                            <Route path="/login" element={<AnimatedPageWrapper><Login /></AnimatedPageWrapper>}/>
                                            <Route path="/contact" element={<AnimatedPageWrapper><Contact /></AnimatedPageWrapper>}/>
                                            <Route path="/support" element={<AnimatedPageWrapper><Support /></AnimatedPageWrapper>}/>
                                            <Route path="/booking" element={<AnimatedPageWrapper><Booking /></AnimatedPageWrapper>}/>
                                            <Route path="/privacy-policy" element={<AnimatedPageWrapper><PrivacyPolicy /></AnimatedPageWrapper>}/>
                                            <Route path="/terms-of-service" element={<AnimatedPageWrapper><TermsOfService /></AnimatedPageWrapper>}/>
                                            <Route path="/justgo/privacy-policy" element={<AnimatedPageWrapper><PrivacyPolicy /></AnimatedPageWrapper>}/>
                                            <Route path="/justgo/terms-of-service" element={<AnimatedPageWrapper><TermsOfService /></AnimatedPageWrapper>}/>
                                            <Route path="/child-safety-standards" element={<AnimatedPageWrapper><ChildSafetyStandards /></AnimatedPageWrapper>}/>
                                            <Route path="/forgot-password" element={<AnimatedPageWrapper><ForgotPassword /></AnimatedPageWrapper>}/>
                                            <Route path="/reset-password" element={<AnimatedPageWrapper><ResetPassword /></AnimatedPageWrapper>}/>
                                            <Route path="/tenant-status" element={<AnimatedPageWrapper><TenantStatus /></AnimatedPageWrapper>}/>
                                            <Route element={<PlatformProtectedRoute />}>
                                                <Route path="/platform-admin" element={<AnimatedPageWrapper><PlatformAdmin /></AnimatedPageWrapper>} />
                                                <Route path="/platform-admin/pivot" element={<AnimatedPageWrapper><PivotFleetDashboard /></AnimatedPageWrapper>} />
                                                <Route path="/platform-admin/pivot/:tenantKey" element={<AnimatedPageWrapper><PivotTenantDashboard /></AnimatedPageWrapper>} />
                                                <Route path="/admin/pivot" element={<Navigate to="/platform-admin?page=1" replace />} />
                                            </Route>
                                            {/* Just Go Creator Console — separate from ClubDash / Platform Admin */}
                                            <Route path="/justgo/creator/login" element={<JustGoCreatorLogin />} />
                                            <Route element={<JustGoCreatorProtectedRoute />}>
                                                <Route element={<JustGoCreatorShell />}>
                                                    <Route path="/justgo/creator" element={<JustGoCreatorHome />} />
                                                    <Route path="/justgo/creator/new" element={<JustGoCreatorNew />} />
                                                    <Route path="/justgo/creator/events/:eventId" element={<JustGoCreatorEventWorkspace />} />
                                                </Route>
                                            </Route>
                                            <Route path="/auth/saml/callback" element={<SAMLCallback />}/>
                                            <Route path="*" element={<Error />}/>
                                            <Route path="/error/:errorCode" element={<Error />}/>
                                            <Route path="/landing" element={<AnimatedPageWrapper><Landing/></AnimatedPageWrapper>}/>
                                            <Route path="/mobile" element={<AnimatedPageWrapper><MobileLanding /></AnimatedPageWrapper>}/>
                                            <Route path="/invite" element={<AnimatedPageWrapper><InviteLanding /></AnimatedPageWrapper>}/>
                                            <Route path="/justgo/qr/:name" element={<JustGoQrHop />} />
                                            <Route path="/justgo/:tenantKey" element={<JustGoLanding />} />
                                            <Route path="/justgo" element={<JustGoLanding />} />
                                            {justGoHost ? (
                                                <Route path="/:tenantKey" element={<JustGoApexCityLanding />} />
                                            ) : null}
                                            <Route path="/org" element={<AnimatedPageWrapper><Org/></AnimatedPageWrapper>}/>
                                            <Route path="/documentation" element={<Redirect/>}/>
                                            <Route path="/new-badge/:hash" element={<AnimatedPageWrapper><NewBadge/></AnimatedPageWrapper>}/>
                                            <Route path="/new-badge" element={<AnimatedPageWrapper><NewBadge/></AnimatedPageWrapper>}/>

                                            {/* logged in routes */}
                                            <Route element={ <ProtectedRoute/> }>
                                                <Route path="/post-mortem-preview/:orgId/:eventId" element={<AnimatedPageWrapper><PostMortemPdfPreview /></AnimatedPageWrapper>}/>
                                                <Route path="/profile" element={<AnimatedPageWrapper><Profile/></AnimatedPageWrapper>}/>
                                                <Route path="/onboard" element={<AnimatedPageWrapper><Onboard /></AnimatedPageWrapper>}/>
                                                {/* <Route path="/friends" element={<AnimatedPageWrapper><Friends/></AnimatedPageWrapper>}/> */}
                                                <Route path="/settings" element={<AnimatedPageWrapper><Settings/></AnimatedPageWrapper>}/>
                                                <Route path="/developer-onboarding" element={<AnimatedPageWrapper><DeveloperOnboard/></AnimatedPageWrapper>}/>
                                                <Route path="/verify-email" element={<EmailVerification/>}/>
                                            </Route>

                                            <Route path="/org/:name" element={<AnimatedPageWrapper><OrgDisplay/></AnimatedPageWrapper>}/>
                                            {/* admin routes */}
                                            <Route element={ <ProtectedRoute authorizedRoles={['admin']}/> }>
                                                <Route path="/admin" element={<AnimatedPageWrapper><Admin/></AnimatedPageWrapper>}/>
                                                <Route path="/analytics-dashboard" element={<AnimatedPageWrapper><AnalyticsDashboard/></AnimatedPageWrapper>}/>
                                                <Route path="/user-journey-analytics" element={<AnimatedPageWrapper><UserJourneyAnalytics/></AnimatedPageWrapper>}/>
                                                <Route path="/user-journey" element={<AnimatedPageWrapper><IndividualUserJourney/></AnimatedPageWrapper>}/>
                                                <Route path="/user-journey/:type/:identifier" element={<AnimatedPageWrapper><IndividualUserJourney/></AnimatedPageWrapper>}/>
                                                <Route path="/mobile-analytics-dashboard" element={<AnimatedPageWrapper><MobileAnalyticsDashboard/></AnimatedPageWrapper>}/>
                                            </Route>

                                                <Route path="/club-dashboard/:id/pending-approval" element={<StaticFullBleedPage><PendingApprovalScreen/></StaticFullBleedPage>}/>
                                                <Route path="/club-dashboard/:id" element={<StaticFullBleedPage><ClubDash/></StaticFullBleedPage>}/>
                                            {/* features under development */}
                                            <Route element={ <ProtectedRoute authorizedRoles={['admin', 'developer', 'beta']}/> }>
                                                {/* <Route path="/events" element={<AnimatedPageWrapper><Events/></AnimatedPageWrapper>}/> */}
                                                <Route path="/root-dashboard" element={<AnimatedPageWrapper><RootDash/></AnimatedPageWrapper>}/>
                                                <Route path="/operator-event/:eventId" element={<AnimatedPageWrapper><AdminEventOperatorPage /></AnimatedPageWrapper>}/>
                                                <Route path="/operator-events" element={<AnimatedPageWrapper><AdminEventsListPage /></AnimatedPageWrapper>}/>
                                                <Route path="/form/:id" element={<AnimatedPageWrapper><Form/></AnimatedPageWrapper>}/>
                                            <Route path="/org-management" element={<AnimatedPageWrapper><OrgManagement/></AnimatedPageWrapper>}/>
                                                <Route path="/approval-dashboard/:id" element={<AnimatedPageWrapper><OIEDash/></AnimatedPageWrapper>}/>
                                                <Route path="/domain-dashboard/:domainId" element={<AnimatedPageWrapper><DomainDashboard/></AnimatedPageWrapper>}/>
                                            </Route>
                                            <Route path='/create-org' element={<AnimatedPageWrapper><CreateOrg/></AnimatedPageWrapper>}/>
                                            <Route path='/org-application' element={<AnimatedPageWrapper><SignUpCreateClub/></AnimatedPageWrapper>}/>
                                            <Route path="/events-dashboard" element={<AnimatedPageWrapper><EventsHub/></AnimatedPageWrapper>}/>
                                            <Route path="/events" element={<AnimatedPageWrapper><EventsHub/></AnimatedPageWrapper>}/>
                                            <Route path="/event/:eventId" element={<AnimatedPageWrapper><EventPage/></AnimatedPageWrapper>}/>
                                            <Route path="/study-session-callback" element={<AnimatedPageWrapper><StudySessionCallback/></AnimatedPageWrapper>}/>
                                            <Route path="/study-session/:sessionId/responses" element={<AnimatedPageWrapper><StudySessionResponses/></AnimatedPageWrapper>}/>
                                            {/* oie routes */}
                                            <Route element={ <ProtectedRoute authorizedRoles={['admin', 'developer', 'oie']}/> }>
                                                <Route path="/oie-dashboard" element={<AnimatedPageWrapper><OIEDash/></AnimatedPageWrapper>}/>
                                                <Route path="/feature-admin/beacon" element={<AnimatedPageWrapper><CommunityOrganizerFeatureAdminRedirect><Beacon/></CommunityOrganizerFeatureAdminRedirect></AnimatedPageWrapper>}/>
                                                <Route path="/feature-admin/compass" element={<AnimatedPageWrapper><CommunityOrganizerFeatureAdminRedirect><Compass/></CommunityOrganizerFeatureAdminRedirect></AnimatedPageWrapper>}/>
                                                <Route path="/feature-admin/atlas" element={<AnimatedPageWrapper><CommunityOrganizerFeatureAdminRedirect><OrgManagement/></CommunityOrganizerFeatureAdminRedirect></AnimatedPageWrapper>}/>
                                            </Route>
                                            <Route path="/create-event" element={<AnimatedPageWrapper><CreateEvent/></AnimatedPageWrapper   >}/>
                                            {/* Mockup only — Admin Outreach wireframes; no auth, no prod */}
                                            {/* <Route path="/mockup/admin-outreach" element={<AdminOutreachMock />}/> */}
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
