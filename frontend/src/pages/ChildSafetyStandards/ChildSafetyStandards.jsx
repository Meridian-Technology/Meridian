import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ChildSafetyStandards.scss';
import Header from '../../components/Header/Header';

function ChildSafetyStandards() {
    const navigate = useNavigate();
    const lastUpdated = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    return (
        <div className="child-safety-standards-page">
            <Header />
            <div className="child-safety-standards-container">
                <div className="child-safety-standards-content">
                    <h1>Child Safety Standards</h1>
                    <p className="standards-subtitle">Meridian Platform & Mobile App</p>
                    <p className="last-updated">Last updated: {lastUpdated}</p>

                    <section className="standards-section">
                        <h2>Our Commitment to Child Safety</h2>
                        <p>
                            Meridian ("we," "our," or "us") is committed to protecting children and preventing 
                            child sexual abuse and exploitation (CSAE) across our web platform (the "Platform") 
                            and mobile application (the "App," collectively the "Services"). We have implemented 
                            comprehensive safety measures and standards to ensure a safe environment for all users, 
                            particularly minors.
                        </p>
                        <p>
                            This document outlines our externally published standards and practices for preventing, 
                            detecting, and responding to CSAE-related content and activities on our Services, in 
                            compliance with Google Play Store requirements and industry best practices.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Age Restrictions and Account Eligibility</h2>
                        
                        <h3>Minimum Age Requirement</h3>
                        <p>
                            Our Services are not intended for children under the age of 13. We do not knowingly 
                            collect personal information from children under 13. Users must be at least 13 years 
                            old to create an account and use our Services.
                        </p>

                        <h3>Age Verification</h3>
                        <p>
                            During account registration, users must confirm they meet the minimum age requirement. 
                            We require users to be affiliated with an educational institution, which provides an 
                            additional layer of age verification through institutional affiliation.
                        </p>

                        <h3>Parental Consent</h3>
                        <p>
                            Users between the ages of 13 and 18 must have parental or guardian permission to use 
                            our Services. We encourage parents and guardians to monitor their children's use of 
                            our Services and to contact us immediately if they have any concerns.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Content Moderation and Safety Measures</h2>
                        
                        <h3>Automated Detection Systems</h3>
                        <p>
                            We employ automated detection tools and technologies to identify and prevent CSAE-related 
                            content and activities, including:
                        </p>
                        <ul>
                            <li><strong>Content Scanning:</strong> Automated scanning of user-generated content for inappropriate material</li>
                            <li><strong>Hash Matching:</strong> Use of industry-standard hash-matching technology to identify known CSAE content</li>
                            <li><strong>Pattern Detection:</strong> Machine learning classifiers to detect suspicious patterns and behaviors</li>
                            <li><strong>Real-time Monitoring:</strong> Continuous monitoring of platform activity for safety violations</li>
                        </ul>

                        <h3>Human Review</h3>
                        <p>
                            All automated detections are subject to human review by trained moderators. We maintain 
                            a dedicated team responsible for reviewing reported content and investigating potential 
                            violations of our safety policies.
                        </p>

                        <h3>User Reporting</h3>
                        <p>
                            Users can report inappropriate content, suspicious behavior, or safety concerns through 
                            multiple channels:
                        </p>
                        <ul>
                            <li>In-app reporting features available on all content</li>
                            <li>Direct contact via our support channels</li>
                            <li>Email reporting to our safety team</li>
                        </ul>
                        <p>
                            All reports are reviewed promptly, and we take immediate action when violations are 
                            confirmed.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Prohibited Content and Activities</h2>
                        <p>
                            The following content and activities are strictly prohibited on our Services:
                        </p>
                        <ul>
                            <li>Any content that depicts, promotes, or facilitates child sexual abuse or exploitation</li>
                            <li>Content that sexualizes minors or depicts minors in a sexual manner</li>
                            <li>Grooming behaviors or attempts to establish inappropriate relationships with minors</li>
                            <li>Sharing, soliciting, or distributing CSAE-related material</li>
                            <li>Any activity that endangers the safety or well-being of minors</li>
                            <li>Impersonation of minors or misrepresentation of age</li>
                        </ul>
                        <p>
                            Violations of these prohibitions result in immediate account termination, reporting to 
                            appropriate authorities, and cooperation with law enforcement investigations.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Reporting and Response Procedures</h2>
                        
                        <h3>Immediate Response</h3>
                        <p>
                            When CSAE-related content or activity is detected or reported:
                        </p>
                        <ul>
                            <li>Content is immediately removed from our platform</li>
                            <li>User accounts involved are immediately suspended or terminated</li>
                            <li>All relevant information is preserved for law enforcement</li>
                            <li>We report to appropriate authorities, including the National Center for Missing & Exploited Children (NCMEC) and relevant law enforcement agencies</li>
                        </ul>

                        <h3>Law Enforcement Cooperation</h3>
                        <p>
                            We fully cooperate with law enforcement agencies and child safety organizations in 
                            investigations related to CSAE. We preserve evidence, provide information as legally 
                            required, and assist in investigations to the fullest extent permitted by law.
                        </p>

                        <h3>Transparency</h3>
                        <p>
                            We maintain records of all CSAE-related incidents and actions taken. While we protect 
                            user privacy and the integrity of investigations, we are transparent about our safety 
                            practices and compliance with applicable laws and regulations.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Partnerships and Industry Standards</h2>
                        
                        <h3>Industry Partnerships</h3>
                        <p>
                            We work with leading child safety organizations and follow industry best practices, 
                            including:
                        </p>
                        <ul>
                            <li><strong>Thorn:</strong> Partnering with Thorn to develop and implement best practices for preventing CSAE</li>
                            <li><strong>NCMEC:</strong> Reporting suspected CSAE content to the National Center for Missing & Exploited Children</li>
                            <li><strong>Internet Watch Foundation (IWF):</strong> Utilizing IWF resources to identify and remove harmful content</li>
                            <li><strong>Safety by Design Principles:</strong> Following Safety by Design for Generative AI principles developed by Thorn and All Tech Is Human</li>
                        </ul>

                        <h3>Compliance Standards</h3>
                        <p>
                            Our safety measures align with:
                        </p>
                        <ul>
                            <li>Google Play Store Child Safety Standards</li>
                            <li>Industry best practices for CSAE prevention</li>
                            <li>Applicable federal and state laws regarding child protection</li>
                            <li>Educational institution safety requirements</li>
                        </ul>
                    </section>

                    <section className="standards-section">
                        <h2>User Education and Awareness</h2>
                        <p>
                            We provide educational resources to help users understand:
                        </p>
                        <ul>
                            <li>How to recognize and report inappropriate content or behavior</li>
                            <li>Best practices for staying safe online</li>
                            <li>How to protect personal information and privacy</li>
                            <li>What to do if they encounter concerning content or behavior</li>
                        </ul>
                        <p>
                            These resources are available in our app, on our website, and through our support channels.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Data Protection and Privacy</h2>
                        <p>
                            We take special care to protect the privacy and personal information of all users, 
                            particularly minors. Our data collection and processing practices are designed to:
                        </p>
                        <ul>
                            <li>Minimize data collection from minors</li>
                            <li>Protect personal information with industry-standard security measures</li>
                            <li>Comply with applicable privacy laws, including COPPA (Children's Online Privacy Protection Act)</li>
                            <li>Provide parents and guardians with information about data collection practices</li>
                        </ul>
                        <p>
                            For more information about our data practices, please see our <a href="/privacy-policy">Privacy Policy</a>.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Regular Review and Updates</h2>
                        <p>
                            We regularly review and update our child safety standards and practices to:
                        </p>
                        <ul>
                            <li>Stay current with evolving threats and best practices</li>
                            <li>Improve our detection and prevention capabilities</li>
                            <li>Enhance our response procedures</li>
                            <li>Ensure compliance with updated regulations and platform requirements</li>
                        </ul>
                        <p>
                            This document is reviewed at least annually and updated as needed to reflect changes 
                            in our practices, technology, or legal requirements.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Contact Information</h2>
                        <p>
                            If you have concerns about child safety, need to report inappropriate content or 
                            behavior, or have questions about our child safety standards, please contact us:
                        </p>
                        <div className="contact-info">
                            <p><strong>Safety Team Email:</strong> <a href="mailto:safety@meridian.study">safety@meridian.study</a></p>
                            <p><strong>General Support:</strong> <a href="/contact">Contact Form</a></p>
                            <p><strong>Website:</strong> <a href="https://meridian.study" target="_blank" rel="noopener noreferrer">meridian.study</a></p>
                        </div>
                        <p>
                            <strong>For emergencies or immediate safety concerns:</strong> Please contact local 
                            law enforcement or the National Center for Missing & Exploited Children at 
                            <a href="https://www.missingkids.org/gethelpnow/cybertipline" target="_blank" rel="noopener noreferrer"> 1-800-THE-LOST</a> or 
                            <a href="https://www.missingkids.org/gethelpnow/cybertipline" target="_blank" rel="noopener noreferrer"> report online</a>.
                        </p>
                    </section>

                    <section className="standards-section">
                        <h2>Compliance and Certification</h2>
                        <p>
                            Meridian is committed to maintaining compliance with:
                        </p>
                        <ul>
                            <li>Google Play Store Child Safety Standards</li>
                            <li>COPPA (Children's Online Privacy Protection Act)</li>
                            <li>Applicable federal and state child protection laws</li>
                            <li>Industry best practices for CSAE prevention</li>
                        </ul>
                        <p>
                            This document serves as our externally published statement of compliance with CSAE 
                            prevention standards as required by Google Play Store policies.
                        </p>
                    </section>

                    <div className="standards-footer">
                        <button className="back-button" onClick={() => navigate(-1)}>
                            ← Back
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ChildSafetyStandards;
