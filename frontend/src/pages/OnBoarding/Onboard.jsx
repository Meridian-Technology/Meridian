import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../NotificationContext';
import { useError } from '../../ErrorContext';
import useAuth from '../../hooks/useAuth';
import {
    getOnboardingConfig,
    searchOnboardingProfiles,
    submitOnboarding,
} from './OnboardHelpers';
import './Onboard.scss';

function isValuePresent(value) {
    if (value == null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function Onboard() {
    const [start, setStart] = useState(false);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [steps, setSteps] = useState([]);
    const [responses, setResponses] = useState({});
    const [pictureFile, setPictureFile] = useState(null);
    const [orgSearchQuery, setOrgSearchQuery] = useState('');
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [orgResults, setOrgResults] = useState([]);
    const [friendResults, setFriendResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState({ orgs: false, users: false });
    const [searchError, setSearchError] = useState('');
    const [configError, setConfigError] = useState('');

    const { isAuthenticated, isAuthenticating, user, validateToken } = useAuth();
    const { addNotification } = useNotification();
    const { newError } = useError();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/events-dashboard';

    useEffect(() => {
        const timer = setTimeout(() => setStart(true), 200);
        return () => clearTimeout(timer);
    }, []);

    const onboardingStepKeys = useMemo(() => new Set(steps.map((step) => step.key)), [steps]);

    useEffect(() => {
        if (isAuthenticating) return;
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        if (user?.onboarded) {
            navigate(from, { replace: true });
        }
    }, [from, isAuthenticated, isAuthenticating, navigate, user]);

    useEffect(() => {
        if (!isAuthenticated || !user || user.onboarded) return;
        let cancelled = false;
        async function loadConfig() {
            setLoadingConfig(true);
            setConfigError('');
            try {
                const payload = await getOnboardingConfig();
                if (cancelled) return;
                if (!payload?.success) {
                    throw new Error(payload?.message || 'Failed to load onboarding config');
                }
                const nextSteps = Array.isArray(payload?.data?.steps) ? payload.data.steps : [];
                setSteps(nextSteps);
                const seededResponses = {};
                if (user.name) seededResponses.name = user.name;
                if (user.username) seededResponses.username = user.username;
                setResponses((prev) => ({ ...seededResponses, ...prev }));
            } catch (error) {
                if (cancelled) return;
                setConfigError(error.message || 'Failed to load onboarding config');
            } finally {
                if (!cancelled) {
                    setLoadingConfig(false);
                }
            }
        }
        loadConfig();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, user]);

    const currentStep = steps[currentStepIndex] || null;

    const stepErrors = useMemo(() => {
        if (!currentStep) return [];
        const errors = [];
        const value = responses[currentStep.key];
        if (currentStep.required && !isValuePresent(value) && currentStep.type !== 'picture_upload') {
            errors.push('This step is required.');
        }
        if (currentStep.type === 'single_select' && isValuePresent(value) && typeof value !== 'string') {
            errors.push('Select one option.');
        }
        if (currentStep.type === 'multi_select' && isValuePresent(value) && !Array.isArray(value)) {
            errors.push('Choose one or more options.');
        }
        if (currentStep.type === 'number' && isValuePresent(value)) {
            const num = Number(value);
            if (!Number.isFinite(num)) {
                errors.push('Enter a valid number.');
            }
        }
        return errors;
    }, [currentStep, responses]);

    const canContinue = useMemo(() => {
        if (!currentStep) return false;
        if (stepErrors.length > 0) return false;
        if (!currentStep.required) return true;
        if (currentStep.type === 'picture_upload') {
            return true;
        }
        return isValuePresent(responses[currentStep.key]);
    }, [currentStep, responses, stepErrors]);

    const completedCount = useMemo(() => {
        return steps.filter((step) => {
            if (step.type === 'picture_upload') return Boolean(pictureFile) || Boolean(user?.picture);
            return isValuePresent(responses[step.key]);
        }).length;
    }, [steps, responses, pictureFile, user?.picture]);

    const handleResponseChange = useCallback((key, value) => {
        setResponses((prev) => ({
            ...prev,
            [key]: value,
        }));
    }, []);

    const handleOptionToggle = useCallback((key, value) => {
        setResponses((prev) => {
            const current = Array.isArray(prev[key]) ? prev[key] : [];
            const has = current.includes(value);
            return {
                ...prev,
                [key]: has ? current.filter((entry) => entry !== value) : [...current, value],
            };
        });
    }, []);

    const searchEntities = useCallback(async (type, query) => {
        setSearchError('');
        setSearchLoading((prev) => ({ ...prev, [type]: true }));
        try {
            const result = await searchOnboardingProfiles(type, query);
            if (result?.success) {
                if (type === 'orgs') {
                    setOrgResults(Array.isArray(result.data) ? result.data : []);
                } else {
                    setFriendResults(Array.isArray(result.data) ? result.data : []);
                }
            } else {
                setSearchError(result?.message || 'Search failed');
            }
        } catch (error) {
            setSearchError(error.message || 'Search failed');
        } finally {
            setSearchLoading((prev) => ({ ...prev, [type]: false }));
        }
    }, []);

    useEffect(() => {
        if (!steps.some((step) => step.type === 'template_follow_orgs')) return;
        const timer = setTimeout(() => {
            searchEntities('orgs', orgSearchQuery);
        }, 250);
        return () => clearTimeout(timer);
    }, [orgSearchQuery, searchEntities, steps]);

    useEffect(() => {
        if (!steps.some((step) => step.type === 'template_add_friends')) return;
        const timer = setTimeout(() => {
            searchEntities('users', friendSearchQuery);
        }, 250);
        return () => clearTimeout(timer);
    }, [friendSearchQuery, searchEntities, steps]);

    const handleSubmit = useCallback(async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const filteredResponses = Object.keys(responses).reduce((acc, key) => {
                if (!onboardingStepKeys.has(key)) return acc;
                const value = responses[key];
                if (!isValuePresent(value)) return acc;
                acc[key] = value;
                return acc;
            }, {});
            const result = await submitOnboarding({ responses: filteredResponses, pictureFile });
            if (!result?.success) {
                throw new Error(result?.message || 'Failed to complete onboarding');
            }
            await validateToken();
            addNotification({
                title: 'Onboarding complete',
                message: 'Your profile has been personalized.',
                type: 'success',
            });
            navigate(from, { replace: true });
        } catch (error) {
            newError(error, navigate);
        } finally {
            setSubmitting(false);
        }
    }, [addNotification, from, navigate, newError, onboardingStepKeys, pictureFile, responses, submitting, validateToken]);

    const renderStepContent = () => {
        if (!currentStep) return null;
        const value = responses[currentStep.key];
        if (currentStep.type === 'short_text') {
            return (
                <input
                    type="text"
                    className="onboard-input"
                    placeholder={currentStep.placeholder || 'Type your answer'}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => handleResponseChange(currentStep.key, event.target.value)}
                />
            );
        }
        if (currentStep.type === 'long_text') {
            return (
                <textarea
                    className="onboard-input onboard-textarea"
                    placeholder={currentStep.placeholder || 'Type your answer'}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => handleResponseChange(currentStep.key, event.target.value)}
                />
            );
        }
        if (currentStep.type === 'number') {
            return (
                <input
                    type="number"
                    className="onboard-input"
                    placeholder={currentStep.placeholder || 'Enter a number'}
                    value={value ?? ''}
                    onChange={(event) => handleResponseChange(currentStep.key, event.target.value)}
                />
            );
        }
        if (currentStep.type === 'single_select') {
            return (
                <div className="onboard-chip-list">
                    {(currentStep.options || []).map((option) => (
                        <button
                            type="button"
                            key={option.value}
                            className={`onboard-chip ${value === option.value ? 'selected' : ''}`}
                            onClick={() => handleResponseChange(currentStep.key, option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            );
        }
        if (currentStep.type === 'multi_select') {
            const selectedValues = Array.isArray(value) ? value : [];
            return (
                <div className="onboard-chip-list">
                    {(currentStep.options || []).map((option) => (
                        <button
                            type="button"
                            key={option.value}
                            className={`onboard-chip ${selectedValues.includes(option.value) ? 'selected' : ''}`}
                            onClick={() => handleOptionToggle(currentStep.key, option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            );
        }
        if (currentStep.type === 'picture_upload') {
            return (
                <div className="onboard-picture-upload">
                    <label className="onboard-picture-input">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                                const file = event.target.files?.[0] || null;
                                setPictureFile(file);
                            }}
                        />
                        <span>{pictureFile ? pictureFile.name : 'Choose a profile picture'}</span>
                    </label>
                    {(pictureFile || user?.picture) && (
                        <p className="helper">
                            {pictureFile ? 'New image selected. It will upload on submit.' : 'Current profile image will be kept.'}
                        </p>
                    )}
                </div>
            );
        }
        if (currentStep.type === 'template_follow_orgs') {
            const selected = Array.isArray(value) ? value : [];
            return (
                <div className="onboard-template-step">
                    <input
                        type="text"
                        className="onboard-input"
                        placeholder="Search organizations"
                        value={orgSearchQuery}
                        onChange={(event) => setOrgSearchQuery(event.target.value)}
                    />
                    {searchLoading.orgs && <p className="helper">Searching organizations...</p>}
                    <div className="onboard-search-list">
                        {orgResults.map((org) => (
                            <button
                                type="button"
                                key={org._id}
                                className={`onboard-search-item ${selected.includes(org._id) ? 'selected' : ''}`}
                                onClick={() => {
                                    const has = selected.includes(org._id);
                                    const next = has ? selected.filter((id) => id !== org._id) : [...selected, org._id];
                                    handleResponseChange(currentStep.key, next);
                                }}
                            >
                                <span className="title">{org.name}</span>
                                {org.description && <span className="subtitle">{org.description}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        if (currentStep.type === 'template_add_friends') {
            const selected = Array.isArray(value) ? value : [];
            return (
                <div className="onboard-template-step">
                    <input
                        type="text"
                        className="onboard-input"
                        placeholder="Search users"
                        value={friendSearchQuery}
                        onChange={(event) => setFriendSearchQuery(event.target.value)}
                    />
                    {searchLoading.users && <p className="helper">Searching users...</p>}
                    <div className="onboard-search-list">
                        {friendResults.map((person) => (
                            <button
                                type="button"
                                key={person._id}
                                className={`onboard-search-item ${selected.includes(person._id) ? 'selected' : ''}`}
                                onClick={() => {
                                    const has = selected.includes(person._id);
                                    const next = has ? selected.filter((id) => id !== person._id) : [...selected, person._id];
                                    handleResponseChange(currentStep.key, next);
                                }}
                            >
                                <span className="title">{person.name || person.username}</span>
                                <span className="subtitle">@{person.username}</span>
                            </button>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    if (isAuthenticating || loadingConfig) {
        return (
            <div className={`onboard onboard-v2 ${start ? 'visible' : ''}`}>
                <div className="onboard-shell">
                    <p>Loading onboarding...</p>
                </div>
            </div>
        );
    }

    if (configError) {
        return (
            <div className={`onboard onboard-v2 ${start ? 'visible' : ''}`}>
                <div className="onboard-shell">
                    <h2>Unable to load onboarding</h2>
                    <p>{configError}</p>
                    <button type="button" onClick={() => navigate('/events-dashboard')}>
                        Back to dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (!currentStep) {
        return (
            <div className={`onboard onboard-v2 ${start ? 'visible' : ''}`}>
                <div className="onboard-shell">
                    <h2>Ready to finish onboarding?</h2>
                    <p>We’ll personalize your experience with the choices you already made.</p>
                    <button type="button" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Finishing...' : 'Finish onboarding'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`onboard onboard-v2 ${start ? 'visible' : ''}`}>
            <div className="onboard-shell">
                <header className="onboard-header">
                    <p className="kicker">Personalize your account</p>
                    <h2>{currentStep.title}</h2>
                    {currentStep.description && <p className="description">{currentStep.description}</p>}
                </header>

                <div className="onboard-progress">
                    <p>{completedCount} of {steps.length} steps completed</p>
                    <div className="bar">
                        <span style={{ width: `${Math.max((completedCount / Math.max(steps.length, 1)) * 100, 8)}%` }} />
                    </div>
                </div>

                {renderStepContent()}

                {searchError && <p className="error-text">{searchError}</p>}
                {stepErrors.length > 0 && <p className="error-text">{stepErrors[0]}</p>}

                <div className="onboard-actions">
                    <button
                        type="button"
                        className="secondary"
                        onClick={() => setCurrentStepIndex((prev) => Math.max(prev - 1, 0))}
                        disabled={currentStepIndex === 0}
                    >
                        <Icon icon="ep:arrow-left" />
                        Back
                    </button>
                    {currentStepIndex < steps.length - 1 ? (
                        <button
                            type="button"
                            className="primary"
                            onClick={() => setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1))}
                            disabled={!canContinue}
                        >
                            Next
                            <Icon icon="ep:arrow-right" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="primary"
                            onClick={handleSubmit}
                            disabled={!canContinue || submitting}
                        >
                            {submitting ? 'Saving...' : 'Complete onboarding'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Onboard;
