import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import CreateRegistrationFormModal from '../CreateRegistrationFormModal';
import RegistrationSettingsModal from './RegistrationSettingsModal';
import Popup from '../../../../../../components/Popup/Popup';
import EmptyState from '../../../../../../components/EmptyState/EmptyState';
import './RegistrationsTab.scss';

const VIEW_MODES = [
    { id: 'table', label: 'Table', icon: 'mdi:table' },
    { id: 'cards', label: 'Cards', icon: 'mdi:card-multiple' },
    { id: 'summary', label: 'Summary', icon: 'mdi:chart-bar' }
];

function RegistrationsTab({ event, orgId, onRefresh, color }) {
    const { addNotification } = useNotification();
    const [updatingForm, setUpdatingForm] = useState(false);
    const [viewMode, setViewMode] = useState('table');
    const [removingId, setRemovingId] = useState(null);
    const [confirmRemove, setConfirmRemove] = useState(null);

    const { data, loading, error, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/registration-responses` : null
    );
    const { data: formsData, refetch: refetchForms } = useFetch(orgId ? `/org-event-management/${orgId}/forms` : null);
    const orgForms = formsData?.success ? (formsData.data || []) : [];
    const [showCreateFormModal, setShowCreateFormModal] = useState(false);
    const [editingFormId, setEditingFormId] = useState(null);
    const [showRegistrationSettingsModal, setShowRegistrationSettingsModal] = useState(false);

    const { registrations = [], formResponses = [], registrationFormId } = data?.data || {};
    const hasForm = Boolean(registrationFormId);
    const currentForm = hasForm ? orgForms.find((f) => f._id === registrationFormId) : null;
    const questions = useMemo(() => {
        const current = currentForm?.questions || [];
        const removed = currentForm?.removedQuestions || [];
        if (current.length || removed.length) return [...current, ...removed];
        const snap = formResponses[0]?.formSnapshot;
        return snap?.questions || [];
    }, [currentForm, formResponses]);

    const getAnswerForQuestion = (response, questionId) => {
        const snap = response?.formSnapshot;
        if (!snap?.questions?.length || !response?.answers) return '—';
        const qIdx = snap.questions.findIndex((q) => (q._id || q.id)?.toString() === (questionId || '').toString());
        if (qIdx < 0) return '—';
        const val = response.answers[qIdx];
        if (val === undefined || val === null) return '—';
        const display = Array.isArray(val) ? val.filter(Boolean).join(', ') : String(val);
        return display.trim() ? display : '—';
    };

    const summaryByQuestion = useMemo(() => {
        if (!hasForm || !questions.length || !formResponses.length) return [];
        const total = formResponses.length;
        const getAnswer = getAnswerForQuestion;
        return questions.map((q) => {
            const qId = (q._id || q.id)?.toString();
            const counts = {};
            formResponses.forEach((r) => {
                const val = getAnswer(r, qId);
                if (val === '—') return;
                const displayKey = val?.trim() || '(empty)';
                counts[displayKey] = (counts[displayKey] || 0) + 1;
            });
            const isChoice = q.type === 'multiple_choice' || q.type === 'select_multiple';
            const entries = Object.entries(counts).map(([answer, count]) => ({ answer, count }));
            entries.sort((a, b) => b.count - a.count);
            const answered = entries.reduce((sum, e) => sum + e.count, 0);
            return {
                question: q,
                total,
                answered,
                entries,
                isChoice
            };
        });
    }, [hasForm, questions, formResponses]);

    const exportCsv = () => {
        const headers = ['Name', 'Email', 'Registered At', ...questions.map(q => q.question || '')];
        const rows = formResponses.map((r) => {
            const name = getResponseDisplayName(r);
            const email = getResponseEmail(r);
            const date = r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '';
            const answers = questions.map((q) => {
                const val = getAnswerForQuestion(r, (q._id || q.id)?.toString());
                return val === '—' ? '' : val;
            });
            return [name, email, date, ...answers];
        });
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `registrations-${event?.name?.replace(/\W/g, '-') || event?._id}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const copyEmail = (email) => {
        if (!email) return;
        navigator.clipboard.writeText(email).then(
            () => addNotification({ title: 'Copied', message: 'Email copied to clipboard', type: 'success' }),
            () => addNotification({ title: 'Copy failed', message: 'Could not copy to clipboard', type: 'error' })
        );
    };

    const copyRegistrationLink = async () => {
        if (!event?._id) return;
        const eventUrl = `${window.location.origin}/event/${event._id}`;
        try {
            await navigator.clipboard.writeText(eventUrl);
            addNotification({ title: 'Copied', message: 'Registration link copied to clipboard', type: 'success' });
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = eventUrl;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                addNotification({ title: 'Copied', message: 'Registration link copied to clipboard', type: 'success' });
            } catch {
                addNotification({ title: 'Copy failed', message: 'Could not copy link to clipboard', type: 'error' });
            }
            document.body.removeChild(textArea);
        }
    };

    const removeRegistration = async (payload) => {
        const { responseId, userId } = payload || {};
        const id = responseId || userId;
        if (!orgId || !event?._id || !id) return;
        setRemovingId(id);
        try {
            const url = responseId
                ? `/org-event-management/${orgId}/events/${event._id}/registration-responses/${responseId}`
                : `/org-event-management/${orgId}/events/${event._id}/registrations/${userId}`;
            const res = await apiRequest(url, null, { method: 'DELETE' });
            if (res?.success) {
                addNotification({ title: 'Removed', message: 'Registration removed', type: 'success' });
                setConfirmRemove(null);
                onRefresh?.();
                refetch?.();
            } else {
                addNotification({ title: 'Remove failed', message: res?.message || res?.error || 'Failed to remove', type: 'error' });
            }
        } catch (err) {
            addNotification({ title: 'Remove failed', message: err?.message || 'Failed to remove', type: 'error' });
        } finally {
            setRemovingId(null);
        }
    };

    const getDisplayName = (user) => user?.name || user?.username || '—';
    const getEmail = (user) => user?.email || '—';
    const getResponseDisplayName = (r) =>
        r.submittedBy ? getDisplayName(r.submittedBy) : (r.guestName || 'Guest');
    const getResponseEmail = (r) => (r.submittedBy ? getEmail(r.submittedBy) : (r.guestEmail || r.guestUsername || '—'));

    if (loading) {
        return (
            <div className="registrations-tab loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading registrations...</p>
            </div>
        );
    }

    if (error || (data && !data.success)) {
        return (
            <div className="registrations-tab error">
                <Icon icon="mdi:alert-circle" />
                <p>{error || data?.message || 'Failed to load registrations'}</p>
            </div>
        );
    }

    const count = event?.registrationCount ?? registrations.length;
    const registrationEnabled = event?.registrationEnabled ?? false;

    const handleEnableRegistration = async () => {
        if (!orgId || !event?._id) return;
        setUpdatingForm(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}`,
                { registrationEnabled: true },
                { method: 'PUT' }
            );
            if (res?.success) {
                addNotification({ title: 'Registration enabled', message: 'Registration is now enabled for this event', type: 'success' });
                onRefresh?.();
                refetch?.();
            } else {
                addNotification({
                    title: 'Enable failed',
                    message: res?.message || res?.error || 'Failed to enable registration',
                    type: 'error'
                });
            }
        } catch (err) {
            addNotification({
                title: 'Enable failed',
                message: err?.message || 'Failed to enable registration',
                type: 'error'
            });
        } finally {
            setUpdatingForm(false);
        }
    };

    const handleDisableRegistration = async () => {
        if (!orgId || !event?._id) return;
        setUpdatingForm(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}`,
                { registrationEnabled: false },
                { method: 'PUT' }
            );
            if (res?.success) {
                addNotification({ title: 'Registration disabled', message: 'Registration is now disabled for this event', type: 'success' });
                onRefresh?.();
                refetch?.();
            } else {
                addNotification({
                    title: 'Disable failed',
                    message: res?.message || res?.error || 'Failed to disable registration',
                    type: 'error'
                });
            }
        } catch (err) {
            addNotification({
                title: 'Disable failed',
                message: err?.message || 'Failed to disable registration',
                type: 'error'
            });
        } finally {
            setUpdatingForm(false);
        }
    };

    const handleDeleteForm = async () => {
        if (!orgId || !event?._id) return;
        setUpdatingForm(true);
        try {
            const res = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}`,
                { registrationFormId: null },
                { method: 'PUT' }
            );
            if (res?.success) {
                addNotification({ title: 'Form removed', message: 'Registration form has been removed from this event', type: 'success' });
                onRefresh?.();
                refetch?.();
            } else {
                addNotification({
                    title: 'Remove failed',
                    message: res?.message || res?.error || 'Failed to remove form',
                    type: 'error'
                });
            }
        } catch (err) {
            addNotification({
                title: 'Remove failed',
                message: err?.message || 'Failed to remove registration form',
                type: 'error'
            });
        } finally {
            setUpdatingForm(false);
        }
    };

    return (
        <div className="registrations-tab">
            {!registrationEnabled && (
                <div className="registrations-disabled-banner">
                    <div className="registrations-disabled-content">
                        <Icon icon="mdi:account-off" className="disabled-icon" />
                        <div className="disabled-text">
                            <strong>Registration is disabled</strong>
                            <p>Enable registration to allow attendees to register for this event.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="enable-registration-btn"
                        onClick={handleEnableRegistration}
                        disabled={updatingForm}
                    >
                        <Icon icon={updatingForm ? 'mdi:loading' : 'mdi:account-plus'} className={updatingForm ? 'spin' : ''} />
                        {updatingForm ? 'Enabling...' : 'Enable Registration'}
                    </button>
                </div>
            )}

            <div className="registrations-tab-header">
                <div className="registrations-summary">
                    <span className="count">{count}</span>
                    <span className="label">Registrations</span>
                    {registrationEnabled && (
                        <span className="registration-status-badge">
                            <Icon icon="mdi:check-circle" />
                            Enabled
                        </span>
                    )}
                </div>
                <div className="registrations-tab-actions">
                    {registrationEnabled && (
                        <>
                            <button
                                type="button"
                                className="registration-settings-btn"
                                onClick={() => setShowRegistrationSettingsModal(true)}
                                title="Registration settings"
                            >
                                <Icon icon="mdi:cog" />
                                Settings
                            </button>
                            <button
                                type="button"
                                className="disable-registration-btn"
                                onClick={handleDisableRegistration}
                                disabled={updatingForm}
                                title="Disable registration"
                            >
                                <Icon icon={updatingForm ? 'mdi:loading' : 'mdi:account-off'} className={updatingForm ? 'spin' : ''} />
                                {updatingForm ? 'Disabling...' : 'Disable'}
                            </button>
                            <button
                                type="button"
                                className="copy-registration-link-btn"
                                onClick={copyRegistrationLink}
                                title="Copy registration link"
                            >
                                <Icon icon="mdi:link-variant" />
                                Copy Link
                            </button>
                        </>
                    )}
                    {hasForm && formResponses.length > 0 && (
                        <>
                            <div className="view-mode-toggle" role="tablist">
                                {VIEW_MODES.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={viewMode === m.id}
                                        className={viewMode === m.id ? 'active' : ''}
                                        onClick={() => setViewMode(m.id)}
                                        title={m.label}
                                    >
                                        <Icon icon={m.icon} />
                                        <span>{m.label}</span>
                                    </button>
                                ))}
                            </div>
                            <button type="button" className="export-csv-btn" onClick={exportCsv}>
                                <Icon icon="mdi:download" />
                                Export CSV
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="registrations-form-selector">
                {hasForm ? (
                    <>
                        <div className="registrations-form-info">
                            <div className="registrations-form-info-content">
                                <label>Registration form</label>
                                <span className="form-title">{currentForm?.title || 'Untitled Form'}</span>
                            </div>
                            <div className="registrations-form-actions">
                                <button
                                    type="button"
                                    className="edit-form-btn"
                                    onClick={() => {
                                        setEditingFormId(registrationFormId);
                                        setShowCreateFormModal(true);
                                    }}
                                    disabled={updatingForm}
                                >
                                    <Icon icon="mdi:pencil" />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    className="delete-form-btn"
                                    onClick={handleDeleteForm}
                                    disabled={updatingForm}
                                >
                                    <Icon icon={updatingForm ? 'mdi:loading' : 'mdi:delete-outline'} className={updatingForm ? 'spin' : ''} />
                                    Delete
                                </button>
                            </div>
                        </div>
                        {updatingForm && (
                            <span className="registrations-form-selector-saving">
                                <Icon icon="mdi:loading" className="spin" />
                                Saving…
                            </span>
                        )}
                    </>
                ) : (
                    <div className="registrations-form-empty">
                        <div className="registrations-form-empty-content">
                            <Icon icon="mdi:form-select" className="empty-icon" />
                            <div className="empty-text">
                                <label>Registration form</label>
                                <p>Create a registration form to collect information from attendees when they register for this event.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="create-form-btn"
                            onClick={() => { setEditingFormId(null); setShowCreateFormModal(true); }}
                        >
                            <Icon icon="mdi:plus" />
                            Create form
                        </button>
                    </div>
                )}
                {showCreateFormModal && (
                    <CreateRegistrationFormModal
                        orgId={orgId}
                        formId={editingFormId || undefined}
                        initialForm={editingFormId ? orgForms.find((f) => f._id === editingFormId) : undefined}
                        existingResponseCount={editingFormId && registrationFormId === editingFormId ? formResponses.length : 0}
                        onCreated={async (newFormId) => {
                            refetchForms?.();
                            if (!editingFormId && event?._id && orgId) {
                                setUpdatingForm(true);
                                try {
                                    const res = await apiRequest(
                                        `/org-event-management/${orgId}/events/${event._id}`,
                                        { registrationFormId: newFormId },
                                        { method: 'PUT' }
                                    );
                                    if (res?.success) {
                                        addNotification({ title: 'Form created', message: 'The registration form is now active for this event.', type: 'success' });
                                        onRefresh?.();
                                        refetch?.();
                                    }
                                } catch (err) {
                                    addNotification({ title: 'Form created', message: 'There was an issue linking the form to the event.', type: 'warning' });
                                } finally {
                                    setUpdatingForm(false);
                                }
                            } else if (editingFormId) {
                                onRefresh?.();
                                refetch?.();
                            }
                        }}
                        onClose={() => { setShowCreateFormModal(false); setEditingFormId(null); }}
                    />
                )}
            </div>

            {hasForm && formResponses.length > 0 ? (
                <>
                    {viewMode === 'table' && (
                        <div className="registrations-table-wrapper">
                            <table className="registrations-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Submitted</th>
                                        {questions.map((q, idx) => (
                                            <th key={idx}>{q.question || `Q${idx + 1}`}</th>
                                        ))}
                                        <th className="th-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formResponses.map((r, i) => (
                                        <tr key={r._id || i}>
                                            <td>{getResponseDisplayName(r)}</td>
                                            <td>{getResponseEmail(r)}</td>
                                            <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}</td>
                                            {questions.map((q, j) => (
                                                <td key={(q._id || q.id) || j}>
                                                    {getAnswerForQuestion(r, (q._id || q.id)?.toString())}
                                                </td>
                                            ))}
                                            <td className="td-actions">
                                                <button type="button" className="action-btn copy-email" onClick={() => copyEmail(r.submittedBy?.email || r.guestEmail)} title="Copy email">
                                                    <Icon icon="mdi:email-outline" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="action-btn remove"
                                                    onClick={() => setConfirmRemove({ responseId: r._id, name: getResponseDisplayName(r) })}
                                                    title="Remove registration"
                                                    disabled={removingId === r._id}
                                                >
                                                    <Icon icon={removingId === r._id ? 'mdi:loading' : 'mdi:account-minus'} className={removingId === r._id ? 'spin' : ''} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {viewMode === 'cards' && (
                        <div className="registrations-cards">
                            {formResponses.map((r, i) => (
                                <div key={r._id || i} className="registration-card">
                                    <div className="registration-card-header">
                                        <div className="registration-card-user">
                                            <span className="name">{getResponseDisplayName(r)}</span>
                                            <span className="email">{getResponseEmail(r)}</span>
                                        </div>
                                        <div className="registration-card-meta">
                                            {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
                                        </div>
                                        <div className="registration-card-actions">
                                            <button type="button" className="action-btn copy-email" onClick={() => copyEmail(r.submittedBy?.email || r.guestEmail)} title="Copy email">
                                                <Icon icon="mdi:email-outline" />
                                            </button>
                                            <button
                                                type="button"
                                                className="action-btn remove"
                                                onClick={() => setConfirmRemove({ responseId: r._id, name: getResponseDisplayName(r) })}
                                                title="Remove registration"
                                                disabled={removingId === r._id}
                                            >
                                                <Icon icon={removingId === r._id ? 'mdi:loading' : 'mdi:account-minus'} className={removingId === r._id ? 'spin' : ''} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="registration-card-answers">
                                        {questions.map((q, j) => (
                                            <div key={(q._id || q.id) || j} className="registration-card-answer">
                                                <span className="q">{q.question || `Q${j + 1}`}</span>
                                                <span className="a">{getAnswerForQuestion(r, (q._id || q.id)?.toString())}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {viewMode === 'summary' && (
                        <div className="registrations-summary-view">
                            <p className="summary-intro">{formResponses.length} response{formResponses.length !== 1 ? 's' : ''} — breakdown by question</p>
                            {summaryByQuestion.map((item, idx) => (
                                <div key={idx} className="summary-question-block">
                                    <h4 className="summary-question-title">{item.question?.question || `Question ${idx + 1}`}</h4>
                                    <p className="summary-question-meta">
                                        {item.answered} of {item.total} answered
                                    </p>
                                    {item.isChoice ? (
                                        <div className="summary-bars">
                                            {item.entries.map(({ answer, count }) => {
                                                const pct = item.answered ? Math.round((count / item.answered) * 100) : 0;
                                                return (
                                                    <div key={answer} className="summary-bar-row">
                                                        <span className="summary-bar-label" title={answer}>{answer}</span>
                                                        <div className="summary-bar-track">
                                                            <div className="summary-bar-fill" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="summary-bar-count">{count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="summary-text-responses">
                                            {item.entries.length === 0 ? (
                                                <span className="summary-no-answers">No answers</span>
                                            ) : (
                                                <>
                                                    <ul className="summary-text-list">
                                                        {item.entries.slice(0, 6).map(({ answer, count }) => (
                                                            <li key={answer}>
                                                                <span className="summary-text-answer">{answer.length > 100 ? `${answer.slice(0, 100)}…` : answer}</span>
                                                                {count > 1 && <span className="summary-text-count">×{count}</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {item.entries.length > 6 && (
                                                        <p className="summary-text-more">
                                                            +{item.entries.length - 6} other answers — see Table or Cards for full list
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div className="registrations-list-simple">
                    {registrations.length === 0 ? (
                        <EmptyState
                            icon="mingcute:group-fill"
                            title="No registrations yet"
                            description="Registrations will appear here once people sign up for this event."
                        />
                    ) : (
                        <ul>
                            {registrations.map((reg, i) => {
                                const uid = reg.userId?._id || reg.userId;
                                const uidStr = uid?.toString?.() || uid;
                                return (
                                    <li key={uidStr || i}>
                                        <span className="user">{getDisplayName(typeof reg.userId === 'object' ? reg.userId : null)}</span>
                                        <span className="meta">
                                            {reg.registeredAt ? new Date(reg.registeredAt).toLocaleDateString() : ''}
                                            {reg.guestCount > 1 ? ` · ${reg.guestCount} guests` : ''}
                                            {reg.checkedIn ? ' · Checked in' : ''}
                                        </span>
                                        <span className="list-actions">
                                            <button type="button" className="action-btn copy-email" onClick={() => copyEmail(reg.userId?.email)} title="Copy email">
                                                <Icon icon="mdi:email-outline" />
                                            </button>
                                            <button
                                                type="button"
                                                className="action-btn remove"
                                                onClick={() => setConfirmRemove({ userId: uidStr, name: getDisplayName(reg.userId) })}
                                                title="Remove registration"
                                                disabled={removingId === uidStr}
                                            >
                                                <Icon icon={removingId === uidStr ? 'mdi:loading' : 'mdi:account-minus'} className={removingId === uidStr ? 'spin' : ''} />
                                            </button>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            <RegistrationSettingsModal
                isOpen={showRegistrationSettingsModal}
                onClose={() => setShowRegistrationSettingsModal(false)}
                event={event}
                orgId={orgId}
                orgForms={orgForms}
                refetchForms={refetchForms}
                color={'var(--org-primary)'}
                onSaved={() => {
                    onRefresh?.();
                    refetch?.();
                }}
            />

            {confirmRemove && (
                <Popup isOpen onClose={() => setConfirmRemove(null)} customClassName="registrations-confirm-remove-modal">
                    <div className="registrations-confirm-remove-inner">
                        <h3>Remove registration?</h3>
                        <p>This will remove <strong>{confirmRemove.name}</strong> from the event. They will need to register again to rejoin.</p>
                        <div className="registrations-confirm-remove-actions">
                            <button type="button" className="btn-cancel" onClick={() => setConfirmRemove(null)}>Cancel</button>
                            <button
                                type="button"
                                className="btn-remove"
                                onClick={() => removeRegistration(confirmRemove)}
                                disabled={removingId != null}
                            >
                                {removingId ? 'Removing…' : 'Remove'}
                            </button>
                        </div>
                    </div>
                </Popup>
            )}
        </div>
    );
}

export default RegistrationsTab;
