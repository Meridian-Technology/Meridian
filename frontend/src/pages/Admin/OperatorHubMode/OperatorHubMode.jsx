import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import './OperatorHubMode.scss';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import { useNotification } from '../../../NotificationContext';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';
import Popup from '../../../components/Popup/Popup';

const MODES = [
    {
        value: 'classic',
        title: 'Classic',
        description:
            'Full root dashboard with Compass, Atlas, and Beacon as separate operator apps. Best for large institutions with formal governance and stakeholder workflows.',
    },
    {
        value: 'engagement_hub',
        title: 'Community organizer',
        description:
            'Root dashboard becomes the home for community operators: one command center for programs, groups, insights, spaces, and event experience—without Atlas-first navigation.',
    },
];

/** Applied only when enabling Community organizer and the admin opts in (explicit PUT). */
const SUGGESTED_COMMUNITY_DEFAULTS = {
    orgApproval: {
        mode: 'none',
        autoApproveMemberThreshold: 5,
    },
    allowedRequestTypes: ['verification'],
    verificationRequired: false,
};

/** User must type this exactly (trimmed) to confirm a tenant mode switch. */
const CONFIRM_TYPE_PHRASE = 'UPDATE TENANT MODE';

/**
 * @param {'community_with_defaults' | 'community_layout' | 'classic'} variant
 */
function OperatorHubSwitchConfirmModal({
    handleClose = () => {},
    variant,
    typedPhrase,
    setTypedPhrase,
    phraseError,
    setPhraseError,
    saving,
    onConfirm,
}) {
    const inputRef = useRef(null);

    useEffect(() => {
        setPhraseError('');
        inputRef.current?.focus();
    }, [variant, setPhraseError]);

    const handleSubmit = async () => {
        if (typedPhrase.trim() !== CONFIRM_TYPE_PHRASE) {
            setPhraseError(`Type exactly: ${CONFIRM_TYPE_PHRASE}`);
            return;
        }
        setPhraseError('');
        const success = await onConfirm();
        if (success) {
            handleClose();
        }
    };

    let title = 'Confirm switch';
    let body = null;

    if (variant === 'community_with_defaults') {
        title = 'Turn on Community organizer with defaults';
        body = (
            <>
                <p>
                    This turns on Community organizer <strong>and</strong> applies suggested low-ceremony defaults on this
                    tenant: org approval → none, allowed request types → verification only, verification required → off
                    (plus preset thresholds).
                </p>
                <p>
                    If you later switch back to Classic, only the root dashboard layout is restored. Those org-management
                    fields are <strong>not</strong> reverted automatically—you must change them under org management
                    configuration if needed.
                </p>
            </>
        );
    } else if (variant === 'community_layout') {
        title = 'Turn on Community organizer';
        body = (
            <p>
                This only changes how <code>/root-dashboard</code> works for operators (unified shell). You can switch
                back to Classic anytime; that toggles the layout flag only.
            </p>
        );
    } else {
        title = 'Switch to Classic';
        body = (
            <>
                <p>
                    Restores the previous root operator layout (Compass / Atlas / Beacon) and feature-admin entry points.
                </p>
                <p>
                    If you previously used Community organizer with <strong>suggested defaults</strong>, switching to
                    Classic does <strong>not</strong> undo org approval, allowed request types, or verification-required
                    settings.
                </p>
            </>
        );
    }

    return (
        <div className="operator-hub-mode__confirm">
            <h2 className="operator-hub-mode__confirm-title">{title}</h2>
            <div className="operator-hub-mode__confirm-body">{body}</div>
            <label className="operator-hub-mode__confirm-label" htmlFor="operator-hub-confirm-phrase">
                Type <kbd className="operator-hub-mode__confirm-kbd">{CONFIRM_TYPE_PHRASE}</kbd> to confirm
            </label>
            <input
                id="operator-hub-confirm-phrase"
                ref={inputRef}
                type="text"
                className="operator-hub-mode__confirm-input"
                value={typedPhrase}
                onChange={(e) => {
                    setTypedPhrase(e.target.value);
                    if (phraseError) setPhraseError('');
                }}
                autoComplete="off"
                spellCheck={false}
                disabled={saving}
            />
            {phraseError ? (
                <p className="operator-hub-mode__confirm-error" role="alert">
                    {phraseError}
                </p>
            ) : null}
            <div className="operator-hub-mode__confirm-actions">
                <button type="button" className="operator-hub-mode__confirm-btn secondary" onClick={handleClose} disabled={saving}>
                    Cancel
                </button>
                <button type="button" className="operator-hub-mode__confirm-btn primary" onClick={handleSubmit} disabled={saving}>
                    {saving ? (
                        <>
                            <Icon icon="mdi:loading" className="spin" /> Saving…
                        </>
                    ) : (
                        'Confirm change'
                    )}
                </button>
            </div>
        </div>
    );
}

