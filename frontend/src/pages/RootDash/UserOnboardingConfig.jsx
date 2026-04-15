import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { useGradient } from '../../hooks/useGradient';
import SettingsList from '../../components/SettingsList/SettingsList';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import UnsavedChangesBanner from '../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import './UserOnboardingConfig.scss';

const DEFAULT_ONBOARDING = {
    enabled: false,
    welcomeTitle: 'Welcome to your community',
    welcomeSubtitle:
        'A quick setup helps community managers and campus admins better support your interests.',
    collectName: true,
    collectInterests: true,
    enforceMinInterests: true,
    enforceMaxInterests: true,
    minInterests: 1,
    maxInterests: 6,
    customSteps: [],
};

function UserOnboardingConfig() {
    const { data, loading, error, refetch } = useFetch('/org-management/config');
    const { AdminGrad } = useGradient();
    const [selectedStepId, setSelectedStepId] = useState(null);
    const configOnboarding = data?.data?.userOnboarding || {};
    const onboarding = useMemo(
        () => ({ ...DEFAULT_ONBOARDING, ...configOnboarding, customSteps: configOnboarding.customSteps || [] }),
        [configOnboarding]
    );
    const [local, setLocal] = useState(null);
    const [originalLocal, setOriginalLocal] = useState(null);

    React.useEffect(() => {
        const next = JSON.parse(JSON.stringify(onboarding));
        setLocal(next);
        setOriginalLocal(next);
    }, [onboarding.enabled, onboarding.welcomeTitle, onboarding.welcomeSubtitle, onboarding.collectName, onboarding.collectInterests, onboarding.enforceMinInterests, onboarding.enforceMaxInterests, onboarding.minInterests, onboarding.maxInterests, JSON.stringify(onboarding.customSteps)]);

    const updateField = (key, value) => setLocal((prev) => ({ ...(prev || DEFAULT_ONBOARDING), [key]: value }));
    const customSteps = Array.isArray(local?.customSteps) ? local.customSteps : [];
    const selectedStep = customSteps.find((step) => step.id === selectedStepId) || null;

    const addStep = () => {
        const step = {
            id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            label: 'New onboarding question',
            type: 'short-text',
            required: false,
            options: [],
            placeholder: '',
            helpText: '',
        };
        updateField('customSteps', [...customSteps, step]);
        setSelectedStepId(step.id);
    };

    const updateStep = (id, key, value) => {
        updateField('customSteps', customSteps.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
    };

    const removeStep = (id) => {
        const next = customSteps.filter((s) => s.id !== id);
        updateField('customSteps', next);
        if (selectedStepId === id) {
            setSelectedStepId(next[0]?.id || null);
        }
    };

    const moveStep = (id, direction) => {
        const idx = customSteps.findIndex((s) => s.id === id);
        if (idx < 0) return;
        const target = direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= customSteps.length) return;
        const next = [...customSteps];
        const [item] = next.splice(idx, 1);
        next.splice(target, 0, item);
        updateField('customSteps', next);
    };

    const save = async () => {
        if (!local) return;
        const response = await apiRequest('/org-management/config', { userOnboarding: local }, { method: 'PUT' });
        if (response?.success) {
            const snapshot = JSON.parse(JSON.stringify(local));
            setOriginalLocal(snapshot);
            refetch();
            return true;
        }
        return false;
    };

    const discard = () => {
        if (!originalLocal) return;
        setLocal(JSON.parse(JSON.stringify(originalLocal)));
    };

    const {
        hasChanges,
        saving,
        handleSave: handleUnsavedSave,
        handleDiscard: handleUnsavedDiscard,
    } = useUnsavedChanges(originalLocal, local, save, discard);

    React.useEffect(() => {
        if (!selectedStepId && customSteps.length > 0) {
            setSelectedStepId(customSteps[0].id);
        }
    }, [selectedStepId, customSteps]);

    if (loading || !local) {
        return <div className="dash user-onboarding-config">Loading onboarding settings...</div>;
    }

    if (error) {
        return <div className="dash user-onboarding-config">Unable to load onboarding settings.</div>;
    }

    const flowSettingItems = [
        {
            title: 'Enable onboarding',
            subtitle: 'Show onboarding to users when they have missing required/new steps.',
            action: (
                <input
                    type="checkbox"
                    checked={!!local.enabled}
                    onChange={(e) => updateField('enabled', e.target.checked)}
                />
            ),
        },
        {
            title: 'Collect full name',
            subtitle: 'Require users to provide a display name step.',
            action: (
                <input
                    type="checkbox"
                    checked={local.collectName !== false}
                    onChange={(e) => updateField('collectName', e.target.checked)}
                />
            ),
        },
        {
            title: 'Collect interests',
            subtitle: 'Show Event Tags as selectable interests.',
            action: (
                <input
                    type="checkbox"
                    checked={local.collectInterests !== false}
                    onChange={(e) => updateField('collectInterests', e.target.checked)}
                />
            ),
        },
        {
            title: 'Enforce minimum interests',
            subtitle: 'When disabled, users can continue with zero interests.',
            action: (
                <input
                    type="checkbox"
                    checked={local.enforceMinInterests !== false}
                    onChange={(e) => updateField('enforceMinInterests', e.target.checked)}
                />
            ),
        },
        {
            title: 'Enforce maximum interests',
            subtitle: 'When disabled, interest selection is unbounded.',
            action: (
                <input
                    type="checkbox"
                    checked={local.enforceMaxInterests !== false}
                    onChange={(e) => updateField('enforceMaxInterests', e.target.checked)}
                />
            ),
        },
        {
            title: 'Minimum interests',
            subtitle: 'Minimum number of interests required when enabled.',
            action: (
                <input
                    type="number"
                    min="0"
                    value={local.minInterests ?? 1}
                    disabled={local.enforceMinInterests === false}
                    onChange={(e) => updateField('minInterests', parseInt(e.target.value, 10) || 0)}
                />
            ),
        },
        {
            title: 'Maximum interests',
            subtitle: 'Maximum number of interests users may select.',
            action: (
                <input
                    type="number"
                    min="1"
                    value={local.maxInterests ?? 6}
                    disabled={local.enforceMaxInterests === false}
                    onChange={(e) => updateField('maxInterests', parseInt(e.target.value, 10) || 1)}
                />
            ),
        },
        {
            title: 'Welcome title',
            subtitle: 'Main heading for the onboarding experience.',
            action: (
                <input
                    type="text"
                    value={local.welcomeTitle || ''}
                    onChange={(e) => updateField('welcomeTitle', e.target.value)}
                />
            ),
        },
        {
            title: 'Welcome subtitle',
            subtitle: 'Supporting text shown under the title.',
            action: (
                <input
                    type="text"
                    value={local.welcomeSubtitle || ''}
                    onChange={(e) => updateField('welcomeSubtitle', e.target.value)}
                />
            ),
        },
    ];

    return (
        <div className="dash user-onboarding-config">
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={handleUnsavedSave}
                onDiscard={handleUnsavedDiscard}
                saving={saving}
                saveText="Save onboarding settings"
                discardText="Reset changes"
            />
            <header className="header">
                <img src={AdminGrad} alt="" />
                <h1>User onboarding</h1>
                <p>Configure the onboarding flow for all new and non-onboarded users.</p>
            </header>

            <section className="user-onboarding-config__card">
                <div className="user-onboarding-config__section-head">
                    <h2>Flow settings</h2>
                    <div className="user-onboarding-config__actions">
                        <button type="button" onClick={() => window.open('/onboard?preview=1', '_blank', 'noopener,noreferrer')}>
                            <Icon icon="mdi:eye-outline" /> Preview onboarding flow
                        </button>
                    </div>
                </div>
                <SettingsList items={flowSettingItems} />
            </section>

            <section className="user-onboarding-config__card user-onboarding-config__builder">
                <div className="user-onboarding-config__row">
                    <h2>Custom onboarding steps</h2>
                    <button type="button" onClick={addStep}><Icon icon="mdi:plus" /> Add step</button>
                </div>
                <div className="user-onboarding-config__builder-layout">
                    <div className="user-onboarding-config__steps-list">
                        {customSteps.length === 0 && (
                            <div className="user-onboarding-config__empty">No steps yet. Click “Add step” to start building.</div>
                        )}
                        {customSteps.map((step, idx) => (
                            <button
                                key={step.id}
                                type="button"
                                className={`user-onboarding-config__step-item ${selectedStepId === step.id ? 'is-active' : ''}`}
                                onClick={() => setSelectedStepId(step.id)}
                            >
                                <span className="user-onboarding-config__step-order">{idx + 1}</span>
                                <span className="user-onboarding-config__step-main">
                                    <strong>{step.label || 'Untitled step'}</strong>
                                    <small>{step.type || 'short-text'}{step.required ? ' • required' : ''}</small>
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="user-onboarding-config__step-editor">
                        {!selectedStep ? (
                            <div className="user-onboarding-config__empty">Select a step from the left to edit it.</div>
                        ) : (
                            <>
                                <div className="user-onboarding-config__editor-actions">
                                    <button type="button" onClick={() => moveStep(selectedStep.id, 'up')}><Icon icon="mdi:arrow-up" /> Move up</button>
                                    <button type="button" onClick={() => moveStep(selectedStep.id, 'down')}><Icon icon="mdi:arrow-down" /> Move down</button>
                                    <button type="button" className="danger" onClick={() => removeStep(selectedStep.id)}><Icon icon="mdi:delete-outline" /> Remove</button>
                                </div>
                                <label>Question title<input type="text" value={selectedStep.label || ''} onChange={(e) => updateStep(selectedStep.id, 'label', e.target.value)} /></label>
                                <label>Response type
                                    <select value={selectedStep.type || 'short-text'} onChange={(e) => updateStep(selectedStep.id, 'type', e.target.value)}>
                                        <option value="short-text">Short text</option>
                                        <option value="long-text">Long text</option>
                                        <option value="single-select">Single select (one choice)</option>
                                        <option value="multi-select">Multi select (multiple choices)</option>
                                    </select>
                                </label>
                                <label>Help text (optional)<input type="text" value={selectedStep.helpText || ''} onChange={(e) => updateStep(selectedStep.id, 'helpText', e.target.value)} /></label>
                                <label>Placeholder (optional)<input type="text" value={selectedStep.placeholder || ''} onChange={(e) => updateStep(selectedStep.id, 'placeholder', e.target.value)} /></label>
                                {(selectedStep.type === 'single-select' || selectedStep.type === 'multi-select') && (
                                    <label>Options (comma separated)
                                        <input
                                            type="text"
                                            value={Array.isArray(selectedStep.options) ? selectedStep.options.join(', ') : ''}
                                            onChange={(e) =>
                                                updateStep(
                                                    selectedStep.id,
                                                    'options',
                                                    e.target.value.split(',').map((o) => o.trim()).filter(Boolean)
                                                )
                                            }
                                        />
                                    </label>
                                )}
                                <label><input type="checkbox" checked={!!selectedStep.required} onChange={(e) => updateStep(selectedStep.id, 'required', e.target.checked)} /> Required question</label>
                            </>
                        )}
                    </div>
                </div>
            </section>

        </div>
    );
}

export default UserOnboardingConfig;
