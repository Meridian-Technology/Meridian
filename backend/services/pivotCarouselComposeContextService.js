/** Read-only, catalog-only context for a new issue. Never reserves or revises a draft. */
const { createHash } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { getMergedTenants, getTenantByKey } = require('./tenantConfigService');
const { loadAccount } = require('./pivotCarouselIssueService');
const { listEditorialFeedback } = require('./pivotCarouselEditorialFeedbackService');
const { searchEditorialCatalogPage, SOURCE_CONCURRENCY } = require('./pivotCarouselCurationQueryService');
const { compareCandidates } = require('./pivotCarouselCurationQuery');
const { EDITORIAL_ACCOUNTS, COMPOSE_POLICY, editorialAccountFor } = require('../constants/pivotCarouselEditorialAccounts');
const { zonedParts, zonedCivilToUtc, isValidTimeZone } = require('../utilities/pivotFieldParsingUtils');
const { CONTRACT_VERSION, validateContextSnapshot } = require('../utilities/pivotAdminComputeJobContract');
const { resolveImplementationRevision } = require('../utilities/pivotComputeContextVersion');
const { COVER_FAMILIES, EVENT_PRESETS, BACK_PRESETS, titleOf } = require('./pivotCarouselPresets');
const { listComposeCoverAssets } = require('./pivotCarouselCompositionService');

const CONTEXT_LIMITS = Object.freeze({ events: 60, postedIssues: 10, pageSize: 24, pagesPerTenant: 100, bytes: 2 * 1024 * 1024 });
const refKey = ref => `${ref.sourceTenantKey}:${ref.eventId}`;
const fail = (error, code, status = 400) => ({ error, code, status });

function shiftLocalDays(time, days, timezone) {
  const civil = zonedParts(time, timezone);
  const shifted = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + days));
  const base = zonedCivilToUtc({ ...civil, year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }, timezone);
  return new Date(base.getTime() + time.getUTCSeconds() * 1000 + time.getUTCMilliseconds());
}

function composeWindow(account, proposedPublicationAt, timezone = account.timezone) {
  const publication = new Date(proposedPublicationAt);
  if (!proposedPublicationAt || Number.isNaN(publication.getTime()) || !isValidTimeZone(timezone)) return null;
  const past = account.window === 'past';
  return {
    from: (past ? shiftLocalDays(publication, -account.days, timezone) : publication).toISOString(),
    to: (past ? publication : shiftLocalDays(publication, account.days, timezone)).toISOString(),
    toExclusive: past, timezone, mode: account.window, days: account.days,
  };
}

async function resolveEditorialAccount(req, accountKey) {
  const definition = editorialAccountFor(accountKey);
  if (!definition) return fail('Unknown editorial account.', 'EDITORIAL_ACCOUNT_UNKNOWN');
  const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
  // Both conventions are accepted by the existing account editor.
  const accounts = await PivotCarouselAccount.find({ handle: { $in: [definition.handle, definition.key] } }).limit(2).lean();
  if (!accounts.length) return fail('Editorial account has not been created in the carousel editor.', 'EDITORIAL_ACCOUNT_NOT_FOUND', 404);
  if (accounts.length !== 1) return fail('Editorial handle matches multiple carousel accounts.', 'EDITORIAL_ACCOUNT_AMBIGUOUS', 409);
  const loaded = await loadAccount(req, String(accounts[0]._id));
  if (loaded.error) return loaded;
  const account = loaded.account;
  if (definition.ownerTenantKey && account.ownerTenantKey !== definition.ownerTenantKey) {
    return fail('Editorial account is attached to the wrong owner tenant.', 'EDITORIAL_ACCOUNT_TENANT_MISMATCH', 409);
  }
  const owner = await getTenantByKey(req, account.ownerTenantKey);
  const timezone = definition.timezone || owner?.pivotDropTimezone || owner?.timezone || 'UTC';
  return { definition, account, timezone };
}

/** Minimal read-only scheduling metadata; account owners remain the source of truth. */
async function listCarouselComposeScheduleAccounts(req) {
  return { accounts: await Promise.all(EDITORIAL_ACCOUNTS.map(async definition => {
    const resolved = await resolveEditorialAccount(req, definition.key);
    return {
      key: definition.key,
      cityKey: resolved.error ? definition.ownerTenantKey : resolved.account.ownerTenantKey,
      timezone: resolved.error ? definition.timezone : resolved.timezone,
    };
  })) };
}

function snapshotRefs(snapshot, tenantKey) {
  const refs = [ ...(snapshot.sources || []), ...(snapshot.document?.slides || []).map(slide => slide.source) ];
  for (const slide of snapshot.slides || []) {
    for (const event of slide.events || []) refs.push({ sourceTenantKey: tenantKey, eventId: event.eventId });
  }
  const unique = new Map();
  for (const ref of refs) {
    if (ref?.sourceTenantKey && ref.eventId) {
      const normalized = { sourceTenantKey: String(ref.sourceTenantKey).trim().toLowerCase(), eventId: String(ref.eventId).trim().toLowerCase() };
      unique.set(refKey(normalized), normalized);
    }
  }
  return [...unique.values()];
}