function OperatorHubMode() {
    const { addNotification } = useNotification();
    const [saving, setSaving] = useState(false);
    const [applySuggestedDefaults, setApplySuggestedDefaults] = useState(false);
    const [confirmVariant, setConfirmVariant] = useState(null);
    const [typedPhrase, setTypedPhrase] = useState('');
    const [phraseError, setPhraseError] = useState('');
    const { data: configData, refetch, loading } = useFetch('/org-management/config');
    const config = configData?.data;
    const current = config?.operatorDashboardMode === 'engagement_hub' ? 'engagement_hub' : 'classic';

    const closeConfirmModal = () => {
        setConfirmVariant(null);
        setTypedPhrase('');
        setPhraseError('');
    };

    /** @returns {Promise<boolean>} */
    const runSwitch = async (value, withDefaults) => {
        setSaving(true);
        try {
            const payload =
                value === 'engagement_hub' && withDefaults
                    ? { operatorDashboardMode: value, ...SUGGESTED_COMMUNITY_DEFAULTS }
                    : { operatorDashboardMode: value };

            const res = await apiRequest('/org-management/config', payload, { method: 'PUT' });
            if (res?.success) {
                addNotification({
                    title: 'Saved',
                    message:
                        value === 'engagement_hub' && withDefaults
                            ? 'Community organizer mode is on, with suggested low-ceremony defaults applied.'
                            : value === 'engagement_hub'
                              ? 'Community organizer layout updated for this institution.'
                              : 'Classic root operator layout restored.',
                    type: 'success',
                });
                refetch();
                if (value === 'classic') {
                    setApplySuggestedDefaults(false);
                }
                return true;
            }
            addNotification({
                title: 'Error',
                message: res?.message || 'Failed to save',
                type: 'error',
            });
            return false;
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e?.message || 'Failed to save',
                type: 'error',
            });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleSelect = (value) => {
        if (value === current || saving) return;

        if (value === 'engagement_hub') {
            setConfirmVariant(applySuggestedDefaults ? 'community_with_defaults' : 'community_layout');
        } else if (value === 'classic' && current === 'engagement_hub') {
            setConfirmVariant('classic');
        } else {
            return;
        }
        setTypedPhrase('');
        setPhraseError('');
    };

    const handleConfirmedSwitch = async () => {
        if (confirmVariant === 'community_with_defaults') {
            return runSwitch('engagement_hub', true);
        }
        if (confirmVariant === 'community_layout') {
            return runSwitch('engagement_hub', false);
        }
        if (confirmVariant === 'classic') {
            return runSwitch('classic', false);
        }
        return false;
    };

    return (
        <div className="operator-hub-mode dash">
            <Popup
                isOpen={confirmVariant != null}
                onClose={closeConfirmModal}
                customClassName="wide-content operator-hub-mode-confirm-popup"
                disableOutsideClick
            >
                <OperatorHubSwitchConfirmModal
                    variant={confirmVariant ?? 'classic'}
                    typedPhrase={typedPhrase}
                    setTypedPhrase={setTypedPhrase}
                    phraseError={phraseError}
                    setPhraseError={setPhraseError}
                    saving={saving}
                    onConfirm={handleConfirmedSwitch}
                />
            </Popup>
            <img src={GradientHeader} alt="" className="grad" />
            <header className="header">
                <h1>Community organizer</h1>
            </header>
            <div className="content">
                <p className="operator-hub-mode__lede">
                    Choose how staff experience Meridian on <strong>/root-dashboard</strong>. Community organizer
                    mode is the home for makerspaces and smaller managed communities; classic mode keeps the full
                    multi-app setup. Club and member apps are unchanged.
                </p>
                <div className="operator-hub-mode__content">
                    {loading && !config ? (
                        <p className="operator-hub-mode__loading">
                            <Icon icon="mdi:loading" className="spin" /> Loading…
                        </p>
                    ) : (
                        <>
                            <ul className="operator-hub-mode__options" role="radiogroup" aria-label="Root dashboard mode">
                                {MODES.map((m) => (
                                    <li key={m.value}>
                                        <button
                                            type="button"
                                            className={`operator-hub-mode__card ${current === m.value ? 'is-selected' : ''}`}
                                            onClick={() => handleSelect(m.value)}
                                            disabled={saving}
                                            aria-pressed={current === m.value}
                                        >
                                            <span className="operator-hub-mode__card-title">{m.title}</span>
                                            <span className="operator-hub-mode__card-desc">{m.description}</span>
                                            {current === m.value && (
                                                <span className="operator-hub-mode__badge">
                                                    <Icon icon="mdi:check-circle" /> Current
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <div className="operator-hub-mode__defaults">
                                <label className="operator-hub-mode__defaults-label">
                                    <input
                                        type="checkbox"
                                        checked={applySuggestedDefaults}
                                        onChange={(e) => setApplySuggestedDefaults(e.target.checked)}
                                        disabled={saving || current === 'engagement_hub'}
                                    />
                                    <span>
                                        When switching <strong>to</strong> Community organizer, also apply suggested
                                        low-ceremony defaults (turn off org approval gate, simplify allowed request types to
                                        verification only, and set verification as not required). You can change these later
                                        under org management configuration.
                                    </span>
                                </label>
                                {applySuggestedDefaults && current !== 'engagement_hub' && (
                                    <p className="operator-hub-mode__warning" role="note">
                                        <Icon icon="mdi:alert-outline" aria-hidden />
                                        <span>
                                            Switching <strong>back</strong> to Classic later will <strong>not</strong> undo
                                            these defaults—you will need to restore org approval, request types, and
                                            verification settings manually if required.
                                        </span>
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default OperatorHubMode;
