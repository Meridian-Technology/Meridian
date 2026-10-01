import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsCard, PivotOpsStatus } from '../../../components/PivotOps';
import { formatEventWhen } from '../../../utils/pivotIsoWeek';
import PivotDeckReplay from './PivotDeckReplay';
import PivotDeckRankingPanel from './PivotDeckRankingPanel';

const NO_FETCH_CACHE = { enabled: false };
const WIPE_CONFIRM_TOKEN = 'WIPE';
const SEARCH_DEBOUNCE_MS = 280;

export const AUDIENCE_USER_PANES = Object.freeze([
  { id: 'replay', label: 'Replay' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'activity', label: 'Activity' },
]);

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
  return <PivotOpsStatus>{status || '—'}</PivotOpsStatus>;
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function responseMessage(error, response, fallback) {
  return error || (response && !response.success ? response.message || fallback : null);
}

/**
 * Audience user inspector: search or pick an active user, then read their week
 * as a swipe replay, the scored drop deck, or the raw intent/analytics log.
 * Also owns the destructive wipe-week action for the selected user.
 */
function PivotAudienceUserInspector({
  tenantKey,
  batchWeek,
  batchWeekValid,
  committedWeek,
  committedWeekValid,
  selectedUserId,
  onSelectUser,
  pane,
  onPaneChange,
  followAppWeek,
  onFollowAppWeekChange,
  refreshKey = 0,
  onWiped,
  curationHref,
}) {
  const { addNotification } = useNotification();
  const [searchQuery, setSearchQuery] = useState('');
  const [wipeBusy, setWipeBusy] = useState(false);

  const debouncedQuery = useDebouncedValue(searchQuery.trim(), SEARCH_DEBOUNCE_MS);
  const isUserSearch = debouncedQuery.length >= 2;

  const usersParams = useMemo(
    () => ({
      ...(isUserSearch ? { query: debouncedQuery } : {}),
      ...(committedWeekValid ? { batchWeek: committedWeek } : {}),
    }),
    [isUserSearch, debouncedQuery, committedWeek, committedWeekValid],
  );
  // Search when query is long enough; otherwise load most-active for the week.
  const usersUrl =
    tenantKey && (isUserSearch || committedWeekValid)
      ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/journeys/users`
      : null;
  const {
    data: usersResponse,
    loading: usersLoading,
    error: usersError,
  } = useFetch(usersUrl, { params: usersParams, cache: NO_FETCH_CACHE });

  const weekParams = useMemo(
    () => (committedWeekValid ? { batchWeek: committedWeek } : {}),
    [committedWeek, committedWeekValid],
  );
  const userPath = tenantKey && selectedUserId
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/journeys/users/${encodeURIComponent(selectedUserId)}`
    : null;
  const {
    data: historyResponse,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useFetch(userPath ? `${userPath}/history` : null, {
    params: weekParams,
    cache: NO_FETCH_CACHE,
  });

  const replayUrl = userPath && committedWeekValid && pane === 'replay'
    ? `${userPath}/deck-replay`
    : null;
  const {
    data: replayResponse,
    loading: replayLoading,
    error: replayError,
    refetch: refetchReplay,
  } = useFetch(replayUrl, { params: weekParams, cache: NO_FETCH_CACHE });

  const refreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (refreshKeyRef.current === refreshKey) return;
    refreshKeyRef.current = refreshKey;
    if (userPath) refetchHistory();
    if (replayUrl) refetchReplay();
  }, [refreshKey, userPath, replayUrl, refetchHistory, refetchReplay]);

  const users = usersResponse?.success ? usersResponse.data?.users ?? [] : [];
  const usersMode =
    usersResponse?.success && usersResponse.data?.mode
      ? usersResponse.data.mode
      : isUserSearch
        ? 'search'
        : 'active';
  const history = historyResponse?.success ? historyResponse.data : null;
  const replay = replayResponse?.success ? replayResponse.data : null;

  const usersMessage = responseMessage(usersError, usersResponse, 'Unable to search users.');
  const historyMessage = responseMessage(historyError, historyResponse, 'Unable to load history.');
  const replayMessage = responseMessage(replayError, replayResponse, 'Unable to load deck replay.');

  const handleWipeWeek = useCallback(async () => {
    if (!tenantKey || !selectedUserId || !committedWeekValid) return;

    const intentCount = history?.intents?.length ?? 0;
    if (
      !window.confirm(
        `Wipe ${intentCount || 'all'} interaction(s) for this user in ${committedWeek}? This cannot be undone.`,
      )
    ) {
      return;
    }

    const typed = window.prompt(
      `Type ${WIPE_CONFIRM_TOKEN} to confirm wiping intents for ${committedWeek}.`,
      '',
    );
    if (typed !== WIPE_CONFIRM_TOKEN) {
      if (typed != null) {
        addNotification({
          title: 'Wipe cancelled',
          message: `Confirmation must be exactly “${WIPE_CONFIRM_TOKEN}”.`,
          type: 'warning',
        });
      }
      return;
    }

    setWipeBusy(true);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/users/${encodeURIComponent(selectedUserId)}/wipe-week`,
      {
        method: 'POST',
        data: { batchWeek: committedWeek, confirm: WIPE_CONFIRM_TOKEN },
      },
    );
    setWipeBusy(false);

    if (error || !data?.success) {
      const code = data?.code;
      addNotification({
        title: 'Wipe failed',
        message:
          error ||
          data?.message ||
          (code === 'CONFIRM_REQUIRED'
            ? 'Confirmation token required.'
            : 'Could not wipe week intents.'),
        type: 'error',
      });
      return;
    }

    addNotification({
      title: 'Week wiped',
      message: `Removed ${data.data?.deletedCount ?? 0} intent(s) for ${committedWeek}.`,
      type: 'success',
    });
    refetchHistory();
    if (replayUrl) refetchReplay();
    onWiped?.();
  }, [
    addNotification,
    committedWeek,
    committedWeekValid,
    history?.intents?.length,
    onWiped,
    refetchHistory,
    refetchReplay,
    replayUrl,
    selectedUserId,
    tenantKey,
  ]);

  return (
    <div className="pivot-tenant-journeys__inspector">
      <div className="pivot-tenant-journeys__search">
        <label className="linear-field">
          <span className="linear-field__label">Find user</span>
          <input
            className="linear-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, username, or user id"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {usersMessage ? (
          <p className="pivot-lab__error" role="alert">
            {usersMessage}
          </p>
        ) : null}
        {searchQuery.length > 0 && searchQuery.length < 2 ? (
          <p className="pivot-tenant-journeys__muted">
            Type at least 2 characters to search.
          </p>
        ) : null}
        {!isUserSearch && committedWeekValid ? (
          <p className="pivot-tenant-journeys__list-label">
            Most active · {committedWeek}
          </p>
        ) : null}
        {isUserSearch && users.length > 0 ? (
          <p className="pivot-tenant-journeys__list-label">Search results</p>
        ) : null}
        {usersLoading ? (
          <p className="pivot-tenant-journeys__muted">
            {isUserSearch ? 'Searching…' : 'Loading active users…'}
          </p>
        ) : null}
        {!usersLoading && isUserSearch && !users.length ? (
          <p className="pivot-lab__empty">No users match “{debouncedQuery}”.</p>
        ) : null}
        {!usersLoading &&
        !isUserSearch &&
        committedWeekValid &&
        usersMode === 'active' &&
        !users.length ? (
          <p className="pivot-lab__empty">
            No users with intents in {committedWeek}.
          </p>
        ) : null}
        {users.length > 0 ? (
          <ul className="pivot-tenant-journeys__user-list" role="listbox" aria-label="Users">
            {users.map((user) => {
              const selected = user.userId === selectedUserId;
              return (
                <li key={user.userId}>
                  <button
                    type="button"
                    role="option"
                    className={`pivot-tenant-journeys__user-row${
                      selected ? ' pivot-tenant-journeys__user-row--selected' : ''
                    }`}
                    onClick={() => onSelectUser(user.userId)}
                    aria-selected={selected}
                  >
                    <span className="pivot-tenant-journeys__user-name">
                      {user.name || 'Unnamed'}
                      {user.username ? (
                        <span className="pivot-tenant-journeys__user-handle">
                          @{user.username}
                        </span>
                      ) : null}
                    </span>
                    {typeof user.intentCount === 'number' ? (
                      <span className="pivot-tenant-journeys__muted">
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

      <PivotOpsCard className="pivot-tenant-journeys__history">
        {!selectedUserId ? (
          <p className="pivot-lab__empty">
            Select a user to replay their deck, see how it was ranked, or wipe their week.
          </p>
        ) : (
          <>
            <div className="pivot-tenant-journeys__history-head">
              <div>
                <p className="pivot-tenant-journeys__history-name">
                  {history?.user?.name || 'User'}
                  {history?.user?.username ? (
                    <span className="pivot-tenant-journeys__user-handle">
                      @{history.user.username}
                    </span>
                  ) : null}
                </p>
                <code className="linear-code linear-code--inline">
                  {selectedUserId}
                </code>
              </div>
              <div className="pivot-tenant-journeys__history-actions">
                <button
                  type="button"
                  className="linear-btn linear-btn--ghost"
                  onClick={() => onSelectUser(null)}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="linear-btn pivot-lab__purge-btn"
                  onClick={handleWipeWeek}
                  disabled={wipeBusy || !batchWeekValid || historyLoading}
                >
                  {wipeBusy ? 'Wiping…' : 'Wipe interactions for week'}
                </button>
              </div>
            </div>

            <div className="pivot-tenant-journeys__panes" role="tablist" aria-label="User view">
              {AUDIENCE_USER_PANES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={pane === option.id}
                  className={pane === option.id ? 'is-active' : undefined}
                  onClick={() => onPaneChange(option.id)}
                >
                  {option.label}
                  {option.id === 'activity' && history?.intents?.length
                    ? ` · ${history.intents.length}`
                    : ''}
                </button>
              ))}
            </div>

            {historyMessage ? (
              <p className="pivot-lab__error" role="alert">
                {historyMessage}
              </p>
            ) : null}

            {pane === 'replay' ? (
              <PivotDeckReplay data={replay} loading={replayLoading} error={replayMessage} />
            ) : null}

            {pane === 'ranking' ? (
              <PivotDeckRankingPanel
                tenantKey={tenantKey}
                userId={selectedUserId}
                committedWeek={committedWeek}
                committedWeekValid={committedWeekValid}
                followAppWeek={followAppWeek}
                onFollowAppWeekChange={onFollowAppWeekChange}
                refreshKey={refreshKey}
              />
            ) : null}

            {pane === 'activity' ? (
              <>
                {historyLoading ? (
                  <p className="pivot-tenant-journeys__muted">Loading history…</p>
                ) : null}
                {!historyLoading && history ? (
                  <>
                    <h3 className="pivot-ops-section__title">
                      Intents
                      {batchWeekValid ? ` · ${batchWeek}` : ''}
                      {history.intents?.length ? ` (${history.intents.length})` : ''}
                    </h3>
                    {!history.intents?.length ? (
                      <p className="pivot-lab__empty">
                        No intents for this user
                        {batchWeekValid ? ` in ${batchWeek}` : ''}.
                      </p>
                    ) : (
                      <ul className="pivot-tenant-journeys__timeline">
                        {history.intents.map((intent) => (
                          <li
                            key={`${intent.eventId}-${intent.updatedAt || intent.status}`}
                            className="pivot-tenant-journeys__timeline-item"
                          >
                            <div className="pivot-tenant-journeys__timeline-main">
                              <IntentStatusPill status={intent.status} />
                              <div>
                                <p className="pivot-tenant-journeys__event-name">
                                  {intent.eventName || 'Untitled event'}
                                </p>
                                <p className="pivot-tenant-journeys__event-meta">
                                  {formatEventWhen(intent.eventStartTime) || '—'}
                                  {intent.externalOpenCount > 0
                                    ? ` · ${intent.externalOpenCount} ticket open${
                                        intent.externalOpenCount === 1 ? '' : 's'
                                      }`
                                    : ''}
                                  {intent.timeSlotId ? ` · slot ${intent.timeSlotId}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="pivot-tenant-journeys__timeline-side">
                              <code className="linear-code linear-code--inline">
                                {intent.eventId.slice(-6)}
                              </code>
                              <Link
                                className="pivot-tenant-journeys__link"
                                to={curationHref}
                                title="Open curation for this week"
                              >
                                Catalog
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {history.analytics?.length ? (
                      <>
                        <h3 className="pivot-ops-section__title">
                          Recent analytics ({history.analytics.length})
                        </h3>
                        <ul className="pivot-tenant-journeys__analytics-list">
                          {history.analytics.slice(0, 20).map((row, idx) => (
                            <li key={`${row.event}-${row.ts}-${idx}`}>
                              <code className="linear-code linear-code--inline">
                                {row.event}
                              </code>
                              <span className="pivot-tenant-journeys__muted">
                                {row.ts ? new Date(row.ts).toLocaleString() : '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </PivotOpsCard>
    </div>
  );
}

export default PivotAudienceUserInspector;
