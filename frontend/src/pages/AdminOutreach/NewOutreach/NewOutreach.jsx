import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiRequest from '../../../utils/postRequest';
import { buildStudentFilterFromFields } from '../outreachFilterHelpers';
import './NewOutreach.scss';

const PROGRAM_TYPES = [
    { value: '', label: 'Any' },
    { value: 'undergraduate', label: 'Undergraduate' },
    { value: 'graduate', label: 'Graduate' },
    { value: 'professional', label: 'Professional' },
    { value: 'other', label: 'Other' },
];

const ENROLLMENT_STATUSES = [
    { value: '', label: 'Any' },
    { value: 'active', label: 'Active' },
    { value: 'leave', label: 'Leave' },
    { value: 'graduated', label: 'Graduated' },
    { value: 'full-time', label: 'Full-time' },
    { value: 'part-time', label: 'Part-time' },
    { value: 'other', label: 'Other' },
];

function NewOutreach() {
    const [major, setMajor] = useState('');
    const [graduationYear, setGraduationYear] = useState('');
    const [programType, setProgramType] = useState('');
    const [enrollmentStatus, setEnrollmentStatus] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [channelEmail, setChannelEmail] = useState(false);
    const [channelInApp, setChannelInApp] = useState(true);

    const [previewTotal, setPreviewTotal] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    const [draftMessageId, setDraftMessageId] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [actionMessage, setActionMessage] = useState(null);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);

    const filterFields = useMemo(
        () => ({ major, graduationYear, programType, enrollmentStatus }),
        [major, graduationYear, programType, enrollmentStatus]
    );

    const filterDefinition = useMemo(() => buildStudentFilterFromFields(filterFields), [filterFields]);

    const channels = useMemo(() => {
        const c = [];
        if (channelEmail) c.push('email');
        if (channelInApp) c.push('in_app');
        return c.length ? c : ['in_app'];
    }, [channelEmail, channelInApp]);

    useEffect(() => {
        if (!filterDefinition) {
            setPreviewTotal(null);
            setPreviewError(null);
            return;
        }
        const t = setTimeout(async () => {
            setPreviewLoading(true);
            setPreviewError(null);
            const res = await apiRequest(
                '/admin/outreach/audiences/preview',
                { filterDefinition, limit: 10 },
                { method: 'POST' }
            );
            setPreviewLoading(false);
            if (res?.error) {
                setPreviewError(res.error);
                setPreviewTotal(null);
                return;
            }
            if (res?.success && res.data) {
                setPreviewTotal(typeof res.data.total === 'number' ? res.data.total : null);
            } else {
                setPreviewError(res?.message || 'Preview failed');
                setPreviewTotal(null);
            }
        }, 450);
        return () => clearTimeout(t);
    }, [filterDefinition]);

    const persistDraft = useCallback(async () => {
        setActionError(null);
        setActionMessage(null);
        const sub = subject.trim();
        const bod = body.trim();
        if (!sub || !bod) {
            setActionError('Subject and body are required.');
            return null;
        }
        if (!filterDefinition) {
            setActionError('Choose at least one targeting field (not all “Any”).');
            return null;
        }
        const payload = {
            title: sub,
            subject: sub,
            body: bod,
            channels,
            filterDefinition,
        };
        if (draftMessageId) {
            const res = await apiRequest(`/admin/outreach/messages/${draftMessageId}`, payload, { method: 'PUT' });
            if (res?.error) {
                setActionError(res.error);
                return null;
            }
            if (!res?.success) {
                setActionError(res?.message || 'Could not update draft');
                return null;
            }
            return draftMessageId;
        }
        const res = await apiRequest('/admin/outreach/messages', payload, { method: 'POST' });
        if (res?.error) {
            setActionError(res.error);
            return null;
        }
        if (!res?.success || !res.data?._id) {
            setActionError(res?.message || 'Could not save draft');
            return null;
        }
        setDraftMessageId(res.data._id);
        return res.data._id;
    }, [subject, body, channels, filterDefinition, draftMessageId]);

    const handleSaveDraft = async () => {
        setSaving(true);
        const id = await persistDraft();
        setSaving(false);
        if (id) setActionMessage('Draft saved.');
    };

    const handleSend = async () => {
        setSending(true);
        setActionError(null);
        setActionMessage(null);
        const id = await persistDraft();
        if (!id) {
            setSending(false);
            return;
        }
        const res = await apiRequest(`/admin/outreach/messages/${id}/send`, {}, { method: 'POST' });
        setSending(false);
        if (res?.error) {
            setActionError(res.error);
            return;
        }
        if (!res?.success) {
            setActionError(res?.message || 'Send failed');
            return;
        }
        const sent = res.data?.sent ?? res.data?.total;
        setActionMessage(
            typeof sent === 'number' ? `Message sent to ${sent} recipient(s).` : 'Message sent.'
        );
        setDraftMessageId(null);
        setSubject('');
        setBody('');
    };

    return (
        <div className="new-outreach">
            <header className="new-outreach-header">
                <h2>New outreach</h2>
                <p className="subtitle">Target students by attributes. Recipients are resolved when you send.</p>
            </header>

            <div className="new-outreach-toolbar">
                <div className="new-outreach-list">
                    <div className="new-outreach-card">
                        <div className="new-outreach-header">
                            <p>Who receives this message?</p>
                            <p className="subtext">
                                Filters use the same fields as the student profile (SIS-backed where configured).
                            </p>
                        </div>

                        <div className="new-outreach-body">
                            <div className="search-wrapper">
                                <p className="subject">Major / Department</p>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Any — substring match"
                                    value={major}
                                    onChange={(e) => setMajor(e.target.value)}
                                />

                                <p className="subject">Graduation year</p>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="e.g. 2027"
                                    value={graduationYear}
                                    onChange={(e) => setGraduationYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                />

                                <p className="subject">Program type</p>
                                <select
                                    className="search-input new-outreach-select"
                                    value={programType}
                                    onChange={(e) => setProgramType(e.target.value)}
                                >
                                    {PROGRAM_TYPES.map((o) => (
                                        <option key={o.value || 'any'} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>

                                <p className="subject">Enrollment status</p>
                                <select
                                    className="search-input new-outreach-select"
                                    value={enrollmentStatus}
                                    onChange={(e) => setEnrollmentStatus(e.target.value)}
                                >
                                    {ENROLLMENT_STATUSES.map((o) => (
                                        <option key={o.value || 'any-en'} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>

                                <div className="count">
                                    <p className="Estimated">Estimated recipients:</p>
                                    <p className="live-count">
                                        {!filterDefinition && ' Add at least one filter.'}
                                        {filterDefinition && previewLoading && ' Estimating…'}
                                        {filterDefinition && !previewLoading && previewError && ` — ${previewError}`}
                                        {filterDefinition &&
                                            !previewLoading &&
                                            !previewError &&
                                            previewTotal != null &&
                                            ` ${previewTotal} student(s)`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="new-outreach-list">
                    <div className="new-outreach-card">
                        <div className="new-outreach-header">
                            <p>Message</p>
                        </div>

                        <div className="new-outreach-body">
                            <div className="search-wrapper">
                                <p className="subject">Subject</p>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="e.g. Internship fair — CS majors"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                />

                                <p className="subject">Body</p>
                                <textarea
                                    className="search-input search-input-body"
                                    placeholder="Write your announcement. Plain text and links are supported."
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                />

                                <p className="delivery">Delivery</p>
                                <label className="new-outreach-channel">
                                    <input
                                        type="checkbox"
                                        checked={channelInApp}
                                        onChange={(e) => setChannelInApp(e.target.checked)}
                                    />
                                    In-app notification
                                </label>
                                <label className="new-outreach-channel">
                                    <input
                                        type="checkbox"
                                        checked={channelEmail}
                                        onChange={(e) => setChannelEmail(e.target.checked)}
                                    />
                                    Email (when enabled for your school)
                                </label>

                                {actionError && (
                                    <p className="new-outreach-banner new-outreach-banner-error" role="alert">
                                        {actionError}
                                    </p>
                                )}
                                {actionMessage && (
                                    <p className="new-outreach-banner new-outreach-banner-success" role="status">
                                        {actionMessage}
                                    </p>
                                )}

                                <div className="send">
                                    <button
                                        type="button"
                                        className="btn btn-send"
                                        disabled={sending || saving}
                                        onClick={handleSend}
                                    >
                                        {sending ? 'Sending…' : 'Send'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-draft"
                                        disabled={saving || sending}
                                        onClick={handleSaveDraft}
                                    >
                                        {saving ? 'Saving…' : 'Save draft'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NewOutreach;
