import React, { useEffect, useState } from 'react';
import { authenticatedRequest } from '../../../hooks/useFetch';

function lines(value) {
  return (value || []).join('\n');
}

function hintsFromText(value) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function RunHistory({ runs }) {
  if (!runs?.length) return <p className="pivot-source-intel__empty">No measured website runs yet. The next applied refresh will start this history.</p>;
  return (
    <div className="pivot-source-intel__learning-runs">
      {[...runs].reverse().map((run) => (
        <div className="pivot-source-intel__learning-run" key={run.runKey}>
          <strong>{new Date(run.completedAt).toLocaleDateString()} · {run.hintCount || 0} hints used</strong>
          <span>{run.discovered || 0} extracted · {run.upserted || 0} applied · {run.failed || 0} failed</span>
          <span>{run.corrections || 0} field corrections · {run.missed || 0} missed · {run.discarded || 0} discarded</span>
          <span>{Math.round((run.reviewSeconds || 0) / 60)} min review · ~{run.estimatedCredits || 0} Firecrawl credits</span>
        </div>
      ))}
    </div>
  );
}

const REASON_LABELS = {
  venue_logo: 'Venue or calendar logo', wrong_event: 'Wrong event', low_quality: 'Low quality image',
  date_not_description: 'Date used as description', boilerplate: 'Repeated venue copy',
  wrong_date: 'Unrelated date', section_heading: 'Section date heading', detail_page: 'Detail-page date',
};

