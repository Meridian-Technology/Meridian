import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import {
  PivotOpsAnimateNumber,
  PivotOpsMetric,
  PivotOpsMetricGrid,
  PivotOpsSection,
  PivotOpsStatus,
} from '../../../components/PivotOps';

const NO_FETCH_CACHE = { enabled: false };
const TABULAR = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

/** `7` → `№007`, as printed on the tag. */
export function formatTagNumber(number) {
  return `№${String(number).padStart(3, '0')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Status chip for one tag: retired wins, then written, then not written. */
export function tagStatus(tag) {
  if (tag.status === 'revoked') return { tone: 'muted', label: 'Retired' };
  if (tag.writtenAt) return { tone: 'ok', label: 'Written' };
  return { tone: 'warn', label: 'Not written' };
}

export function summarizeTags(tags) {
  return tags.reduce(
    (totals, tag) => {
      if (tag.status === 'revoked') totals.retired += 1;
      else if (tag.writtenAt) totals.written += 1;
      else totals.unwritten += 1;
      return totals;
    },
    { made: tags.length, written: 0, unwritten: 0, retired: 0 },
  );
}

/**
 * Growth → Dog tags. A city's NFC dog tags: what exists, what's written, and
 * retire/restore. Making and writing tags needs a phone, so that happens in
 * the app (Ops → tags); this is the desk view.
 */
function PivotTenantTagsPanel({ tenantKey, cityDisplayName, refetchRef }) {
  const { addNotification } = useNotification();
  const [savingId, setSavingId] = useState('');

  const tagsUrl = tenantKey ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/tags` : null;
  const { data: response, loading, error, refetch } = useFetch(tagsUrl, { cache: NO_FETCH_CACHE });

  useEffect(() => {
    if (!refetchRef) return undefined;
    refetchRef.current = refetch;
    return () => {
      if (refetchRef.current === refetch) refetchRef.current = null;
    };
  }, [refetch, refetchRef]);

  const data = response?.success ? response.data : null;
  const tags = useMemo(() => data?.tags || [], [data]);
  const totals = useMemo(() => summarizeTags(tags), [tags]);
  const city = data?.cityDisplayName || cityDisplayName || tenantKey;
  const listError =
    error || (response && !response.success ? response.message || 'Unable to load dog tags.' : null);

  const setStatus = useCallback(
    async (tag, status) => {
      const number = formatTagNumber(tag.number);
      if (
        status === 'revoked'
        && !window.confirm(`Retire ${number}? Tapping it will say it's retired. You can restore it later.`)
      ) {
        return;
      }
      setSavingId(tag.id);
      const { data: res, error: reqError } = await authenticatedRequest(
        `${tagsUrl}/${encodeURIComponent(tag.id)}/status`,
        { method: 'POST', data: { status }, headers: { 'Content-Type': 'application/json' } },
      );
      setSavingId('');
      if (reqError || !res?.success) {
        addNotification({
          title: 'Could not update tag',
          message: res?.message || reqError || 'Unable to update the tag.',
          type: 'error',
        });
        return;
      }
      addNotification({
        title: status === 'revoked' ? 'Tag retired' : 'Tag restored',
        message: number,
        type: 'success',
      });
      refetch();
    },
    [addNotification, refetch, tagsUrl],
  );

  return (
    <>
      <PivotOpsSection
        title="Dog tags"
        titleId="pivot-tenant-tags"
        description={`NFC dog tags for ${city}, numbered from №001. Each opens justgo.lol/pivot/tag/… — the app if it's installed, the App Clip if not. Make and write tags from the app: Ops → tags.`}
      >
        {loading && !data ? (
          <p className="pivot-lab__empty">Loading dog tags…</p>
        ) : (
          <PivotOpsMetricGrid>
            <PivotOpsMetric label="Made" value={<PivotOpsAnimateNumber value={totals.made} />} />
            <PivotOpsMetric
              label="Written"
              value={<PivotOpsAnimateNumber value={totals.written} />}
              hint="live and on a physical tag"
            />
            <PivotOpsMetric
              label="Not written"
              value={<PivotOpsAnimateNumber value={totals.unwritten} />}
              hint="made, or erased, but not on a tag"
            />
            <PivotOpsMetric
              label="Retired"
              value={<PivotOpsAnimateNumber value={totals.retired} />}
              hint="tapping says it's retired"
            />
          </PivotOpsMetricGrid>
        )}
      </PivotOpsSection>

      <PivotOpsSection title="All tags" titleId="pivot-tenant-tags-list">
        {listError ? (
          <p className="pivot-lab__error" role="alert">
            {listError}
          </p>
        ) : null}
        {loading && !data ? null : !tags.length ? (
          <p className="pivot-lab__empty">No dog tags in {city} yet. Make them in the app: Ops → tags.</p>
        ) : (
          <div className="pivot-lab__table-wrap">
            <table className="pivot-lab__table">
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col">Status</th>
                  <th scope="col">Note</th>
                  <th scope="col">Written</th>
                  <th scope="col">Made</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => {
                  const status = tagStatus(tag);
                  const retired = tag.status === 'revoked';
                  return (
                    <tr key={tag.id}>
                      <td style={TABULAR}>{formatTagNumber(tag.number)}</td>
                      <td>
                        <PivotOpsStatus tone={status.tone}>{status.label}</PivotOpsStatus>
                      </td>
                      <td>{tag.note || '—'}</td>
                      <td>{formatDate(tag.writtenAt)}</td>
                      <td>{formatDate(tag.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="linear-btn linear-btn--secondary"
                          onClick={() => setStatus(tag, retired ? 'active' : 'revoked')}
                          disabled={savingId === tag.id}
                          aria-label={`${retired ? 'Restore' : 'Retire'} ${formatTagNumber(tag.number)}`}
                        >
                          {retired ? 'Restore' : 'Retire'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PivotOpsSection>
    </>
  );
}

export default PivotTenantTagsPanel;
