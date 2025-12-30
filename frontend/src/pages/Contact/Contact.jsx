import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Contact.scss';
import Header from '../../components/Header/Header';
import axios from 'axios';
import { useNotification } from '../../NotificationContext';

function Contact() {
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        organization: '',
        message: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [emailError, setEmailError] = useState('');

    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
        
        if (name === 'email' && emailError) {
            setEmailError('');
        }
    };

    const handleEmailBlur = (e) => {
        const email = e.target.value;
        if (email && !validateEmail(email)) {
            setEmailError('Please enter a valid email address');
        } else {
            setEmailError('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate email before submissio
        if (!validateEmail(formData.email)) {
            setEmailError('Please enter a valid email address');
            return;
        }
        
        setIsSubmitting(true);
        
        try {
            const response = await axios.post('/contact', formData, {
                withCredentials: true
            });
            
            if (response.data.success) {
                addNotification({
                    title: 'Success',
                    message: 'Thank you for contacting us! We\'ll get back to you soon.',
                    type: 'success'
                });
                navigate('/');
            } else {
                addNotification({
                    title: 'Error',
                    message: response.data.message || 'Failed to send message. Please try again.',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error submitting contact form:', error);
            addNotification({
                title: 'Error',
                message: error.response?.data?.message || 'Failed to send message. Please try again.',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const isValid = formData.firstName && formData.lastName && formData.email && formData.message && !emailError;

    return (
        <div className="main-contact">
            <Header />
            <div className="contact-container">
                <div className="contact-content">
                    <h1>Schedule a Demo</h1>
                    <p className="contact-subtitle">Have questions about Meridian? We'd love to hear from you.</p>
                    
                    <form onSubmit={handleSubmit} className="contact-form">
                        <div className="form-group name-row">
                            <div className="name-field">
                                <label htmlFor="firstName">First Name</label>
                                <input
                                    type="text"
                                    id="firstName"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    placeholder="First name"
                                    required
                                />
                            </div>
                            <div className="name-field">
                                <label htmlFor="lastName">Last Name</label>
                                <input
                                    type="text"
                                    id="lastName"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    placeholder="Last name"
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="email">Work Email</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                onBlur={handleEmailBlur}
                                placeholder="your.email@meridian.study"
                                required
                                className={emailError ? 'error' : ''}
                            />
                            {emailError && <span className="error-message">{emailError}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="organization">Organization</label>
                            <input
                                type="text"
                                id="organization"
                                name="organization"
                                value={formData.organization}
                                onChange={handleChange}
                                placeholder="Your organization or institution"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="message">Message</label>
                            <textarea
                                id="message"
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                placeholder="Tell us about your needs or questions..."
                                rows="6"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className={`submit-button ${isValid && !isSubmitting ? 'active' : ''}`}
                            disabled={!isValid || isSubmitting}
                        >
                            {isSubmitting ? 'Sending...' : 'Send Message'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default Contact;