/** Only postHistory entries committed by mark-posted count, including edited/archived heads.
 * Reading all posted refs prevents reuse of an event older than the ten-issue prompt history.
 */
async function postedHistory(req, accountId) {
  const { PivotCarouselDeck, PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselDeck', 'PivotCarouselRevision');
  const issues = await PivotCarouselDeck.find({ accountId, 'postHistory.0': { $exists: true } })
    .select('tenantKey postHistory').lean();
  const posts = issues.flatMap(issue => issue.postHistory.map(post => ({ ...post, issueId: String(issue._id), tenantKey: issue.tenantKey })));
  // Read references for all posts, but full slide documents for only the recent ten.
  const snapshots = await PivotCarouselRevision.find({ accountId, kind: 'posted', _id: { $in: posts.map(post => post.snapshotRevisionId) } })
    .select('issueId headRevision sources document.slides.source slides.events.eventId').lean();
  const byId = new Map(snapshots.map(snapshot => [String(snapshot._id), snapshot]));
  const used = new Set();
  for (const post of posts) {
    const snapshot = byId.get(String(post.snapshotRevisionId));
    if (!snapshot || String(snapshot.issueId) !== post.issueId || snapshot.headRevision !== post.revision) {
      return fail('A confirmed posted snapshot is unavailable.', 'POSTED_HISTORY_UNAVAILABLE', 409);
    }
    snapshotRefs(snapshot, post.tenantKey).forEach(ref => used.add(refKey(ref)));
  }
  posts.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt) || b.issueId.localeCompare(a.issueId) || b.revision - a.revision);
  const seen = new Set();
  const recentPosts = posts.filter(post => {
    if (seen.has(post.issueId)) return false;
    seen.add(post.issueId); return true;
  }).slice(0, CONTEXT_LIMITS.postedIssues);
  const recentSnapshots = await PivotCarouselRevision.find({ accountId, kind: 'posted', _id: { $in: recentPosts.map(post => post.snapshotRevisionId) } })
    .select('document slides socialCaption').lean();
  const recentById = new Map(recentSnapshots.map(snapshot => [String(snapshot._id), snapshot]));
  const recent = [];
  for (const post of recentPosts) {
    const snapshot = recentById.get(String(post.snapshotRevisionId));
    if (!snapshot) return fail('A confirmed posted snapshot is unavailable.', 'POSTED_HISTORY_UNAVAILABLE', 409);
    const cover = snapshot.document?.slides?.find(slide => slide.role === 'cover');
    const legacyCover = snapshot.slides?.find(slide => slide.type === 'cover');
    recent.push({
      issueId: post.issueId, revision: post.revision, postedAt: new Date(post.postedAt).toISOString(),
      events: snapshotRefs(byId.get(String(post.snapshotRevisionId)), post.tenantKey),
      cover: { family: cover?.preset?.family || cover?.preset?.id || null, variation: cover?.preset?.variation || null },
      headline: cover ? titleOf(cover) : String(legacyCover?.values?.coverLine || legacyCover?.values?.name || ''),
      socialCaption: snapshot.socialCaption || '',
    });
  }
  return { used, recent };
}

async function readCandidates(req, tenantKeys, window, used, now) {
  const states = tenantKeys.map(tenantKey => ({ tenantKey, cursor: null, pagesRead: 0, complete: false, candidatesRead: 0, error: null }));
  const candidates = [];
  const seen = new Set();
  let cutOff = false;
  const sort = window.mode === 'past' ? 'date' : 'date-asc';
  while (true) {
    const active = states.filter(state => !state.complete && !state.error && state.pagesRead < CONTEXT_LIMITS.pagesPerTenant);
    if (!active.length) break;
    const pages = [];
    // First round reads every tenant even if earlier cities already fill the context.
    for (let index = 0; index < active.length; index += SOURCE_CONCURRENCY) {
      const batch = active.slice(index, index + SOURCE_CONCURRENCY);
      pages.push(...await Promise.all(batch.map(async state => {
        const result = await searchEditorialCatalogPage(req, state.tenantKey, {
          dateFrom: window.from, dateTo: window.to, dateToExclusive: window.toExclusive,
          timezone: window.timezone, sort, limit: CONTEXT_LIMITS.pageSize, cursor: state.cursor,
        }, { now, usedEventIds: [...used].filter(key => key.startsWith(`${state.tenantKey}:`)).map(key => key.slice(state.tenantKey.length + 1)) });
        state.pagesRead += 1;
        if (result.error || result.data.sources.some(source => source.status !== 'ok')) {
          state.error = 'CATALOG_READ_FAILED';
          return [];
        }
        const page = result.data;
        state.candidatesRead += page.candidates.length;
        state.complete = page.continuation.complete;
        if (!state.complete && (!page.continuation.cursor || state.cursor === page.continuation.cursor)) {
          state.error = 'CATALOG_CURSOR_STALLED';
        }
        state.cursor = page.continuation.cursor;
        return page.candidates;
      })));
    }
    // Interleave cities before enforcing the cap; no first city's first-page monopoly.
    const longest = Math.max(0, ...pages.map(page => page.length));
    for (let index = 0; index < longest; index += 1) {
      for (const page of pages) {
        const candidate = page[index];
        if (!candidate || seen.has(refKey(candidate.ref)) || used.has(refKey(candidate.ref))) continue;
        seen.add(refKey(candidate.ref));
        if (candidates.length === CONTEXT_LIMITS.events) { cutOff = true; continue; }
        candidates.push(candidate);
      }
    }
    if (candidates.length === CONTEXT_LIMITS.events) {
      cutOff ||= states.some(state => !state.complete && !state.error);
      break;
    }
  }
  cutOff ||= states.some(state => !state.complete && !state.error);
  return {
    candidates: candidates.sort((a, b) => compareCandidates(a, b, sort, { pin: true })),
    coverage: {
      tenantsRead: states.filter(state => state.pagesRead > 0).length,
      pagesRead: states.reduce((count, state) => count + state.pagesRead, 0),
      cutOff, complete: !cutOff && states.every(state => state.complete),
      candidateCount: candidates.length,
      tenants: states.map(({ cursor, ...state }) => state),
    },
  };
}

