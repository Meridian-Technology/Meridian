import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import { PivotOpsBanner, PivotOpsStatus } from '../../../components/PivotOps';
import { formatEventWhen } from '../../../utils/pivotIsoWeek';
import './PivotDeckRankingPanel.scss';

const NO_FETCH_CACHE = { enabled: false };

const SCORE_PARTS = [
  { key: 'friendGoing', label: 'friends going' },
  { key: 'friendInterested', label: 'friends interested' },
  { key: 'crew', label: 'crew' },
  { key: 'personal', label: 'personal' },
  { key: 'bleed', label: 'crew bleed' },
  { key: 'negative', label: 'negative tags', subtract: true },
  { key: 'source', label: 'source', signed: true },
  { key: 'editorial', label: 'editorial weight', signed: true },
];

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

function IntentStatusPill({ status }) {
  if (status === 'registered') {
    return <PivotOpsStatus tone="ok">Going</PivotOpsStatus>;
  }
  if (status === 'interested') {
    return <PivotOpsStatus tone="info">Interested</PivotOpsStatus>;
  }
  if (status === 'passed') {
    return <PivotOpsStatus tone="muted">Passed</PivotOpsStatus>;
  }
  return null;
}

function scoreBreakdown(score) {
  if (!score) return [];
  return SCORE_PARTS.filter((part) => Number(score[part.key]) !== 0).map((part) => {
    const value = Number(score[part.key]);
    const signed = part.subtract
      ? `−${formatScore(value)}`
      : part.signed && value > 0 ? `+${formatScore(value)}` : formatScore(value);
    return `${part.label} ${signed}`;
  });
}

function socialCounts(event) {
  const bits = [];
  if (event.friendsGoingCount) {
    bits.push(
      `${event.friendsGoingCount} friend${event.friendsGoingCount === 1 ? '' : 's'} going`,
    );
  }
  if (event.friendsInterestedCount) {
    bits.push(`${event.friendsInterestedCount} interested`);
  }
  if (event.crewRegisteredCount) {
    bits.push(`${event.crewRegisteredCount} crew going`);
  }
  if (event.crewInterestedCount) {
    bits.push(`${event.crewInterestedCount} crew interested`);
  }
  return bits;
}

function describeDeckPreview(preview, { rebuild } = {}) {
  const events = preview?.events || [];
  const swiped = events.filter((event) => event.userIntent).length;
  const week = preview?.batchWeek || '';
  const asOf = preview?.asOfLabel ? ` as of ${preview.asOfLabel}` : '';

  if (preview?.frozen && !rebuild) {
    if (!events.length) {
      return {
        tone: 'info',
        title: 'Deck they already have',
        body: week
          ? `They opened the ${week} drop${asOf}, but none of those cards could be loaded.`
          : `They opened this drop${asOf}, but none of those cards could be loaded.`,
      };
    }
    return {
      tone: 'info',
      title: 'Deck they already have',
      body: swiped
        ? `They already opened this drop${asOf}. ${swiped} of ${events.length} cards are swiped (Going / Interested / Passed on each row).`
        : `They already opened this drop${asOf}. This is the saved list of ${events.length} cards.`,
    };
  }

  if (rebuild) {
    return {
      tone: 'accent',
      title: 'What they’d see now',
      body: 'If they opened the app right now, this is the live drop. Their saved deck is unchanged.',
    };
  }

  if (!events.length) {
    return {
      tone: 'accent',
      title: 'What they’d see now',
      body: week
        ? `They haven’t opened a drop yet. If they opened the app right now, they’d see an empty deck for ${week} — no published events in the current window.`
        : 'They haven’t opened a drop yet. If they opened the app right now, they’d see an empty deck — no published events in the current window.',
    };
  }

  return {
    tone: 'accent',
    title: 'What they’d see now',
    body: week
      ? `They haven’t opened this drop yet. This is the deck the app would show if they opened it right now (${week}).`
      : 'They haven’t opened this drop yet. This is the deck the app would show if they opened it right now.',
  };
}

