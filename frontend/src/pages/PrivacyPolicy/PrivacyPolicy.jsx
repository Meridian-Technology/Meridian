import React from 'react';
import { useNavigate } from 'react-router-dom';
import './PrivacyPolicy.scss';
import Header from '../../components/Header/Header';

function PrivacyPolicy() {
    const navigate = useNavigate();
    const lastUpdated = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    return (
        <div className="privacy-policy-page">
            <Header />
            <div className="privacy-policy-container">
                <div className="privacy-policy-content">
                    <h1>Privacy Policy</h1>
                    <p className="privacy-subtitle">Meridian Platform & Mobile App</p>
                    <p className="last-updated">Last updated: {lastUpdated}</p>

                    <section className="privacy-section">
                        <h2>Introduction</h2>
                        <p>
                            Meridian ("we," "our," or "us") is committed to protecting your privacy. 
                            This Privacy Policy explains how we collect, use, disclose, and safeguard 
                            your information when you use our web platform (the "Platform") and our mobile 
                            application (the "App," collectively the "Services"). Please read this 
                            privacy policy carefully. If you do not agree with the terms of this privacy 
                            policy, please do not access or use our Services.
                        </p>
                    </section>

                    <section className="privacy-section">
                        <h2>Information We Collect</h2>
                        
                        <h3>Personal Information</h3>
                        <p>We may collect personal information that you provide to us, including:</p>
                        <ul>
                            <li><strong>Account Information:</strong> Name, email address, username, and password</li>
                            <li><strong>Profile Information:</strong> Profile picture, bio, and other profile details you choose to provide</li>
                            <li><strong>Academic Information:</strong> School affiliation, student status, and academic-related information</li>
                            <li><strong>Contact Information:</strong> Phone number (if provided) and email address</li>
                            <li><strong>Organization Information:</strong> Organizations you join, events you create or attend, and related activity</li>
                        </ul>

                        <h3>Usage Information</h3>
                        <p>We automatically collect certain information when you use our Services:</p>
                        <ul>
                            <li><strong>Platform Usage:</strong> Pages visited, features used, search queries, and interactions on the web platform</li>
                            <li><strong>Device Information (Mobile App):</strong> Device type, operating system, unique device identifiers, and mobile network information</li>
                            <li><strong>Usage Data:</strong> How you interact with our Services, features you use, events you attend, and content you view</li>
                            <li><strong>Location Data (Mobile App):</strong> With your permission, we may collect and process location data to provide location-based features such as room finding</li>
                            <li><strong>Log Data:</strong> IP address, access times, browser type, app crashes, and other diagnostic data</li>
                            <li><strong>Cookies and Tracking:</strong> We use cookies and similar technologies on the web platform to enhance your experience</li>
                        </ul>

                        <h3>Mobile App Specific Information</h3>
                        <p>When using our mobile application, we may collect additional information:</p>
                        <ul>
                            <li><strong>Push Notification Tokens:</strong> To send you notifications about events, updates, and important information</li>
                            <li><strong>Biometric Data:</strong> If you enable biometric authentication (Face ID, Touch ID), this is stored locally on your device and never transmitted to our servers</li>
                            <li><strong>App Permissions:</strong> Camera (for QR code scanning), location (for room finding), and notifications (for alerts)</li>
                        </ul>

                        <h3>Third-Party Information</h3>
                        <p>If you choose to sign in using Google or other third-party authentication services, 
                        we may receive information from those services, such as your name, email address, and profile picture.</p>
                    </section>

                    <section className="privacy-section">
                        <h2>How We Use Your Information</h2>
                        <p>We use the information we collect to:</p>
                        <ul>
                            <li>Provide, maintain, and improve our Services (Platform and App) and their features</li>
                            <li>Create and manage your account across all platforms</li>
                            <li>Process your transactions and send you related information</li>
                            <li>Send you notifications about events, updates, and important information (via email, web, and push notifications)</li>
                            <li>Personalize your experience and provide content relevant to you</li>
                            <li>Facilitate connections between users (e.g., friends, organizations)</li>
                            <li>Enable cross-platform synchronization of your data and preferences</li>
                            <li>Analyze usage patterns to improve our services</li>
                            <li>Detect, prevent, and address technical issues and security threats</li>
                            <li>Comply with legal obligations and enforce our terms of service</li>
                        </ul>
                    </section>

                    <section className="privacy-section">
                        <h2>Data Sharing and Disclosure</h2>
                        <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
                        <ul>
                            <li><strong>With Your Consent:</strong> We may share your information when you explicitly consent</li>
                            <li><strong>Service Providers:</strong> We may share information with third-party service providers who perform services on our behalf (e.g., cloud hosting, analytics)</li>
                            <li><strong>Legal Requirements:</strong> We may disclose information if required by law or in response to valid requests by public authorities</li>
                            <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred</li>
                            <li><strong>Public Information:</strong> Information you choose to make public (e.g., public profile, event RSVPs) will be visible to other users</li>
                        </ul>
                    </section>

                    <section className="privacy-section">
                        <h2>Data Security</h2>
                        <p>
                            We implement appropriate technical and organizational security measures to protect your 
                            personal information. However, no method of transmission over the Internet or electronic 
                            storage is 100% secure. While we strive to use commercially acceptable means to protect 
                            your information, we cannot guarantee absolute security.
                        </p>
                    </section>

                    <section className="privacy-section">
                        <h2>Your Rights and Choices</h2>
                        <p>You have certain rights regarding your personal information:</p>
                        <ul>
                            <li><strong>Access:</strong> You can access and update your personal information through the Platform settings or App settings</li>
                            <li><strong>Deletion:</strong> You can request deletion of your account and associated data from either platform</li>
                            <li><strong>Opt-Out:</strong> You can opt out of certain data collection and marketing communications</li>
                            <li><strong>Cookies (Web Platform):</strong> You can manage cookie preferences through your browser settings</li>
                            <li><strong>Location Services (Mobile App):</strong> You can enable or disable location services through your device settings</li>
                            <li><strong>Push Notifications (Mobile App):</strong> You can manage push notification preferences in the App settings or device settings</li>
                            <li><strong>Biometric Authentication (Mobile App):</strong> You can enable or disable biometric login in the App settings</li>
                            <li><strong>Data Portability:</strong> You can request a copy of your data in a portable format</li>
                        </ul>
                        <p>
                            To exercise these rights, please contact us using the information provided in the 
                            "Contact Us" section below.
                        </p>
                    </section>

                    <section className="privacy-section">
                        <h2>Children's Privacy</h2>
                        <p>
                            The App is not intended for children under the age of 13. We do not knowingly collect 
                            personal information from children under 13. If you are a parent or guardian and believe 
                            your child has provided us with personal information, please contact us immediately.
                        </p>
                    </section>

                    <section className="privacy-section">
                        <h2>Third-Party Services</h2>
                        <p>
                            Our Services may contain links to third-party websites or services. We are not responsible for 
                            the privacy practices of these third parties. We encourage you to read the privacy policies 
                            of any third-party services you access.
                        </p>
                        <p><strong>Third-party services we use include:</strong></p>
                        <ul>
                            <li><strong>Google Sign-In:</strong> For authentication services on both Platform and App (subject to Google's Privacy Policy)</li>
                            <li><strong>Expo (Mobile App):</strong> For app development and push notification services</li>
                            <li><strong>Cloud Hosting Services:</strong> For storing and processing data</li>
                            <li><strong>Analytics Services:</strong> To understand how our Services are used and improve our offerings</li>
                            <li><strong>Email Services:</strong> For sending transactional and notification emails</li>
                        </ul>
                    </section>

                    <section className="privacy-section">
                        <h2>Data Retention</h2>
                        <p>
                            We retain your personal information for as long as necessary to provide our services and 
                            fulfill the purposes described in this Privacy Policy, unless a longer retention period is 
                            required or permitted by law. When you delete your account, we will delete or anonymize your 
                            personal information from both the Platform and App, except where we are required to retain 
                            it for legal purposes.
                        </p>
                        <p>
                            <strong>Note:</strong> Data stored locally on your mobile device (such as cached content or 
                            biometric authentication data) may persist until you uninstall the App or clear the App's data.
                        </p>
                    </section>

                    <section className="privacy-section">
                        <h2>Changes to This Privacy Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify you of any changes by 
                            posting the new Privacy Policy on this page and updating the "Last updated" date. You are 
                            advised to review this Privacy Policy periodically for any changes.
                        </p>
                    </section>

                    <section className="privacy-section">
                        <h2>Contact Us</h2>
                        <p>
                            If you have any questions about this Privacy Policy or our privacy practices, please contact us:
                        </p>
                        <div className="contact-info">
                            <p><strong>Email:</strong> <a href="mailto:privacy@meridian.study">privacy@meridian.study</a></p>
                            <p><strong>Website:</strong> <a href="https://meridian.study" target="_blank" rel="noopener noreferrer">meridian.study</a></p>
                            <p><strong>Support:</strong> <a href="/contact">Contact Form</a></p>
                        </div>
                    </section>

                    <div className="privacy-footer">
                        <button className="back-button" onClick={() => navigate(-1)}>
                            ← Back
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PrivacyPolicy;

