import React, { useState, useEffect } from 'react';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import Flag from '../../../../components/Flag/Flag';
import UserSearch from '../../../../components/UserSearch/UserSearch';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';
import { useFetch } from '../../../../hooks/useFetch';
import './NewDomain.scss';

const NewDomain = ({ handleClose, refetch }) => {
    const [domainData, setDomainData] = useState({
        name: '',
        type: 'facility',
        description: '',
        maxCapacity: null,
        allowedEventTypes: [],
        restrictedEventTypes: [],
        operatingHours: {
            monday: { open: '09:00', close: '17:00', closed: false },
            tuesday: { open: '09:00', close: '17:00', closed: false },
            wednesday: { open: '09:00', close: '17:00', closed: false },
            thursday: { open: '09:00', close: '17:00', closed: false },
            friday: { open: '09:00', close: '17:00', closed: false },
            saturday: { open: '10:00', close: '16:00', closed: false },
            sunday: { open: '10:00', close: '16:00', closed: false }
        },
        bookingRules: {
            maxAdvanceBooking: 30,
            minAdvanceBooking: 1,
            maxDuration: 8,
            minDuration: 0.5,
            allowRecurring: true,
            maxRecurringInstances: 12
        },
        approvalWorkflow: {
            enabled: true,
            autoApprove: false,
            requireAllApprovers: true,
            escalationTimeout: 72
        }
    });

    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const { addNotification } = useNotification();

    // Predefined event types
    const eventTypes = [
        'Academic',
        'Social',
        'Cultural',
        'Sports',
        'Workshop',
        'Conference',
        'Meeting',
        'Presentation',
        'Performance',
        'Exhibition',
        'Fundraiser',
        'Community Service',
        'Networking',
        'Training',
        'Recreation',
        'Religious',
        'Political',
        'Environmental',
        'Technology',
        'Arts',
        'Music',
        'Theater',
        'Dance',
        'Film',
        'Literature',
        'Science',
        'Research',
        'Career',
        'Health',
        'Wellness',
        'Food',
        'Cooking',
        'Travel',
        'International',
        'Alumni',
        'Graduate',
        'Undergraduate',
        'Faculty',
        'Staff',
        'Public'
    ];

    const validateForm = () => {
        const newErrors = {};

        if (!domainData.name.trim()) {
            newErrors.name = 'Domain name is required';
        }

        if (!domainData.type) {
            newErrors.type = 'Domain type is required';
        }

        if (domainData.maxCapacity && domainData.maxCapacity < 1) {
            newErrors.maxCapacity = 'Maximum capacity must be at least 1';
        }

        if (domainData.bookingRules.maxAdvanceBooking < 1) {
            newErrors.maxAdvanceBooking = 'Maximum advance booking must be at least 1 day';
        }

        if (domainData.bookingRules.minAdvanceBooking < 0) {
            newErrors.minAdvanceBooking = 'Minimum advance booking cannot be negative';
        }

        if (domainData.bookingRules.maxDuration < domainData.bookingRules.minDuration) {
            newErrors.maxDuration = 'Maximum duration must be greater than minimum duration';
        }

        if (domainData.approvalWorkflow.escalationTimeout < 1) {
            newErrors.escalationTimeout = 'Escalation timeout must be at least 1 hour';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleInputChange = (field, value) => {
        setDomainData(prev => ({
            ...prev,
            [field]: value
        }));
        
        // Clear error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({
                ...prev,
                [field]: null
            }));
        }
    };

    const handleNestedInputChange = (parent, field, value) => {
        setDomainData(prev => ({
            ...prev,
            [parent]: {
                ...prev[parent],
                [field]: value
            }
        }));
    };

    const handleOperatingHoursChange = (day, field, value) => {
        setDomainData(prev => ({
            ...prev,
            operatingHours: {
                ...prev.operatingHours,
                [day]: {
                    ...prev.operatingHours[day],
                    [field]: value
                }
            }
        }));
    };

    const handleEventTypeToggle = (type, isAllowed) => {
        if (isAllowed) {
            setDomainData(prev => ({
                ...prev,
                allowedEventTypes: [...prev.allowedEventTypes, type],
                restrictedEventTypes: prev.restrictedEventTypes.filter(t => t !== type)
            }));
        } else {
            setDomainData(prev => ({
                ...prev,
                allowedEventTypes: prev.allowedEventTypes.filter(t => t !== type),
                restrictedEventTypes: [...prev.restrictedEventTypes, type]
            }));
        }
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            addNotification({
                title: 'Validation Error',
                message: 'Please fix the errors before submitting',
                type: 'error'
            });
            return;
        }

        setLoading(true);
        
        try {
            const response = await postRequest('/api/domain', domainData);
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Domain created successfully',
                    type: 'success'
                });
                
                // Reset form
                setDomainData({
                    name: '',
                    type: 'facility',
                    description: '',
                    maxCapacity: null,
                    allowedEventTypes: [],
                    restrictedEventTypes: [],
                    operatingHours: {
                        monday: { open: '09:00', close: '17:00', closed: false },
                        tuesday: { open: '09:00', close: '17:00', closed: false },
                        wednesday: { open: '09:00', close: '17:00', closed: false },
                        thursday: { open: '09:00', close: '17:00', closed: false },
                        friday: { open: '09:00', close: '17:00', closed: false },
                        saturday: { open: '10:00', close: '16:00', closed: false },
                        sunday: { open: '10:00', close: '16:00', closed: false }
                    },
                    bookingRules: {
                        maxAdvanceBooking: 30,
                        minAdvanceBooking: 1,
                        maxDuration: 8,
                        minDuration: 0.5,
                        allowRecurring: true,
                        maxRecurringInstances: 12
                    },
                    approvalWorkflow: {
                        enabled: true,
                        autoApprove: false,
                        requireAllApprovers: true,
                        escalationTimeout: 72
                    }
                });
                setErrors({});
                refetch();
                handleClose();
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to create domain',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error creating domain:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to create domain',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    return (
        <HeaderContainer classN="new-domain" icon="fluent:building-24-filled" header="New Domain" subHeader="create a new domain">
            <div className="header">
                <h2>New Domain</h2>
                <p>create a new domain for event management</p>
            </div>
            <Flag 
                text="Domains represent facilities, departments, organizations, or services that can host events. Each domain has specific settings for capacity, operating hours, booking rules, and approval workflows." 
                primary="rgba(235,226,127,0.32)" 
                accent='#B29F5F' 
                color="#B29F5F" 
                icon={'lets-icons:info-alt-fill'}
            />
            <form onSubmit={onSubmit} className="content">
                {/* Basic Information */}
                <div className="section">
                    <h3>Basic Information</h3>
                    <div className="field">
                        <label htmlFor="domain-name">Domain Name *</label>
                        <input 
                            type="text" 
                            name="domain-name" 
                            id="domain-name" 
                            className="short" 
                            value={domainData.name} 
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder="Enter domain name (e.g., Alumni House, Computer Science Department)"
                        />
                        {errors.name && <span className="error">{errors.name}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="domain-type">Domain Type *</label>
                        <select 
                            name="domain-type" 
                            id="domain-type" 
                            className="short" 
                            value={domainData.type} 
                            onChange={(e) => handleInputChange('type', e.target.value)}
                        >
                            <option value="facility">Facility</option>
                            <option value="department">Department</option>
                            <option value="organization">Organization</option>
                            <option value="service">Service</option>
                        </select>
                        {errors.type && <span className="error">{errors.type}</span>}
                    </div>
                    
                    <div className="field">
                        <label htmlFor="domain-description">Description</label>
                        <textarea 
                            name="domain-description" 
                            id="domain-description" 
                            className="long" 
                            value={domainData.description} 
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder="Describe the domain and its purpose"
                            rows="3"
                        />
                    </div>
                </div>

                {/* Capacity and Event Types */}
                <div className="section">
                    <h3>Capacity and Event Types</h3>
                    <div className="field">
                        <label htmlFor="max-capacity">Maximum Capacity</label>
                        <input 
                            type="number" 
                            name="max-capacity" 
                            id="max-capacity" 
                            className="short" 
                            value={domainData.maxCapacity || ''} 
                            onChange={(e) => handleInputChange('maxCapacity', e.target.value ? parseInt(e.target.value) : null)}
                            placeholder="Maximum number of attendees"
                            min="1"
                        />
                        {errors.maxCapacity && <span className="error">{errors.maxCapacity}</span>}
                    </div>
                    
                    <div className="field">
                        <label>Allowed Event Types</label>
                        <div className="checkbox-group">
                            {eventTypes.map(type => (
                                <label key={type} className="checkbox-item">
                                    <input 
                                        type="checkbox" 
                                        checked={domainData.allowedEventTypes.includes(type)}
                                        onChange={(e) => handleEventTypeToggle(type, e.target.checked)}
                                    />
                                    <span>{type}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Operating Hours */}
                <div className="section">
                    <h3>Operating Hours</h3>
                    <div className="operating-hours">
                        {days.map(day => (
                            <div key={day} className="day-schedule">
                                <div className="day-header">
                                    <label className="day-label">
                                        <input 
                                            type="checkbox" 
                                            checked={!domainData.operatingHours[day].closed}
                                            onChange={(e) => handleOperatingHoursChange(day, 'closed', !e.target.checked)}
                                        />
                                        <span className="day-name">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                                    </label>
                                </div>
                                {!domainData.operatingHours[day].closed && (
                                    <div className="time-inputs">
                                        <input 
                                            type="time" 
                                            value={domainData.operatingHours[day].open}
                                            onChange={(e) => handleOperatingHoursChange(day, 'open', e.target.value)}
                                        />
                                        <span>to</span>
                                        <input 
                                            type="time" 
                                            value={domainData.operatingHours[day].close}
                                            onChange={(e) => handleOperatingHoursChange(day, 'close', e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Booking Rules */}
                <div className="section">
                    <h3>Booking Rules</h3>
                    <div className="field-row">
                        <div className="field">
                            <label htmlFor="max-advance-booking">Max Advance Booking (days)</label>
                            <input 
                                type="number" 
                                name="max-advance-booking" 
                                id="max-advance-booking" 
                                className="short" 
                                value={domainData.bookingRules.maxAdvanceBooking} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'maxAdvanceBooking', parseInt(e.target.value))}
                                min="1"
                            />
                            {errors.maxAdvanceBooking && <span className="error">{errors.maxAdvanceBooking}</span>}
                        </div>
                        
                        <div className="field">
                            <label htmlFor="min-advance-booking">Min Advance Booking (hours)</label>
                            <input 
                                type="number" 
                                name="min-advance-booking" 
                                id="min-advance-booking" 
                                className="short" 
                                value={domainData.bookingRules.minAdvanceBooking} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'minAdvanceBooking', parseInt(e.target.value))}
                                min="0"
                            />
                            {errors.minAdvanceBooking && <span className="error">{errors.minAdvanceBooking}</span>}
                        </div>
                    </div>
                    
                    <div className="field-row">
                        <div className="field">
                            <label htmlFor="min-duration">Min Duration (hours)</label>
                            <input 
                                type="number" 
                                name="min-duration" 
                                id="min-duration" 
                                className="short" 
                                value={domainData.bookingRules.minDuration} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'minDuration', parseFloat(e.target.value))}
                                min="0.5"
                                step="0.5"
                            />
                        </div>
                        
                        <div className="field">
                            <label htmlFor="max-duration">Max Duration (hours)</label>
                            <input 
                                type="number" 
                                name="max-duration" 
                                id="max-duration" 
                                className="short" 
                                value={domainData.bookingRules.maxDuration} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'maxDuration', parseFloat(e.target.value))}
                                min="1"
                                step="0.5"
                            />
                            {errors.maxDuration && <span className="error">{errors.maxDuration}</span>}
                        </div>
                    </div>
                    
                    <div className="field">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={domainData.bookingRules.allowRecurring}
                                onChange={(e) => handleNestedInputChange('bookingRules', 'allowRecurring', e.target.checked)}
                            />
                            <span>Allow recurring events</span>
                        </label>
                    </div>
                    
                    {domainData.bookingRules.allowRecurring && (
                        <div className="field">
                            <label htmlFor="max-recurring">Max Recurring Instances</label>
                            <input 
                                type="number" 
                                name="max-recurring" 
                                id="max-recurring" 
                                className="short" 
                                value={domainData.bookingRules.maxRecurringInstances} 
                                onChange={(e) => handleNestedInputChange('bookingRules', 'maxRecurringInstances', parseInt(e.target.value))}
                                min="1"
                                max="52"
                            />
                        </div>
                    )}
                </div>

                {/* Approval Workflow */}
                <div className="section">
                    <h3>Approval Workflow</h3>
                    <div className="field">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={domainData.approvalWorkflow.enabled}
                                onChange={(e) => handleNestedInputChange('approvalWorkflow', 'enabled', e.target.checked)}
                            />
                            <span>Enable approval workflow for this domain</span>
                        </label>
                    </div>
                    
                    {domainData.approvalWorkflow.enabled && (
                        <>
                            <div className="field">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={domainData.approvalWorkflow.autoApprove}
                                        onChange={(e) => handleNestedInputChange('approvalWorkflow', 'autoApprove', e.target.checked)}
                                    />
                                    <span>Auto-approve events (skip manual approval)</span>
                                </label>
                            </div>
                            
                            <div className="field">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={domainData.approvalWorkflow.requireAllApprovers}
                                        onChange={(e) => handleNestedInputChange('approvalWorkflow', 'requireAllApprovers', e.target.checked)}
                                    />
                                    <span>Require all approvers to approve</span>
                                </label>
                            </div>
                            
                            <div className="field">
                                <label htmlFor="escalation-timeout">Escalation Timeout (hours)</label>
                                <input 
                                    type="number" 
                                    name="escalation-timeout" 
                                    id="escalation-timeout" 
                                    className="short" 
                                    value={domainData.approvalWorkflow.escalationTimeout} 
                                    onChange={(e) => handleNestedInputChange('approvalWorkflow', 'escalationTimeout', parseInt(e.target.value))}
                                    min="1"
                                />
                                {errors.escalationTimeout && <span className="error">{errors.escalationTimeout}</span>}
                            </div>
                        </>
                    )}
                </div>

                <button type="submit" className="submit-button" disabled={loading}>
                    {loading ? 'Creating...' : 'Create Domain'}
                </button>
            </form>
        </HeaderContainer>
    );
};

export default NewDomain;
