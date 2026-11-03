import React, { useEffect, useRef, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import { PivotOpsBanner } from '../../../components/PivotOps';

const MODE_LABELS = {
  physical: 'Exact place',
  registration_gated: 'Address after RSVP',
  approximate: 'General area',
  online: 'Online',
  tbd: 'TBD',
};

/**
 * Source location text the city has already resolved once. New scrapes with
 * the same text reuse the decision; forgetting one sends the next match back
 * through Google and the review queue.
 */
export default function PivotLocationMemoryList({ baseUrl, refreshToken, onError }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [forgettingId, setForgettingId] = useState(null);
  const memoriesQuery = useFetch(`${baseUrl}/memories`, {
    params: { q: debouncedQuery || undefined, limit: 100 },
    cache: { enabled: false },
  });
  const { refetch } = memoriesQuery;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // The parent bumps this after a review save so new memories show up.
  useEffect(() => {
    if (refreshToken) refetchRef.current();
  }, [refreshToken]);

  const memories = memoriesQuery.data?.success ? memoriesQuery.data.data?.memories || [] : [];

  const forget = async (memory) => {
    setForgettingId(memory.id);
    const { data, error } = await authenticatedRequest(`${baseUrl}/memories/${memory.id}`, {
      method: 'DELETE',
    });
    setForgettingId(null);
    if (error || !data?.success) {
      onError?.('Could not forget location', data?.message || error);
      return;
    }
    refetch();
  };

  return (
    <div className="pivot-location-memory">
      <input
        className="linear-input"
        type="search"
        aria-label="Filter remembered locations"
        placeholder="Filter by source text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {memoriesQuery.error ? (
        <PivotOpsBanner tone="danger" role="alert">{String(memoriesQuery.error)}</PivotOpsBanner>
      ) : memories.length ? (
        <ul>
          {memories.map((memory) => (
            <li key={memory.id}>
              <div>
                <strong>“{memory.sourceText}”</strong>
                <span>
                  {MODE_LABELS[memory.richLocation?.mode] || memory.richLocation?.mode}
                  {' → '}
                  {memory.richLocation?.publicDisplayLabel || memory.richLocation?.formattedAddress}
                </span>
                <small>
                  Reused {memory.useCount} {memory.useCount === 1 ? 'time' : 'times'}
                  {memory.rememberedBy?.email ? ` · ${memory.rememberedBy.email}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="linear-btn linear-btn--ghost linear-btn--sm"
                disabled={forgettingId === memory.id}
                onClick={() => forget(memory)}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pivot-location-memory__empty">
          {memoriesQuery.loading
            ? 'Loading…'
            : query.trim()
              ? 'Nothing remembered matches that text.'
              : 'Decisions you save with “Remember” appear here.'}
        </p>
      )}
    </div>
  );
}
