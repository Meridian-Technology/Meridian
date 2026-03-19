import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import FeedbackFormConfig from '../FeedbackFormConfig';
import FeedbackRequestPanel from '../FeedbackRequestPanel';
import './slides.scss';

function FeedbackSlide({
    orgId,
    eventId,
    event,
    onRefresh,
    forExport = false,
    embedded = false,
    resultsOnly = false
}) {
    const [showFormConfig, setShowFormConfig] = useState(false);

    const eventData = event?.hostingId ? { ...event, hostingId: event.hostingId } : event;
    const feedbackFormId = event?.feedbackFormId;

    const feedbackUrl = orgId && eventId
        ? `/org-event-management/${orgId}/events/${eventId}/feedback-responses`
        : null;
    const { data: feedbackData, loading: feedbackLoading, refetch: refetchFeedback } = useFetch(feedbackUrl);

    const responses = feedbackData?.success && Array.isArray(feedbackData?.data?.responses)
        ? feedbackData.data.responses
        : [];
    const aggregated = feedbackData?.data?.aggregated || {};
    const responseCount = feedbackData?.data?.responseCount ?? 0;

    const handleFormSaved = () => {
        setShowFormConfig(false);
        onRefresh?.();
        refetchFeedback?.();
    };

    if (!feedbackFormId) {
        if (forExport || resultsOnly) return null;
        return (
            <div className={`event-post-mortem-slide ${(embedded || resultsOnly) ? 'feedback-slide--embedded' : ''}`}>
                {!embedded && !resultsOnly && (
                <>
                <h2 className="event-post-mortem-slide__title">Attendee Feedback</h2>
                <p className="event-post-mortem-slide__subtitle">
                    Collect experience ratings and feedback from attendees
                </p>
                </>
                )}
                <div className="event-post-mortem-slide__card feedback-slide__setup">
                    <div className="feedback-slide__setup-content">
                        <Icon icon="mdi:message-star-outline" className="feedback-slide__setup-icon" />
                        <h3>Set up a feedback form</h3>
                        <p>Create a customizable form to collect ratings and feedback from your attendees. You can send it via email or share a link.</p>
                        <button
                            type="button"
                            className="feedback-slide__setup-btn"
                            onClick={() => setShowFormConfig(true)}
                        >
                            <Icon icon="mdi:plus" />
                            Set up feedback form
                        </button>
                    </div>
                </div>
                {showFormConfig && (
                    <FeedbackFormConfig
                        orgId={orgId}
                        eventId={eventId}
                        onSaved={handleFormSaved}
                        onClose={() => setShowFormConfig(false)}
                    />
                )}
            </div>
        );
    }

    const ratingKeys = Object.keys(aggregated);

    return (
        <div className={`event-post-mortem-slide ${(embedded || resultsOnly) ? 'feedback-slide--embedded' : ''}`}>
            <div className="event-post-mortem-slide__section" data-pdf-no-split>
                {!embedded && !resultsOnly && (
                <>
                <h2 className="event-post-mortem-slide__title">Attendee Feedback</h2>
                <p className="event-post-mortem-slide__subtitle">
                    Collect and view experience ratings from attendees
                </p>
                </>
                )}

                {!forExport && !resultsOnly && (embedded || responseCount === 0) && (
                <div className="event-post-mortem-slide__card feedback-slide__actions">
                    <div className="feedback-slide__actions-header">
                        <button
                            type="button"
                            className="feedback-slide__edit-btn"
                            onClick={() => setShowFormConfig(true)}
                        >
                            <Icon icon="mdi:pencil" />
                            Edit form
                        </button>
                    </div>
                    <FeedbackRequestPanel
                        orgId={orgId}
                        eventId={eventId}
                        eventName={event?.name}
                        feedbackFormId={feedbackFormId}
                        orgName={event?.hostingId?.org_name}
                        orgProfileImage={event?.hostingId?.org_profile_image}
                        organizerName={event?.contact}
                    />
                </div>
                )}

                {(responseCount > 0 || forExport || resultsOnly) && (
                    <div className="event-post-mortem-slide__card feedback-slide__results">
                        <h3>Responses ({responseCount})</h3>
                        {responseCount === 0 && forExport ? (
                            <p className="feedback-slide__no-long">No feedback collected yet.</p>
                        ) : feedbackLoading ? (
                            <p>Loading...</p>
                        ) : (
                            <>
                                {ratingKeys.map((key) => {
                                    const agg = aggregated[key];
                                    if (!agg) return null;
                                    const maxCount = Math.max(...Object.values(agg.counts), 1);
                                    return (
                                        <div key={key} className="feedback-slide__rating-block">
                                            <p className="feedback-slide__rating-question">{agg.question}</p>
                                            <div className="feedback-slide__rating-bars">
                                                {agg.options.map((opt) => {
                                                    const count = agg.counts[opt] ?? 0;
                                                    const pct = agg.total > 0 ? (count / agg.total) * 100 : 0;
                                                    return (
                                                        <div key={opt} className="feedback-slide__rating-row">
                                                            <span className="feedback-slide__rating-label">{opt}</span>
                                                            <div className="feedback-slide__rating-bar-wrap">
                                                                <div
                                                                    className="feedback-slide__rating-bar"
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                            <span className="feedback-slide__rating-count">{count}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {responses.length > 0 && (
                                    <div className="feedback-slide__sample-answers">
                                        <h4>Sample feedback</h4>
                                        {responses.slice(0, 5).map((r, i) => {
                                            const longAnswers = (r.answers || []).filter((a) => typeof a === 'string' && a.length > 20);
                                            return longAnswers.length > 0 ? (
                                                <div key={r._id || i} className="feedback-slide__sample-item">
                                                    {longAnswers[0]}
                                                </div>
                                            ) : null;
                                        }).filter(Boolean)}
                                        {responses.slice(0, 5).filter((r) => {
                                            const longAnswers = (r.answers || []).filter((a) => typeof a === 'string' && a.length > 20);
                                            return longAnswers.length > 0;
                                        }).length === 0 && (
                                            <p className="feedback-slide__no-long">No open-ended feedback yet.</p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {!forExport && showFormConfig && (embedded || responseCount === 0) && (
                <FeedbackFormConfig
                    orgId={orgId}
                    eventId={eventId}
                    feedbackFormId={feedbackFormId}
                    onSaved={handleFormSaved}
                    onClose={() => setShowFormConfig(false)}
                />
            )}
        </div>
    );
}

export default FeedbackSlide;