function DeckRankingRow({ event, rank }) {
  const score = event.dropDeckScore;
  const parts = scoreBreakdown(score);
  const social = socialCounts(event);
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const hostName = event.displayHost?.name || '';
  const editorial = event.editorialRanking;

  return (
    <li className="pivot-deck-ranking__event">
      <span className="pivot-deck-ranking__rank">{rank}</span>
      <div className="pivot-deck-ranking__event-body">
        <div className="pivot-deck-ranking__event-head">
          <p className="pivot-deck-ranking__event-name">{event.name || 'Untitled'}</p>
          <span className="pivot-deck-ranking__score">{formatScore(score?.total)}</span>
        </div>
        <p className="pivot-deck-ranking__event-meta">
          {[hostName, formatEventWhen(event.start_time)].filter(Boolean).join(' · ')}
        </p>
        {parts.length ? (
          <p className="pivot-deck-ranking__parts">{parts.join(' · ')}</p>
        ) : null}
        {editorial && (editorial.tier !== 'standard' || editorial.inclusionReason !== 'ranked') ? (
          <p className="pivot-deck-ranking__parts">
            {editorial.inclusionReason === 'editorial'
              ? 'Exact editorial set'
              : editorial.inclusionReason === 'must_show'
                ? 'Guaranteed membership'
                : editorial.tier.replaceAll('_', ' ')}
            {editorial.audience === 'matching_interests'
              ? editorial.matched ? ' · interest matched' : ' · interest not matched'
              : ''}
          </p>
        ) : null}
        {tags.length ? (
          <ul className="pivot-deck-ranking__tags">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
        <div className="pivot-deck-ranking__event-foot">
          {social.length ? (
            <span className="pivot-deck-ranking__muted">{social.join(' · ')}</span>
          ) : (
            <span className="pivot-deck-ranking__muted">No friend or crew signal</span>
          )}
          <IntentStatusPill status={event.userIntent} />
        </div>
      </div>
    </li>
  );
}

/**
 * Scored drop deck for one user: the saved deck if they opened the drop,
 * otherwise what the app would build now. Preview never writes PivotDeckSnapshot.
 *
 * `followAppWeek` asks the server for the week the app would open; otherwise
 * the Audience page week is pinned.
 */
function PivotDeckRankingPanel({
  tenantKey,
  userId,
  committedWeek,
  committedWeekValid,
  followAppWeek,
  onFollowAppWeekChange,
  refreshKey = 0,
}) {
  const [rebuild, setRebuild] = useState(false);
  const [sawFrozen, setSawFrozen] = useState(false);

  const previewParams = useMemo(
    () => ({
      userId,
      ...(!followAppWeek && committedWeekValid ? { batchWeek: committedWeek } : {}),
      ...(rebuild ? { rebuild: 'true' } : {}),
    }),
    [userId, followAppWeek, committedWeek, committedWeekValid, rebuild],
  );
  const previewUrl =
    tenantKey && userId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/drop-deck/preview`
      : null;
  const {
    data: previewResponse,
    loading: previewLoading,
    error: previewError,
    refetch: refetchPreview,
  } = useFetch(previewUrl, { params: previewParams, cache: NO_FETCH_CACHE });

  const refreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKeyRef.current === refreshKey) return;
    refreshKeyRef.current = refreshKey;
    if (previewUrl) refetchPreview();
  }, [refreshKey, previewUrl, refetchPreview]);

  const preview = previewResponse?.success ? previewResponse.data : null;
  const previewMessage =
    previewError ||
    (previewResponse && !previewResponse.success
      ? previewResponse.message || 'Unable to load drop deck.'
      : null);

  useEffect(() => {
    setRebuild(false);
    setSawFrozen(false);
  }, [committedWeek, userId, followAppWeek]);

  useEffect(() => {
    if (previewLoading) return;
    if (!preview?.frozen) return;
    if (
      !followAppWeek
      && preview.batchWeek
      && committedWeekValid
      && preview.batchWeek !== committedWeek
    ) {
      return;
    }
    setSawFrozen(true);
  }, [
    preview?.frozen,
    preview?.batchWeek,
    previewLoading,
    followAppWeek,
    committedWeek,
    committedWeekValid,
  ]);

  const resolvedWeek = preview?.batchWeek || null;
  const deckCopy = preview ? describeDeckPreview(preview, { rebuild }) : null;

  return (
    <div className="pivot-deck-ranking">
      <div className="pivot-deck-ranking__week" role="group" aria-label="Deck week">
        <button
          type="button"
          className={followAppWeek ? 'is-active' : undefined}
          aria-pressed={followAppWeek}
          onClick={() => onFollowAppWeekChange(true)}
        >
          App week{followAppWeek && resolvedWeek ? ` · ${resolvedWeek}` : ''}
        </button>
        <button
          type="button"
          className={followAppWeek ? undefined : 'is-active'}
          aria-pressed={!followAppWeek}
          onClick={() => onFollowAppWeekChange(false)}
          disabled={!committedWeekValid}
        >
          {committedWeekValid ? committedWeek : 'Page week'}
        </button>
      </div>

      {preview?.user?.interestTags?.length ? (
        <ul className="pivot-deck-ranking__tags pivot-deck-ranking__tags--user" aria-label="Interest tags">
          {preview.user.interestTags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}

      {previewMessage ? (
        <p className="pivot-deck-ranking__error" role="alert">
          {previewMessage}
        </p>
      ) : null}

      {previewLoading && !preview ? (
        <p className="pivot-deck-ranking__muted">Loading deck…</p>
      ) : null}

      {preview ? (
        <>
          <PivotOpsBanner tone={deckCopy.tone} title={deckCopy.title}>
            {deckCopy.body}
          </PivotOpsBanner>

          <div className="pivot-deck-ranking__actions">
            {preview.frozen ? (
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                onClick={() => setRebuild(true)}
                disabled={rebuild || previewLoading}
              >
                Show what they’d see now
              </button>
            ) : null}
            {rebuild && sawFrozen ? (
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                onClick={() => setRebuild(false)}
                disabled={previewLoading}
              >
                Show the deck they already have
              </button>
            ) : null}
          </div>

          {!preview.events?.length ? (
            <p className="pivot-deck-ranking__empty">
              {preview.frozen && !rebuild
                ? 'Their saved drop is empty, or those events are no longer in the catalog.'
                : followAppWeek
                  ? 'If they opened the app right now, they’d see an empty drop.'
                  : `No published events for ${preview.batchWeek || committedWeek}. That’s often a different week than the app would open — use App week.`}
            </p>
          ) : (
            <ol className="pivot-deck-ranking__events">
              {preview.events.map((event, index) => (
                <DeckRankingRow
                  key={event._id || index}
                  event={event}
                  rank={(event.rankInFeed ?? index) + 1}
                />
              ))}
            </ol>
          )}
        </>
      ) : null}
    </div>
  );
}

export default PivotDeckRankingPanel;
