import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import {
  PivotOpsBanner,
  PivotOpsCard,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';
import {
  toIsoWeek,
  isValidIsoWeek,
  shiftIsoWeek,
  formatEventWhen,
} from '../../../utils/pivotIsoWeek';
import PivotBatchWeekPicker from './PivotBatchWeekPicker';
import usePivotBatchWeekState from './usePivotBatchWeekState';
import usePivotTenantWeekKeybinds from './usePivotTenantWeekKeybinds';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';

const NO_FETCH_CACHE = { enabled: false };
const SEARCH_DEBOUNCE_MS = 280;

const SCORE_PARTS = [
  { key: 'friendGoing', label: 'friends going' },
  { key: 'friendInterested', label: 'friends interested' },
  { key: 'crew', label: 'crew' },
  { key: 'personal', label: 'personal' },
  { key: 'bleed', label: 'crew bleed' },
  { key: 'negative', label: 'negative tags', subtract: true },
];

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

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
  return SCORE_PARTS.filter((part) => Number(score[part.key]) > 0).map((part) => {
    const value = Number(score[part.key]);
    const signed = part.subtract ? `−${formatScore(value)}` : formatScore(value);
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
    bits.push(
      `${event.friendsInterestedCount} interested`,
    );
  }
  if (event.crewRegisteredCount) {
    bits.push(
      `${event.crewRegisteredCount} crew going`,
    );
  }
  if (event.crewInterestedCount) {
    bits.push(
      `${event.crewInterestedCount} crew interested`,
    );
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

function DropDeckEventRow({ event, rank }) {
  const score = event.dropDeckScore;
  const parts = scoreBreakdown(score);
  const social = socialCounts(event);
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const hostName = event.displayHost?.name || '';

  return (
    <li className="pivot-drop-deck-inspector__event">
      <span className="pivot-drop-deck-inspector__rank">{rank}</span>
      <div className="pivot-drop-deck-inspector__event-body">
        <div className="pivot-drop-deck-inspector__event-head">
          <p className="pivot-drop-deck-inspector__event-name">{event.name || 'Untitled'}</p>
          <span className="pivot-drop-deck-inspector__score">{formatScore(score?.total)}</span>
        </div>
        <p className="pivot-drop-deck-inspector__event-meta">
          {[hostName, formatEventWhen(event.start_time)].filter(Boolean).join(' · ')}
        </p>
        {parts.length ? (
          <p className="pivot-drop-deck-inspector__parts">{parts.join(' · ')}</p>
        ) : null}
        {tags.length ? (
          <ul className="pivot-drop-deck-inspector__tags">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}
        <div className="pivot-drop-deck-inspector__event-foot">
          {social.length ? (
            <span className="pivot-drop-deck-inspector__muted">{social.join(' · ')}</span>
          ) : (
            <span className="pivot-drop-deck-inspector__muted">No friend or crew signal</span>
          )}
          <IntentStatusPill status={event.userIntent} />
        </div>
      </div>
    </li>
  );
}

/**
 * Search a city user and inspect the drop deck generated for them.
 * Preview never writes PivotDeckSnapshot.
 */
function PivotTenantDropDeckInspector({ tenantKey }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlBatchWeek = searchParams.get('batchWeek');
  const urlUserId = searchParams.get('userId');

  const {
    batchWeek,
    committedWeek,
    setBatchWeek,
    batchWeekValid,
    committedWeekValid,
  } = usePivotBatchWeekState(
    isValidIsoWeek(urlBatchWeek) ? urlBatchWeek.trim() : toIsoWeek(),
  );
  const [followAppWeek, setFollowAppWeek] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(() => urlUserId?.trim() || null);
  const [rebuild, setRebuild] = useState(false);
  const [sawFrozen, setSawFrozen] = useState(false);

  const debouncedQuery = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);

  const pinWeek = useCallback(
    (nextWeek, options) => {
      setFollowAppWeek(false);
      setBatchWeek(nextWeek, options);
    },
    [setBatchWeek],
  );

  useEffect(() => {
    const currentWeek = searchParams.get('batchWeek');
    const currentUser = searchParams.get('userId');
    const pageOk = searchParams.get('page') === '3';
    const weekOk = followAppWeek
      ? !currentWeek
      : !committedWeekValid || currentWeek === committedWeek;
    const userOk = selectedUserId ? currentUser === selectedUserId : !currentUser;
    if (pageOk && weekOk && userOk) return;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', '3');
        if (followAppWeek) next.delete('batchWeek');
        else if (committedWeekValid) next.set('batchWeek', committedWeek);
        if (selectedUserId) next.set('userId', selectedUserId);
        else next.delete('userId');
        return next;
      },
      { replace: true },
    );
  }, [
    committedWeek,
    committedWeekValid,
    followAppWeek,
    selectedUserId,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    const next = urlUserId?.trim() || null;
    setSelectedUserId((current) => (current === next ? current : next));
  }, [urlUserId]);

  const opsParams = useMemo(
    () => ({
      batchWeek: committedWeek,
      include: 'readiness',
    }),
    [committedWeek],
  );
  const opsUrl =
    tenantKey && committedWeekValid
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/ops`
      : null;
  const { data: opsResponse } = useFetch(opsUrl, {
    params: opsParams,
    cache: NO_FETCH_CACHE,
  });
  const ops = opsResponse?.success ? opsResponse.data : null;
  const dropDayOfWeek = ops?.weekRange?.dropDayOfWeek ?? ops?.dropSchedule?.dayOfWeek ?? 4;
  const dropTimeZone = ops?.weekRange?.timeZone ?? ops?.dropSchedule?.timezone ?? 'UTC';

  const isUserSearch = debouncedQuery.length >= 2;
  const usersParams = useMemo(
    () => ({
      ...(isUserSearch ? { query: debouncedQuery } : {}),
      ...(committedWeekValid ? { batchWeek: committedWeek } : {}),
    }),
    [isUserSearch, debouncedQuery, committedWeek, committedWeekValid],
  );
  const usersUrl =
    tenantKey && (isUserSearch || committedWeekValid)
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/journeys/users`
      : null;
  const {
    data: usersResponse,
    loading: usersLoading,
    error: usersError,
  } = useFetch(usersUrl, { params: usersParams, cache: NO_FETCH_CACHE });

  const previewParams = useMemo(
    () => ({
      userId: selectedUserId,
      ...(!followAppWeek && committedWeekValid ? { batchWeek: committedWeek } : {}),
      ...(rebuild ? { rebuild: 'true' } : {}),
    }),
    [selectedUserId, followAppWeek, committedWeek, committedWeekValid, rebuild],
  );
  const previewUrl =
    tenantKey && selectedUserId
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/drop-deck/preview`
      : null;
  const {
    data: previewResponse,
    loading: previewLoading,
    error: previewError,
    refetch: refetchPreview,
  } = useFetch(previewUrl, { params: previewParams, cache: NO_FETCH_CACHE });

  const users = usersResponse?.success ? usersResponse.data?.users ?? [] : [];
  const usersMode =
    usersResponse?.success && usersResponse.data?.mode
      ? usersResponse.data.mode
      : isUserSearch
        ? 'search'
        : 'active';
  const usersMessage =
    usersError ||
    (usersResponse && !usersResponse.success
      ? usersResponse.message || 'Unable to search users.'
      : null);
  const preview = previewResponse?.success ? previewResponse.data : null;
  const previewMessage =
    previewError ||
    (previewResponse && !previewResponse.success
      ? previewResponse.message || 'Unable to load drop deck.'
      : null);

  useEffect(() => {
    setRebuild(false);
    setSawFrozen(false);
  }, [committedWeek, selectedUserId]);

  useEffect(() => {
    if (previewLoading) return;
    if (!preview?.frozen) return;
    if (preview.batchWeek && committedWeekValid && preview.batchWeek !== committedWeek) {
      return;
    }
    setSawFrozen(true);
  }, [preview?.frozen, preview?.batchWeek, previewLoading, committedWeek, committedWeekValid]);

  useEffect(() => {
    if (!followAppWeek) return;
    const resolved = preview?.batchWeek;
    if (!isValidIsoWeek(resolved)) return;
    setBatchWeek((current) => (current === resolved ? current : resolved), {
      immediate: true,
    });
  }, [followAppWeek, preview?.batchWeek, setBatchWeek]);

  const stepBatchWeek = useCallback(
    (delta) => {
      pinWeek((current) => {
        const next = shiftIsoWeek(current, delta);
        return next || current;
      });
    },
    [pinWeek],
  );

  const { keyboardNavActive } = usePivotTenantWeekKeybinds({
    enabled: batchWeekValid,
    onStepWeek: stepBatchWeek,
    onRefresh: selectedUserId ? refetchPreview : undefined,
  });

  const selectUser = useCallback((userId) => {
    setRebuild(false);
    setSawFrozen(false);
    setSelectedUserId(userId);
  }, []);

  const clearSelectedUser = useCallback(() => {
    setRebuild(false);
    setSawFrozen(false);
    setSelectedUserId(null);
  }, []);

  const journeysHref = selectedUserId
    ? `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?page=2${
        committedWeekValid ? `&batchWeek=${encodeURIComponent(committedWeek)}` : ''
      }&userId=${encodeURIComponent(selectedUserId)}`
    : null;

  const deckCopy = preview ? describeDeckPreview(preview, { rebuild }) : null;

  return (
    <PivotOpsSection
      titleId="pivot-drop-deck-inspector"
      title="User deck"
      description="If they already opened the drop, this is that saved deck (swipes marked). If they haven’t, this is what the app would show them right now."
      actions={
        <>
          <PivotBatchWeekPicker
            batchWeek={batchWeek}
            onChange={pinWeek}
            keyboardNavActive={keyboardNavActive}
            anchors={ops?.anchors}
            dropDayOfWeek={dropDayOfWeek}
            timeZone={dropTimeZone}
            pending={batchWeek !== committedWeek}
            label={followAppWeek ? 'App week' : 'Pinned week'}
          />
          {followAppWeek ? null : (
            <button
              type="button"
              className="linear-btn linear-btn--ghost linear-btn--sm"
              onClick={() => setFollowAppWeek(true)}
            >
              Use app week
            </button>
          )}
          <button
            type="button"
            className="linear-btn linear-btn--secondary pivot-tenant-kbd-btn"
            onClick={() => {
              if (selectedUserId) refetchPreview();
            }}
            disabled={!selectedUserId || previewLoading}
          >
            Refresh
            <KeybindTooltip label="Refresh" keybind="R" />
          </button>
        </>
      }
    >
      {!batchWeekValid ? (
        <p className="pivot-drop-deck-inspector__error" role="alert">
          Batch week must be ISO format YYYY-Www (e.g. {toIsoWeek()}).
        </p>
      ) : null}

      <div className="pivot-drop-deck-inspector">
        <div className="pivot-drop-deck-inspector__search">
          <label className="linear-field">
            <span className="linear-field__label">Find user</span>
            <input
              className="linear-input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name, username, or user id"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {usersMessage ? (
            <p className="pivot-drop-deck-inspector__error" role="alert">
              {usersMessage}
            </p>
          ) : null}
          {searchQuery.length > 0 && searchQuery.length < 2 ? (
            <p className="pivot-drop-deck-inspector__muted">
              Type at least 2 characters to search.
            </p>
          ) : null}
          {!isUserSearch && committedWeekValid ? (
            <p className="pivot-drop-deck-inspector__list-label">
              Most active · {committedWeek}
            </p>
          ) : null}
          {isUserSearch && users.length > 0 ? (
            <p className="pivot-drop-deck-inspector__list-label">Search results</p>
          ) : null}
          {usersLoading ? (
            <p className="pivot-drop-deck-inspector__muted">
              {isUserSearch ? 'Searching…' : 'Loading active users…'}
            </p>
          ) : null}
          {!usersLoading && isUserSearch && !users.length ? (
            <p className="pivot-drop-deck-inspector__empty">
              No users match “{debouncedQuery}”.
            </p>
          ) : null}
          {!usersLoading &&
          !isUserSearch &&
          committedWeekValid &&
          usersMode === 'active' &&
          !users.length ? (
            <p className="pivot-drop-deck-inspector__empty">
              No users with intents in {committedWeek}.
            </p>
          ) : null}
          {users.length > 0 ? (
            <ul className="pivot-drop-deck-inspector__user-list" role="listbox">
              {users.map((user) => {
                const selected = user.userId === selectedUserId;
                return (
                  <li key={user.userId}>
                    <button
                      type="button"
                      className={`pivot-drop-deck-inspector__user-row${
                        selected ? ' pivot-drop-deck-inspector__user-row--selected' : ''
                      }`}
                      onClick={() => selectUser(user.userId)}
                      aria-selected={selected}
                    >
                      <span className="pivot-drop-deck-inspector__user-name">
                        {user.name || 'Unnamed'}
                        {user.username ? (
                          <span className="pivot-drop-deck-inspector__user-handle">
                            @{user.username}
                          </span>
                        ) : null}
                      </span>
                      {typeof user.intentCount === 'number' ? (
                        <span className="pivot-drop-deck-inspector__muted">
                          {user.intentCount} intent
                          {user.intentCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <PivotOpsCard className="pivot-drop-deck-inspector__deck">
          {!selectedUserId ? (
            <p className="pivot-drop-deck-inspector__empty">
              Select a user to inspect the drop generated for them.
            </p>
          ) : (
            <>
              <div className="pivot-drop-deck-inspector__deck-head">
                <div>
                  <p className="pivot-drop-deck-inspector__history-name">
                    {preview?.user?.name || 'User'}
                    {preview?.user?.username ? (
                      <span className="pivot-drop-deck-inspector__user-handle">
                        @{preview.user.username}
                      </span>
                    ) : null}
                  </p>
                  <code className="linear-code linear-code--inline">{selectedUserId}</code>
                  {preview?.user?.interestTags?.length ? (
                    <ul className="pivot-drop-deck-inspector__tags pivot-drop-deck-inspector__tags--user">
                      {preview.user.interestTags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="pivot-drop-deck-inspector__deck-actions">
                  {journeysHref ? (
                    <Link className="pivot-drop-deck-inspector__link" to={journeysHref}>
                      User journeys
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    onClick={clearSelectedUser}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {previewMessage ? (
                <p className="pivot-drop-deck-inspector__error" role="alert">
                  {previewMessage}
                </p>
              ) : null}

              {previewLoading && !preview ? (
                <p className="pivot-drop-deck-inspector__muted">Loading deck…</p>
              ) : null}

              {preview ? (
                <>
                  <PivotOpsBanner tone={deckCopy.tone} title={deckCopy.title}>
                    {deckCopy.body}
                  </PivotOpsBanner>

                  <div className="pivot-drop-deck-inspector__deck-actions pivot-drop-deck-inspector__deck-actions--banner">
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
                    <p className="pivot-drop-deck-inspector__empty">
                      {preview.frozen && !rebuild
                        ? 'Their saved drop is empty, or those events are no longer in the catalog.'
                        : followAppWeek
                          ? 'If they opened the app right now, they’d see an empty drop.'
                          : `No published events for ${preview.batchWeek || committedWeek}. That’s often a different week than the app would open — use App week.`}
                    </p>
                  ) : (
                    <ol className="pivot-drop-deck-inspector__events">
                      {preview.events.map((event, index) => (
                        <DropDeckEventRow
                          key={event._id || index}
                          event={event}
                          rank={(event.rankInFeed ?? index) + 1}
                        />
                      ))}
                    </ol>
                  )}
                </>
              ) : null}
            </>
          )}
        </PivotOpsCard>
      </div>
    </PivotOpsSection>
  );
}

export default PivotTenantDropDeckInspector;
