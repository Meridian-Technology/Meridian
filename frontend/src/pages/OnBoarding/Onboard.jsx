import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import useAuth from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';
import backgroundImage from '../../assets/LandingBackground.png';
import logo from '../../assets/Brand Image/BEACON.svg';
import './Onboard.scss';

const DEFAULT_INTEREST_OPTIONS = [
    'Computer Science',
    'Gaming',
    'Career',
    'Entrepreneurship',
    'Arts',
    'Music',
    'Sports',
    'Health & Wellness',
    'Community Service',
    'Culture',
    'Academic',
];

function hasNameValue(userLike) {
    return String(userLike?.name || '').trim().length > 0;
}

function hasUsernameValue(userLike) {
    return String(userLike?.username || '').trim().length >= 3;
}

function Onboard() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user, isAuthenticated, isAuthenticating, validateToken } = useAuth();
    const { addNotification } = useNotification();
    const { data: onboardingRes } = useFetch('/org-management/onboarding-config');
    const { data: formConfigRes } = useFetch('/api/event-system-config/form-config');

    const config = onboardingRes?.data || {};
    const previewMode = searchParams.get('preview') === '1';
    const nextPath = searchParams.get('next') || '/events-dashboard';
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [initialUsername, setInitialUsername] = useState('');
    const [selectedInterests, setSelectedInterests] = useState([]);
    const [saving, setSaving] = useState(false);
    const [customResponses, setCustomResponses] = useState({});
    const [completedStepIds, setCompletedStepIds] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [initialStepResolved, setInitialStepResolved] = useState(false);
    const [usernameCheck, setUsernameCheck] = useState({
        checking: false,
        available: true,
        message: '',
    });

    const tagOptions = useMemo(() => {
        const formConfig = formConfigRes?.data?.data ?? formConfigRes?.data ?? {};
        const fields = Array.isArray(formConfig?.fields) ? formConfig.fields : [];
        const tagsField = fields.find((f) => f.name === 'event_tags');
        const configuredOptions = Array.isArray(tagsField?.validation?.options)
            ? tagsField.validation.options
            : Array.isArray(tagsField?.options)
                ? tagsField.options
                : [];
        const cleaned = configuredOptions
            .map((opt) => String(opt || '').trim())
            .filter(Boolean);
        return cleaned.length > 0 ? Array.from(new Set(cleaned)) : DEFAULT_INTEREST_OPTIONS;
    }, [formConfigRes]);

    useEffect(() => {
        if (!previewMode && !isAuthenticating && !isAuthenticated) {
            navigate('/login', { replace: true });
        }
    }, [previewMode, isAuthenticating, isAuthenticated, navigate]);

    useEffect(() => {
        if (!user && !previewMode) return;
        const sourceUser = user || {
            name: 'Preview User',
            username: 'previewuser',
            tags: [],
        };
        setName(sourceUser.name || '');
        const nextUsername = sourceUser.username || '';
        setUsername(nextUsername);
        setInitialUsername(nextUsername);
        setSelectedInterests(Array.isArray(sourceUser.tags) ? sourceUser.tags : []);
        setCustomResponses(
            sourceUser.onboardingResponses && typeof sourceUser.onboardingResponses === 'object'
                ? sourceUser.onboardingResponses
                : {}
        );
        setCompletedStepIds(Array.isArray(sourceUser.onboardingCompletedSteps) ? sourceUser.onboardingCompletedSteps : []);
        setInitialStepResolved(false);
    }, [user, previewMode]);

    useEffect(() => {
        if (!previewMode && !isAuthenticating && onboardingRes?.success && onboardingRes?.data?.enabled === false) {
            navigate(nextPath, { replace: true });
        }
    }, [previewMode, isAuthenticating, onboardingRes, navigate, nextPath]);

    const minInterests = Number(config.minInterests ?? 1);
    const maxInterests = Number(config.maxInterests ?? 6);
    const collectName = config.collectName !== false;
    const collectUsername = true;
    const collectInterests = config.collectInterests !== false;
    const enforceMinInterests = config.enforceMinInterests !== false;
    const enforceMaxInterests = config.enforceMaxInterests !== false;
    const customSteps = Array.isArray(config.customSteps) ? config.customSteps : [];
    const needsNameStep = collectName && !hasNameValue({ name });
    const needsUsernameStep = collectUsername && !hasUsernameValue({ username: initialUsername });
    const steps = useMemo(() => {
        const builtInSteps = [
            ...(needsNameStep
                && !hasNameValue({ name })
                ? [{ id: 'name', type: 'name', label: 'What should we call you?', required: true, helpText: 'This is your display name.' }]
                : []),
            ...(needsUsernameStep
                && !hasUsernameValue({ username: initialUsername })
                ? [{ id: 'username', type: 'username', label: 'Choose a username', required: true, helpText: 'At least 3 characters.' }]
                : []),
            ...(collectInterests
                ? [{
                    id: 'interests',
                    type: 'interests',
                    label: 'Select your interests',
                    required: true,
                    helpText: enforceMinInterests && enforceMaxInterests
                        ? `Pick ${minInterests} to ${maxInterests}.`
                        : enforceMinInterests
                            ? `Pick at least ${minInterests}.`
                            : enforceMaxInterests
                                ? `Pick up to ${maxInterests}.`
                                : `Pick any number of interests.`,
                }]
                : []),
        ];
        const dynamicSteps = customSteps.map((step) => ({ ...step, type: `custom:${step.type || 'short-text'}` }));
        return [...builtInSteps, ...dynamicSteps];
    }, [collectInterests, enforceMinInterests, enforceMaxInterests, minInterests, maxInterests, customSteps, name, initialUsername, needsNameStep, needsUsernameStep]);
    const currentStep = steps[currentStepIndex];
    const stepsSignature = useMemo(
        () => JSON.stringify(steps.map((s) => ({ id: s.id, type: s.type, required: !!s.required }))),
        [steps]
    );

    const isStepCompleted = (step) => {
        if (!step) return true;
        if (step.type === 'name') return hasNameValue({ name });
        if (step.type === 'username') return hasUsernameValue({ username });
        if (step.type === 'interests') {
            if (enforceMinInterests && selectedInterests.length < minInterests) return false;
            if (enforceMaxInterests && selectedInterests.length > maxInterests) return false;
            return true;
        }
        const response = customResponses[step.id];
        const hasResponse = Array.isArray(response) ? response.length > 0 : String(response || '').trim().length > 0;
        const hasAcknowledged = completedStepIds.includes(step.id);
        if (step.required) return hasResponse;
        return hasResponse || hasAcknowledged;
    };

    const toggleInterest = (interest) => {
        setSelectedInterests((prev) => {
            if (prev.includes(interest)) return prev.filter((i) => i !== interest);
            if (enforceMaxInterests && prev.length >= maxInterests) return prev;
            return [...prev, interest];
        });
    };

    const canSubmit =
        (!needsNameStep || hasNameValue({ name })) &&
        (!needsUsernameStep || hasUsernameValue({ username })) &&
        (!collectInterests || (
            (!enforceMinInterests || selectedInterests.length >= minInterests) &&
            (!enforceMaxInterests || selectedInterests.length <= maxInterests)
        )) &&
        steps.every((step) => isStepCompleted(step));

    const isCurrentStepValid = () => {
        if (!currentStep) return false;
        if (currentStep.type === 'name') return hasNameValue({ name });
        if (currentStep.type === 'username') {
            if (!hasUsernameValue({ username })) return false;
            if (String(username || '').trim().toLowerCase() === String(initialUsername || '').trim().toLowerCase()) return true;
            return usernameCheck.available && !usernameCheck.checking;
        }
        if (currentStep.type === 'interests') {
            return (!enforceMinInterests || selectedInterests.length >= minInterests) &&
                (!enforceMaxInterests || selectedInterests.length <= maxInterests);
        }
        const customId = currentStep.id;
        const value = customResponses[customId];
        if (!currentStep.required) return true;
        if (Array.isArray(value)) return value.length > 0;
        return String(value || '').trim().length > 0;
    };

    const updateCustomResponse = (step, value) => {
        if (!step?.id) return;
        setCustomResponses((prev) => ({ ...prev, [step.id]: value }));
    };

    useEffect(() => {
        if (!collectUsername) return;
        const trimmed = String(username || '').trim();
        const initial = String(initialUsername || '').trim();
        if (!hasUsernameValue({ username: trimmed })) {
            setUsernameCheck({
                checking: false,
                available: false,
                message: trimmed.length === 0 ? '' : 'Username must be at least 3 characters.',
            });
            return;
        }
        if (trimmed.toLowerCase() === initial.toLowerCase()) {
            setUsernameCheck({
                checking: false,
                available: true,
                message: 'Using your current username.',
            });
            return;
        }

        let cancelled = false;
        setUsernameCheck({
            checking: true,
            available: false,
            message: 'Checking username...',
        });

        const timer = setTimeout(async () => {
            const response = await apiRequest('/check-username', { username: trimmed }, { method: 'POST' });
            if (cancelled) return;
            if (response?.success) {
                setUsernameCheck({
                    checking: false,
                    available: true,
                    message: 'Username is available.',
                });
                return;
            }
            setUsernameCheck({
                checking: false,
                available: false,
                message: response?.message || 'Username is taken.',
            });
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [username, initialUsername, collectUsername]);

    const submit = async () => {
        const sourceUser = user || {};
        if (!canSubmit || (!sourceUser && !previewMode)) return;
        if (previewMode) {
            addNotification({
                title: 'Preview complete',
                message: 'Custom steps and onboarding layout are rendering correctly.',
                type: 'success',
            });
            return;
        }
        setSaving(true);
        const payload = {
            tags: collectInterests ? selectedInterests : (Array.isArray(sourceUser.tags) ? sourceUser.tags : []),
            onboardingResponses: customResponses,
            onboardingCompletedSteps: Array.from(new Set([...completedStepIds, ...steps.map((s) => s.id)])),
            onboarded: true,
        };
        if (needsNameStep) {
            payload.name = name.trim();
        }
        if (needsUsernameStep) {
            payload.username = username.trim();
        }
        const res = await apiRequest('/update-user', payload, { method: 'POST' });
        setSaving(false);
        if (!res?.success) {
            addNotification({
                title: 'Onboarding update failed',
                message: res?.message || 'Please try again.',
                type: 'error',
            });
            return;
        }
        await validateToken();
        navigate(nextPath, { replace: true });
    };

    const goNext = () => {
        if (!isCurrentStepValid()) return;
        if (currentStep?.id) {
            setCompletedStepIds((prev) => (prev.includes(currentStep.id) ? prev : [...prev, currentStep.id]));
        }
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex((prev) => prev + 1);
            return;
        }
        submit();
    };

    const goBack = () => {
        if (currentStepIndex === 0) return;
        setCurrentStepIndex((prev) => prev - 1);
    };

    const currentStepProgress = steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0;

    const getStepIcon = (step) => {
        if (!step) return 'mdi:flag-checkered';
        if (step.type === 'name') return 'mdi:account-badge-outline';
        if (step.type === 'username') return 'mdi:at';
        if (step.type === 'interests') return 'mdi:star-circle-outline';
        const baseType = String(step.type || '').replace('custom:', '');
        if (baseType === 'long-text') return 'mdi:text-box-outline';
        if (baseType === 'single-select') return 'mdi:format-list-bulleted-square';
        if (baseType === 'multi-select') return 'mdi:checkbox-multiple-marked-circle-outline';
        return 'mdi:form-textbox';
    };

    useEffect(() => {
        if (steps.length === 0 && !saving) {
            submit();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steps.length]);

    useEffect(() => {
        if (!steps.length) return;
        if (initialStepResolved) return;
        const firstMissingIdx = steps.findIndex((step) => !isStepCompleted(step));
        if (firstMissingIdx >= 0) {
            setCurrentStepIndex(firstMissingIdx);
        } else if (!previewMode && !isAuthenticating && onboardingRes?.success) {
            navigate(nextPath, { replace: true });
        }
        setInitialStepResolved(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepsSignature, initialStepResolved, previewMode, isAuthenticating, onboardingRes, nextPath]);

    if (isAuthenticating || (!user && !previewMode)) {
        return <div className="onboard-lite" />;
    }

    return (
        <div className="onboard-lite" style={{ backgroundImage: `url(${backgroundImage})` }}>
            <div className="onboard-lite__overlay" />
            <div className="onboard-lite__content">
                <header className="onboard-lite__header">
                    <img src={logo} alt="Meridian" />
                    <h1>{config.welcomeTitle || 'Welcome to your community'}</h1>
                    <p>{config.welcomeSubtitle || 'Tell us a little about yourself to personalize your experience.'}</p>
                </header>

                <div className="onboard-lite__progress">
                    <div className="onboard-lite__meta">
                        Step {steps.length === 0 ? 0 : currentStepIndex + 1} of {steps.length}
                    </div>
                    <div className="onboard-lite__track">
                        <div className="onboard-lite__track-fill" style={{ width: `${currentStepProgress}%` }} />
                    </div>
                </div>
                <div className="onboard-lite__card">
                    <div className="onboard-lite__question-shell" key={currentStep?.id || 'step'}>
                        <div className="onboard-lite__question-icon">
                            <Icon icon={getStepIcon(currentStep)} />
                        </div>
                        <div className="onboard-lite__question-content">
                    {currentStep?.type === 'name' && (
                        <label className="onboard-lite__field">
                            <span>{currentStep.label}</span>
                            {currentStep.helpText ? <small>{currentStep.helpText}</small> : null}
                            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                        </label>
                    )}
                    {currentStep?.type === 'username' && (
                        <label className="onboard-lite__field">
                            <span>{currentStep.label}</span>
                            {currentStep.helpText ? <small>{currentStep.helpText}</small> : null}
                            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
                            {usernameCheck.message ? (
                                <small className={`onboard-lite__username-status ${usernameCheck.available ? 'is-ok' : 'is-error'}`}>
                                    {usernameCheck.message}
                                </small>
                            ) : null}
                        </label>
                    )}
                    {currentStep?.type === 'interests' && (
                        <div className="onboard-lite__interests">
                            <p className="onboard-lite__interests-title">{currentStep.label}</p>
                            {currentStep.helpText ? <p className="onboard-lite__interests-sub">{currentStep.helpText}</p> : null}
                            <div className="onboard-lite__chips">
                                {tagOptions.map((tag) => {
                                    const active = selectedInterests.includes(tag);
                                    return (
                                        <button
                                            type="button"
                                            key={tag}
                                            className={`onboard-lite__chip ${active ? 'is-active' : ''}`}
                                            onClick={() => toggleInterest(tag)}
                                        >
                                            {active ? <Icon icon="mdi:check-circle" /> : <Icon icon="mdi:circle-outline" />}
                                            {tag}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {currentStep?.type?.startsWith('custom:') && (() => {
                        const value = customResponses[currentStep.id];
                        const options = Array.isArray(currentStep.options) ? currentStep.options : [];
                        const baseType = (currentStep.type || '').replace('custom:', '');
                        return (
                            <div className="onboard-lite__custom-step">
                                <p className="onboard-lite__interests-title">
                                    {currentStep.label}
                                    {currentStep.required && <span className="onboard-lite__required"> *</span>}
                                </p>
                                {currentStep.helpText ? <p className="onboard-lite__interests-sub">{currentStep.helpText}</p> : null}
                                {baseType === 'long-text' && (
                                    <textarea
                                        value={value || ''}
                                        onChange={(e) => updateCustomResponse(currentStep, e.target.value)}
                                        placeholder={currentStep.placeholder || ''}
                                        rows={4}
                                    />
                                )}
                                {baseType === 'single-select' && (
                                    <div className="onboard-lite__option-grid">
                                        {options.map((opt) => {
                                            const selected = value === opt;
                                            return (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    className={`onboard-lite__option-card ${selected ? 'is-active' : ''}`}
                                                    onClick={() => updateCustomResponse(currentStep, opt)}
                                                >
                                                    <span>{opt}</span>
                                                    <Icon icon={selected ? 'mdi:check-circle' : 'mdi:circle-outline'} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {baseType === 'multi-select' && (
                                    <div className="onboard-lite__chips">
                                        {options.map((opt) => {
                                            const selected = Array.isArray(value) ? value.includes(opt) : false;
                                            return (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    className={`onboard-lite__chip ${selected ? 'is-active' : ''}`}
                                                    onClick={() => {
                                                        const current = Array.isArray(value) ? value : [];
                                                        updateCustomResponse(
                                                            currentStep,
                                                            selected ? current.filter((v) => v !== opt) : [...current, opt]
                                                        );
                                                    }}
                                                >
                                                    {selected ? <Icon icon="mdi:check-circle" /> : <Icon icon="mdi:circle-outline" />}
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {(baseType === 'short-text' || !baseType) && (
                                    <input
                                        value={value || ''}
                                        onChange={(e) => updateCustomResponse(currentStep, e.target.value)}
                                        placeholder={currentStep.placeholder || ''}
                                    />
                                )}
                            </div>
                        );
                    })()}
                        </div>
                    </div>
                    <div className="onboard-lite__actions">
                        <button type="button" className="onboard-lite__secondary" onClick={goBack} disabled={currentStepIndex === 0 || saving}>
                            Back
                        </button>
                        <button
                            type="button"
                            className="onboard-lite__submit"
                            onClick={goNext}
                            disabled={saving || !isCurrentStepValid() || (currentStepIndex === steps.length - 1 && !canSubmit)}
                        >
                            {saving ? 'Saving...' : currentStepIndex === steps.length - 1 ? 'Finish onboarding' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Onboard;