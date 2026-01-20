import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Support.scss';
import Header from '../../components/Header/Header';

function Support() {
    const navigate = useNavigate();

    return (
        <div className="support-page">
            <Header />
            <div className="support-container">
                <div className="support-content">
                    <h1>Support</h1>
                    <p className="support-subtitle">We're here to help you with any questions or issues</p>

                    <section className="support-section">
                        <h2>Get Help</h2>
                        <p>
                            If you need assistance with Meridian, have questions about features, or encounter any issues, 
                            we're here to help. Choose the option that works best for you.
                        </p>
                    </section>

                    <section className="support-section">
                        <h2>Contact Us</h2>
                        <div className="contact-methods">
                            <div className="contact-method">
                                <h3>📧 Email Support</h3>
                                <p>
                                    Send us an email at <a href="mailto:support@meridian.study">support@meridian.study</a> 
                                    and we'll get back to you as soon as possible.
                                </p>
                            </div>

                            <div className="contact-method">
                                <h3>📝 Contact Form</h3>
                                <p>
                                    Use our <a href="/contact" onClick={(e) => { e.preventDefault(); navigate('/contact'); }}>contact form</a> to 
                                    send us a message directly from the website. This is great for general inquiries, 
                                    feature requests, or scheduling a demo.
                                </p>
                            </div>

                            <div className="contact-method">
                                <h3>🔒 Privacy & Security</h3>
                                <p>
                                    For privacy-related questions or security concerns, please contact us at{' '}
                                    <a href="mailto:privacy@meridian.study">privacy@meridian.study</a>.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="support-section">
                        <h2>Frequently Asked Questions</h2>
                        
                        <div className="faq-item">
                            <h3>How do I create an account?</h3>
                            <p>
                                You can create an account by clicking the "Sign Up" button on our landing page or 
                                visiting the <a href="/register" onClick={(e) => { e.preventDefault(); navigate('/register'); }}>registration page</a>. 
                                You can sign up with your email or use Google Sign-In.
                            </p>
                        </div>

                        <div className="faq-item">
                            <h3>I forgot my password. How do I reset it?</h3>
                            <p>
                                You can reset your password by visiting the{' '}
                                <a href="/forgot-password" onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}>forgot password page</a>. 
                                Enter your email address and we'll send you instructions to reset your password.
                            </p>
                        </div>

                        <div className="faq-item">
                            <h3>How do I report a bug or issue?</h3>
                            <p>
                                If you encounter a bug or technical issue, please contact us at{' '}
                                <a href="mailto:support@meridian.study">support@meridian.study</a> with details about 
                                the problem, including what you were doing when it occurred and any error messages you saw.
                            </p>
                        </div>

                        <div className="faq-item">
                            <h3>How do I request a new feature?</h3>
                            <p>
                                We love hearing your ideas! Please use our{' '}
                                <a href="/contact" onClick={(e) => { e.preventDefault(); navigate('/contact'); }}>contact form</a> to 
                                share feature requests or suggestions. Your feedback helps us improve Meridian.
                            </p>
                        </div>

                        <div className="faq-item">
                            <h3>Where can I learn more about Meridian?</h3>
                            <p>
                                Visit our <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>homepage</a> to learn more 
                                about Meridian's features and capabilities. You can also check out our{' '}
                                <a href="/privacy-policy" onClick={(e) => { e.preventDefault(); navigate('/privacy-policy'); }}>Privacy Policy</a> and{' '}
                                <a href="/terms-of-service" onClick={(e) => { e.preventDefault(); navigate('/terms-of-service'); }}>Terms of Service</a>.
                            </p>
                        </div>
                    </section>

                    <section className="support-section">
                        <h2>Response Times</h2>
                        <p>
                            We aim to respond to all support inquiries within 24-48 hours during business days. 
                            For urgent issues, please mark your email as urgent or use the contact form with 
                            "Urgent" in the subject line.
                        </p>
                    </section>

                    <section className="support-section">
                        <h2>Additional Resources</h2>
                        <ul>
                            <li>
                                <strong>Privacy Policy:</strong>{' '}
                                <a href="/privacy-policy" onClick={(e) => { e.preventDefault(); navigate('/privacy-policy'); }}>
                                    View our Privacy Policy
                                </a>
                            </li>
                            <li>
                                <strong>Terms of Service:</strong>{' '}
                                <a href="/terms-of-service" onClick={(e) => { e.preventDefault(); navigate('/terms-of-service'); }}>
                                    View our Terms of Service
                                </a>
                            </li>
                            <li>
                                <strong>Contact Form:</strong>{' '}
                                <a href="/contact" onClick={(e) => { e.preventDefault(); navigate('/contact'); }}>
                                    Send us a message
                                </a>
                            </li>
                        </ul>
                    </section>

                    <div className="support-footer">
                        <button className="back-button" onClick={() => navigate(-1)}>
                            ← Back
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Support;