function RuleCard({ rule, tenantKey, jobId, canShare, onUpdated }) {
  const [scope, setScope] = useState('entrypoint');
  const [preview, setPreview] = useState(null);
  const [livePreview, setLivePreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs/${encodeURIComponent(jobId)}/extraction-rules/${encodeURIComponent(rule.id)}`;

  async function inspect() {
    setBusy(true); setError('');
    const result = await authenticatedRequest(`${url}/preview`);
    setBusy(false);
    if (result.error || !result.data?.success) setError(result.error || result.data?.message || 'Preview failed.');
    else setPreview(result.data.data);
  }

  async function decide(action) {
    setBusy(true); setError('');
    const result = await authenticatedRequest(`${url}/decision`, { method: 'POST', data: { action, scope } });
    setBusy(false);
    if (result.error || !result.data?.success) setError(result.error || result.data?.message || 'Could not update rule.');
    else onUpdated();
  }

  async function testOnPage() {
    setBusy(true); setError('');
    const result = await authenticatedRequest('/admin/pivot/ingest/preview', { method: 'POST',
      data: { tenantKey, jobId, ruleId: rule.id, url: rule.jobUrl } });
    setBusy(false);
    if (result.error || !result.data?.success) setError(result.error || result.data?.message || 'Live preview failed.');
    else setLivePreview(result.data.data?.drafts || []);
  }

  return <div className="pivot-source-intel__rule">
    <div><strong>{rule.field === 'image' ? 'Image' : rule.field === 'description' ? 'Description' : 'Start date'}: {REASON_LABELS[rule.reason] || rule.reason}</strong>
      <span>{rule.status === 'proposed' ? 'Needs review' : rule.status === 'active' ? 'Active' : 'Disabled'}</span></div>
    <p>Example event {rule.exampleId}: <code>{rule.before || 'Empty'}</code> → <code>{rule.after || 'Empty'}</code></p>
    {rule.status === 'proposed' ? <div className="pivot-source-intel__learning-actions">
      <button type="button" disabled={busy} onClick={inspect}>Preview rule on catalog</button>
      {canShare ? <label>Apply to <select value={scope} onChange={(event) => setScope(event.target.value)}>
        <option value="entrypoint">This entrypoint</option><option value="source">All source entrypoints</option>
      </select></label> : null}
      <button type="button" disabled={busy || !preview} onClick={() => decide('approve')}>Approve rule</button>
      <button type="button" disabled={busy} onClick={() => decide('dismiss')}>Dismiss</button>
    </div> : <button type="button" disabled={busy} onClick={() => decide(rule.status === 'active' ? 'disable' : 'enable')}>
      {rule.status === 'active' ? 'Disable rule' : 'Enable rule'}
    </button>}
    {preview ? <div className="pivot-source-intel__rule-preview" role="status">
      <strong>Checked {preview.checked} catalog events · {preview.changed} would change</strong>
      <small>This replays saved catalog values; it does not recreate the original web page.</small>
      {preview.promptOnly ? <p>This rule mainly guides extraction. Test the current page to see its effect.</p> : null}
      {preview.examples.map((example) => <p key={example.eventId}>{example.name}: {example.before || 'Empty'} → {example.after || 'Empty'}</p>)}
      <button type="button" disabled={busy} onClick={testOnPage}>Test current page with rule (~5 credits)</button>
    </div> : null}
    {livePreview ? <p role="status">Current page extracted {livePreview.length} events with this rule. {livePreview.slice(0, 3).map((row) => row.draft?.name).filter(Boolean).join(' · ')}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

function JobLearning({ tenantKey, job, sourceHints, canShare, onUpdated }) {
  const [draft, setDraft] = useState(lines(job.extractionProfile?.promptHints));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [preview, setPreview] = useState(null);
  const [review, setReview] = useState({ missed: 0, discarded: 0, minutes: 0 });
  const [suggestionDrafts, setSuggestionDrafts] = useState({});

  useEffect(() => { setDraft(lines(job.extractionProfile?.promptHints)); }, [job.extractionProfile?.promptHints]);

  async function patchJob(data) {
    setBusy(true);
    const result = await authenticatedRequest(`/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs/${encodeURIComponent(job.id)}`,
      { method: 'PATCH', data });
    setBusy(false);
    if (result.error || !result.data?.success) {
      setFeedback(result.error || result.data?.message || 'Could not save job hints.');
      return;
    }
    setFeedback('Job guidance saved. The next crawl will use approved hints.');
    onUpdated();
  }

  async function testPreview() {
    setBusy(true);
    setPreview(null);
    const result = await authenticatedRequest('/admin/pivot/ingest/preview', { method: 'POST',
      data: { tenantKey, jobId: job.id, url: job.url } });
    setBusy(false);
    if (result.error || !result.data?.success) {
      setFeedback(result.error || result.data?.message || 'Preview failed.');
      return;
    }
    const data = result.data.data;
    setPreview({ count: data?.drafts?.length || 0,
      warnings: data?.warnings || [],
      samples: (data?.drafts || []).slice(0, 4).map((row) => ({
        name: row.draft?.name, start: row.draft?.start_time || row.draft?.startTime,
        location: row.draft?.location,
      })).filter((row) => row.name) });
    setFeedback('Preview uses the currently approved hints. Saving a new hint affects the next preview.');
  }

  async function saveReview() {
    setBusy(true);
    const result = await authenticatedRequest(`/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/curation-jobs/${encodeURIComponent(job.id)}/review-feedback`,
      { method: 'POST', data: { missed: Number(review.missed), discarded: Number(review.discarded),
        reviewSeconds: Math.round(Number(review.minutes) * 60) } });
    setBusy(false);
    if (result.error || !result.data?.success) {
      setFeedback(result.error || result.data?.message || 'Could not record feedback.');
      return;
    }
    setFeedback('Review feedback added to the latest run.');
    setReview({ missed: 0, discarded: 0, minutes: 0 });
    onUpdated();
  }

  const suggestions = job.extractionProfile?.suggestedHints || [];
  return (
    <div className="pivot-source-intel__learning-job">
      <h5>{job.label || job.url}</h5>
      <p>Entry point guidance applies only to this job. {sourceHints.length} shared source hint{sourceHints.length === 1 ? '' : 's'} also apply.</p>
      <label>Approved job hints, one per line
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Example: Dates above a group of cards apply to each card below." />
      </label>
      <div className="pivot-source-intel__learning-actions">
        <button type="button" disabled={busy} onClick={() => patchJob({ promptHints: hintsFromText(draft) })}>Save job hints</button>
        <button type="button" disabled={busy} onClick={testPreview}>Preview with approved hints (~5 credits)</button>
      </div>
      {suggestions.length ? <div className="pivot-source-intel__suggestions">
        <strong>Suggestions from corrected events</strong>
        {suggestions.map((suggestion) => <div key={suggestion.id}>
          <span>{suggestion.field} · event {suggestion.eventId}</span>
          <textarea rows={2} aria-label={`Suggested ${suggestion.field} hint`}
            value={suggestionDrafts[suggestion.id] ?? suggestion.text}
            onChange={(event) => setSuggestionDrafts((current) => ({ ...current, [suggestion.id]: event.target.value }))} />
          <div className="pivot-source-intel__learning-actions">
            <button type="button" disabled={busy} onClick={() => patchJob({ hintDecision: { id: suggestion.id,
              action: 'approve', text: suggestionDrafts[suggestion.id] ?? suggestion.text } })}>Approve</button>
            <button type="button" disabled={busy} onClick={() => patchJob({ hintDecision: { id: suggestion.id, action: 'dismiss' } })}>Dismiss</button>
          </div>
        </div>)}
      </div> : null}
      {(job.extractionProfile?.extractionRules || []).length ? <div className="pivot-source-intel__suggestions">
        <strong>Correction rules</strong>
        {(job.extractionProfile?.extractionRules || []).map((rule) => <RuleCard key={rule.id}
          rule={{ ...rule, jobUrl: job.url }} tenantKey={tenantKey} jobId={job.id} canShare={canShare} onUpdated={onUpdated} />)}
      </div> : null}
      {preview ? <div role="status" className="pivot-source-intel__preview">
        <strong>Preview found {preview.count} events</strong>
        {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        {preview.samples.map((sample) => <p key={sample.name}>{sample.name} · {sample.start || 'Time missing'} · {sample.location || 'Venue missing'}</p>)}
      </div> : null}
      <h5>Results over time</h5>
      <RunHistory runs={job.extractionProfile?.learningRuns} />
      <div className="pivot-source-intel__learning-feedback">
        <span>Record review of the latest run</span>
        <label>Missed events<input type="number" min="0" max="3600" value={review.missed}
          onChange={(event) => setReview((current) => ({ ...current, missed: event.target.value }))} /></label>
        <label>Discarded results<input type="number" min="0" max="3600" value={review.discarded}
          onChange={(event) => setReview((current) => ({ ...current, discarded: event.target.value }))} /></label>
        <label>Other review minutes<input type="number" min="0" max="60" value={review.minutes}
          onChange={(event) => setReview((current) => ({ ...current, minutes: event.target.value }))} /></label>
        <button type="button" disabled={busy} onClick={saveReview}>Record</button>
      </div>
      {feedback ? <p role="status">{feedback}</p> : null}
    </div>
  );
}

export default function PivotScrapeLearningPanel({ tenantKey, source, onUpdated }) {
  const [sourceDraft, setSourceDraft] = useState(lines(source.promptHints));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => { setSourceDraft(lines(source.promptHints)); }, [source.promptHints]);
  const jobs = (source.entrypoints || []).filter((entrypoint) => entrypoint.provider === 'generic-site');
  if (source.provider !== 'generic-site' && !jobs.length) return null;

  async function saveSource() {
    setSaving(true);
    const result = await authenticatedRequest(`/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/sources/${encodeURIComponent(source._id)}`,
      { method: 'PATCH', data: { promptHints: hintsFromText(sourceDraft) } });
    setSaving(false);
    if (result.error || !result.data?.success) {
      setFeedback(result.error || result.data?.message || 'Could not save source hints.');
      return;
    }
    setFeedback('Shared guidance saved. Future website crawls will use it.');
    onUpdated();
  }

  return (
    <div className="pivot-source-intel__section pivot-source-intel__learning">
      <div className="pivot-source-intel__section-heading"><h4>Scrape learning</h4><span>Approved guidance and measured outcomes</span></div>
      <p>Only approved hints affect Firecrawl. Corrections propose rules for review; they are never applied automatically.</p>
      <label>Shared source hints, one per line
        <textarea rows={3} value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)}
          placeholder="Example: The section date applies to all event cards beneath it." />
      </label>
      <button type="button" disabled={saving} onClick={saveSource}>Save shared hints</button>
      {feedback ? <p role="status">{feedback}</p> : null}
      {jobs.map((job) => <JobLearning key={job.id} tenantKey={tenantKey} job={job}
        sourceHints={source.promptHints || []} canShare={Boolean(source._id)} onUpdated={onUpdated} />)}
      {(source.extractionRules || []).length && jobs.length ? <div className="pivot-source-intel__suggestions">
        <strong>Shared source rules</strong>
        {source.extractionRules.map((rule) => <RuleCard key={rule.id} rule={{ ...rule, jobUrl: jobs[0].url }}
          tenantKey={tenantKey} jobId={jobs[0].id} canShare={false} onUpdated={onUpdated} />)}
      </div> : null}
      {!jobs.length ? <p className="pivot-source-intel__empty">Link a website Saved job to use source guidance and measure its crawls.</p> : null}
      <small>Estimated credits assume five Firecrawl credits per JSON extraction request. Results compare runs, not identical pages; changes in calendar content can also affect counts.</small>
    </div>
  );
}
