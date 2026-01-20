import React from 'react';
import { useNavigate } from 'react-router-dom';
import './TermsOfService.scss';
import Header from '../../components/Header/Header';

function TermsOfService() {
    const navigate = useNavigate();
    const lastUpdated = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    return (
        <div className="terms-of-service-page">
            <Header />
            <div className="terms-of-service-container">
                <div className="terms-of-service-content">
                    <h1>Terms of Service</h1>
                    <p className="terms-subtitle">Meridian Platform & Mobile App</p>
                    <p className="last-updated">Last updated: {lastUpdated}</p>

                    <section className="terms-section">
                        <h2>1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using Meridian ("we," "our," or "us"), including our web platform 
                            (the "Platform") and mobile application (the "App," collectively the "Services"), 
                            you agree to be bound by these Terms of Service ("Terms"). If you do not agree to 
                            these Terms, please do not access or use our Services.
                        </p>
                        <p>
                            These Terms constitute a legally binding agreement between you and Meridian. 
                            We may modify these Terms at any time, and such modifications will be effective 
                            immediately upon posting. Your continued use of the Services after any modification 
                            constitutes your acceptance of the modified Terms.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>2. Description of Services</h2>
                        <p>
                            Meridian provides a platform that enables users to discover and participate in campus 
                            events, find study rooms and spaces, connect with organizations, and build community 
                            on their campus. Our Services include:
                        </p>
                        <ul>
                            <li><strong>Event Discovery:</strong> Browse, search, and RSVP to campus events and activities</li>
                            <li><strong>Room Finding:</strong> Discover and locate study rooms, meeting spaces, and campus locations</li>
                            <li><strong>Organization Management:</strong> Join organizations, create events, and manage memberships</li>
                            <li><strong>Social Features:</strong> Connect with friends, send messages, and build your campus network</li>
                            <li><strong>Notifications:</strong> Receive updates about events, room availability, and important announcements</li>
                        </ul>
                        <p>
                            We reserve the right to modify, suspend, or discontinue any aspect of the Services 
                            at any time, with or without notice.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>3. User Accounts</h2>
                        
                        <h3>Account Creation</h3>
                        <p>To use certain features of our Services, you must create an account. When creating an account, you agree to:</p>
                        <ul>
                            <li>Provide accurate, current, and complete information</li>
                            <li>Maintain and promptly update your account information</li>
                            <li>Maintain the security of your password and account</li>
                            <li>Accept responsibility for all activities that occur under your account</li>
                            <li>Notify us immediately of any unauthorized use of your account</li>
                        </ul>

                        <h3>Account Eligibility</h3>
                        <p>
                            You must be at least 13 years old to use our Services. If you are under 18, you 
                            represent that you have your parent's or guardian's permission to use the Services. 
                            You must be affiliated with an educational institution that uses Meridian to create 
                            an account.
                        </p>

                        <h3>Account Termination</h3>
                        <p>
                            We reserve the right to suspend or terminate your account at any time, with or 
                            without notice, for violation of these Terms or for any other reason we deem 
                            necessary to protect the integrity of our Services.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>4. User Content and Conduct</h2>
                        
                        <h3>User-Generated Content</h3>
                        <p>
                            You are solely responsible for all content you post, upload, or otherwise make 
                            available through the Services ("User Content"), including but not limited to:
                        </p>
                        <ul>
                            <li>Event descriptions and details</li>
                            <li>Profile information and photos</li>
                            <li>Comments, messages, and communications</li>
                            <li>Organization information and content</li>
                            <li>Room reviews and ratings</li>
                        </ul>

                        <h3>Content Standards</h3>
                        <p>You agree not to post User Content that:</p>
                        <ul>
                            <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
                            <li>Violates any third-party rights, including intellectual property, privacy, or publicity rights</li>
                            <li>Contains false or misleading information</li>
                            <li>Spams, solicits, or promotes commercial activities without authorization</li>
                            <li>Impersonates any person or entity or misrepresents your affiliation</li>
                            <li>Contains viruses, malware, or other harmful code</li>
                            <li>Violates any applicable laws or regulations</li>
                        </ul>

                        <h3>Content License</h3>
                        <p>
                            By posting User Content, you grant Meridian a worldwide, non-exclusive, royalty-free, 
                            perpetual license to use, reproduce, modify, adapt, publish, translate, and distribute 
                            your User Content in connection with operating and providing the Services.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>5. Intellectual Property</h2>
                        <p>
                            The Services, including all content, features, functionality, and software, are owned 
                            by Meridian and are protected by copyright, trademark, and other intellectual property 
                            laws. You may not copy, modify, distribute, sell, or lease any part of our Services 
                            without our express written permission.
                        </p>
                        <p>
                            The Meridian name, logo, and all related names, logos, product and service names, 
                            designs, and slogans are trademarks of Meridian. You may not use these marks without 
                            our prior written permission.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>6. Prohibited Activities</h2>
                        <p>You agree not to:</p>
                        <ul>
                            <li>Use the Services for any illegal purpose or in violation of any laws</li>
                            <li>Attempt to gain unauthorized access to any portion of the Services or any systems or networks</li>
                            <li>Interfere with or disrupt the Services or servers connected to the Services</li>
                            <li>Use automated systems (bots, scrapers, etc.) to access the Services without permission</li>
                            <li>Reverse engineer, decompile, or disassemble any software used in the Services</li>
                            <li>Create multiple accounts to circumvent restrictions or abuse the Services</li>
                            <li>Harass, threaten, or harm other users</li>
                            <li>Collect or store personal information about other users without their consent</li>
                            <li>Use the Services to transmit spam, chain letters, or unsolicited communications</li>
                            <li>Violate any school or institutional policies while using the Services</li>
                        </ul>
                    </section>

                    <section className="terms-section">
                        <h2>7. Events and Organizations</h2>
                        
                        <h3>Event Creation and Management</h3>
                        <p>
                            Users may create and manage events through the Services. Event creators are responsible 
                            for ensuring their events comply with all applicable laws, school policies, and these 
                            Terms. Meridian is not responsible for the content, conduct, or outcomes of any events 
                            created through the Services.
                        </p>

                        <h3>Organization Management</h3>
                        <p>
                            Organizations using Meridian are responsible for managing their members, events, and 
                            content in accordance with these Terms and applicable institutional policies. Organization 
                            administrators have additional responsibilities and may be subject to additional terms.
                        </p>

                        <h3>Room Reservations</h3>
                        <p>
                            Room availability information is provided for informational purposes. Meridian does not 
                            guarantee room availability or manage room reservations. Users are responsible for 
                            verifying room availability and following their institution's room reservation policies.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>8. Privacy</h2>
                        <p>
                            Your use of the Services is also governed by our Privacy Policy, which describes how 
                            we collect, use, and protect your information. By using the Services, you consent to 
                            the collection and use of your information as described in our Privacy Policy.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>9. Disclaimers</h2>
                        <p>
                            THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
                            EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, 
                            FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                        </p>
                        <p>
                            We do not warrant that the Services will be uninterrupted, secure, or error-free, or 
                            that defects will be corrected. We do not guarantee the accuracy, completeness, or 
                            usefulness of any information on the Services.
                        </p>
                        <p>
                            Meridian is not responsible for the content, accuracy, or opinions expressed in User 
                            Content, events, or organizations. We do not endorse or assume responsibility for any 
                            third-party content, products, or services linked to or from the Services.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>10. Limitation of Liability</h2>
                        <p>
                            TO THE MAXIMUM EXTENT PERMITTED BY LAW, MERIDIAN AND ITS OFFICERS, DIRECTORS, EMPLOYEES, 
                            AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR 
                            PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR OTHER 
                            INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF OR INABILITY TO USE THE SERVICES.
                        </p>
                        <p>
                            Our total liability to you for all claims arising from or related to the Services shall 
                            not exceed the amount you paid us (if any) in the twelve months preceding the claim, 
                            or $100, whichever is greater.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>11. Indemnification</h2>
                        <p>
                            You agree to indemnify, defend, and hold harmless Meridian and its officers, directors, 
                            employees, and agents from and against any claims, liabilities, damages, losses, and 
                            expenses, including reasonable attorneys' fees, arising out of or in any way connected 
                            with:
                        </p>
                        <ul>
                            <li>Your use of the Services</li>
                            <li>Your violation of these Terms</li>
                            <li>Your violation of any third-party rights</li>
                            <li>Your User Content</li>
                            <li>Any events or activities you create or participate in through the Services</li>
                        </ul>
                    </section>

                    <section className="terms-section">
                        <h2>12. Termination</h2>
                        <p>
                            We may terminate or suspend your account and access to the Services immediately, 
                            without prior notice or liability, for any reason, including if you breach these Terms.
                        </p>
                        <p>
                            Upon termination, your right to use the Services will cease immediately. All provisions 
                            of these Terms that by their nature should survive termination shall survive, including 
                            ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
                        </p>
                        <p>
                            You may terminate your account at any time by contacting us or using the account deletion 
                            features in the Services.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>13. Governing Law and Dispute Resolution</h2>
                        <p>
                            These Terms shall be governed by and construed in accordance with the laws of the 
                            jurisdiction in which Meridian operates, without regard to its conflict of law provisions.
                        </p>
                        <p>
                            Any disputes arising out of or relating to these Terms or the Services shall be resolved 
                            through binding arbitration in accordance with applicable arbitration rules, except where 
                            prohibited by law.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>14. Changes to Terms</h2>
                        <p>
                            We reserve the right to modify these Terms at any time. We will notify users of material 
                            changes by posting the updated Terms on this page and updating the "Last updated" date. 
                            Your continued use of the Services after any changes constitutes your acceptance of the 
                            new Terms.
                        </p>
                        <p>
                            If you do not agree to the modified Terms, you must stop using the Services and may 
                            terminate your account.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>15. Miscellaneous</h2>
                        
                        <h3>Entire Agreement</h3>
                        <p>
                            These Terms, together with our Privacy Policy, constitute the entire agreement between 
                            you and Meridian regarding the Services.
                        </p>

                        <h3>Severability</h3>
                        <p>
                            If any provision of these Terms is found to be unenforceable or invalid, that provision 
                            shall be limited or eliminated to the minimum extent necessary, and the remaining 
                            provisions shall remain in full force and effect.
                        </p>

                        <h3>Waiver</h3>
                        <p>
                            Our failure to enforce any right or provision of these Terms shall not be deemed a waiver 
                            of such right or provision.
                        </p>

                        <h3>Assignment</h3>
                        <p>
                            You may not assign or transfer these Terms or your account without our prior written 
                            consent. We may assign these Terms without restriction.
                        </p>
                    </section>

                    <section className="terms-section">
                        <h2>16. Contact Us</h2>
                        <p>
                            If you have any questions about these Terms of Service, please contact us:
                        </p>
                        <div className="contact-info">
                            <p><strong>Email:</strong> <a href="mailto:legal@meridian.study">legal@meridian.study</a></p>
                            <p><strong>Website:</strong> <a href="https://meridian.study" target="_blank" rel="noopener noreferrer">meridian.study</a></p>
                            <p><strong>Support:</strong> <a href="/contact">Contact Form</a></p>
                        </div>
                    </section>

                    <div className="terms-footer">
                        <button className="back-button" onClick={() => navigate(-1)}>
                            ← Back
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TermsOfService;