async function buildCarouselComposeContextSnapshot(req, { job, now = new Date(), sinceVersion = null }) {
  const resolved = await resolveEditorialAccount(req, job.options?.editorialAccountKey);
  if (resolved.error) return resolved;
  const { definition, account, timezone } = resolved;
  const window = composeWindow(definition, job.options?.proposedPublicationAt, timezone);
  if (!window) return fail('Publication time or account timezone is invalid.', 'COMPOSE_WINDOW_INVALID');
  if (definition.ownerTenantKey && job.cityKey !== definition.ownerTenantKey) {
    return fail('Compose job city does not match its editorial account.', 'COMPOSE_CITY_MISMATCH');
  }
  const tenants = await getMergedTenants(req);
  const tenantKeys = definition.sourceTenantKeys === 'all'
    ? [...new Set(tenants.map(tenant => tenant.tenantKey))].sort()
    : [...definition.sourceTenantKeys];
  const history = await postedHistory(req, account._id);
  if (history.error) return history;
  const feedback = await listEditorialFeedback(req, String(account._id), sinceVersion);
  if (feedback.error) return feedback;
  const { candidates, coverage } = await readCandidates(req, tenantKeys, window, history.used, now);
  const snapshot = JSON.parse(JSON.stringify({
    contractVersion: CONTRACT_VERSION, jobId: job.externalJobId,
    scheduleOccurrenceId: job.scheduleOccurrenceId || null, kind: 'carousel-compose',
    cityKey: job.cityKey, implementationRevision: job.implementationRevision || resolveImplementationRevision(),
    contextVersion: 'ctx:compose.pending', snapshotAt: now.toISOString(),
    editorialAccountKey: definition.key, proposedPublicationAt: new Date(job.options.proposedPublicationAt).toISOString(),
    account: { id: String(account._id), key: definition.key, displayName: definition.displayName,
      handle: definition.handle, format: definition.format, ownerTenantKey: account.ownerTenantKey,
      sourceTenantKeys: tenantKeys, timezone, voice: account.voice || {} },
    policy: COMPOSE_POLICY, window, candidates,
    lastPostedIssues: history.recent,
    coverAssets: await listComposeCoverAssets(req, account._id),
    editorialFeedback: feedback.data, coverage,
    templates: { version: 2, coverFamilies: COVER_FAMILIES, coverVariations: [1, 2, 3], eventPresets: EVENT_PRESETS, closingPresets: BACK_PRESETS },
    missingSignals: ['Catalog interest does not verify attendance.', 'No web, social or calendar lookups were performed.'],
  }));
  const material = { ...snapshot, candidates: snapshot.candidates.map(candidate => {
    const { capturedAt, ...provenance } = candidate.provenance;
    return { ...candidate, provenance };
  }) };
  delete material.contextVersion; delete material.snapshotAt;
  snapshot.contextVersion = `ctx:compose.${createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 32)}`;
  if (Buffer.byteLength(JSON.stringify(snapshot)) > CONTEXT_LIMITS.bytes) return fail('Compose context exceeds its byte limit.', 'COMPOSE_CONTEXT_TOO_LARGE', 422);
  const validation = validateContextSnapshot(snapshot);
  if (!validation.valid) return fail(`Invalid compose context: ${validation.errors.join(', ')}`, 'COMPOSE_CONTEXT_INVALID', 500);
  return { data: { snapshot } };
}

module.exports = { listCarouselComposeScheduleAccounts, EDITORIAL_ACCOUNTS, CONTEXT_LIMITS, composeWindow, resolveEditorialAccount, postedHistory, buildCarouselComposeContextSnapshot };
