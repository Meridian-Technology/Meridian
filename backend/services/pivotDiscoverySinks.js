const getGlobalModels = require('./getGlobalModelService');
const { createCurationJob, updateCurationJob } = require('./pivotCurationJobService');
const { startCurationBatch } = require('./pivotCurationBatchService');
const { toIsoWeek } = require('../utilities/pivotIsoWeek');

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sortedTags(values) {
  return [...new Set((values || []).map((tag) => trimString(tag)).filter(Boolean))].sort();
}

function isoTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function boundedString(value, maxLength) {
  const normalized = trimString(value);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeHttpsUrl(value, maxLength = 2048) {
  const normalized = trimString(value);
  if (!normalized || normalized.length > maxLength) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' ? normalized : null;
  } catch {
    return null;
  }
}

function createProposalCollector() {
  return {
    sources: [],
    curationJobs: [],
    events: [],
  };
}

function contextJobToRuntime(job) {
  return {
    _id: job.jobId,
    tenantKey: job.cityKey,
    label: job.label,
    url: job.url,
    provider: job.provider,
    enabled: job.enabled !== false,
    defaultTags: Array.isArray(job.defaultTags) ? job.defaultTags : [],
    defaultBatchWeekStrategy: job.defaultBatchWeekStrategy || 'next-drop',
    recordVersion: job.recordVersion,
  };
}

function buildSourceProposal(existing, outcome, seedTags) {
  const host = outcome.candidate.host;
  return {
    action: existing ? 'update' : 'create',
    host,
    url: outcome.url,
    label: trimString(outcome.label) || null,
    provider: outcome.provider,
    status: outcome.status,
    enabled: existing?.enabled !== false,
    seedTags: sortedTags(seedTags),
    rejectedReason: outcome.status === 'rejected' ? (outcome.rejectedReason || null) : null,
    basedOnRecordVersion: existing?.recordVersion || null,
    evidence: {
      eventCount: outcome.eventCount || 0,
      indexUrl: outcome.url,
      discoveredVia: outcome.candidate.discoveredVia || null,
    },
  };
}

function buildCurationJobProposal(existing, { label, url, provider, defaultTags, host }) {
  return {
    action: existing ? 'update' : 'create',
    label,
    url: url || null,
    provider,
    enabled: existing?.enabled !== false,
    defaultTags: sortedTags(defaultTags),
    basedOnRecordVersion: existing?.recordVersion || null,
    linkedSourceHost: host || null,
  };
}

function buildEventProposalFromEntry(entry, {
  host,
  provider,
  defaultTags,
  linkedJobId,
  batchWeek,
  forceBatchWeek,
  basedOnEventVersion,
}) {
  const draft = entry?.draft || entry;
  const sourceUrl = safeHttpsUrl(draft?.sourceUrl || entry?.sourceUrl);
  const name = boundedString(draft?.name, 500);
  const startTime = draft?.start_time;
  if (!sourceUrl || !name || !startTime) return null;
  const startIso = isoTimestamp(startTime);
  if (!startIso) return null;

  const tags = sortedTags([...(defaultTags || []), ...(draft?.tags || [])])
    .map((tag) => tag.slice(0, 64))
    .slice(0, 16);
  const resolvedBatchWeek = forceBatchWeek && batchWeek
    ? batchWeek
    : toIsoWeek(new Date(startIso));
  const safeLinkedJobId = /^[0-9a-f]{24}$/.test(String(linkedJobId || ''))
    ? String(linkedJobId)
    : null;

  return {
    action: 'upsert',
    sourceUrl,
    batchWeek: resolvedBatchWeek,
    draft: {
      name,
      description: boundedString(draft.description, 5000),
      image: safeHttpsUrl(draft.image),
      location: boundedString(draft.location, 500),
      rawLocationText: boundedString(draft.rawLocationText, 500),
      start_time: startIso,
      end_time: draft.end_time ? isoTimestamp(draft.end_time) : null,
      sourceUrl,
      hostName: boundedString(draft.hostName || draft.host?.name, 300),
      hostProfileUrl: safeHttpsUrl(draft.hostProfileUrl || draft.host?.profileUrl),
      tags,
      ...(draft.scrapeEvidence ? { scrapeEvidence: {
        imageCandidates: [...new Set((draft.scrapeEvidence.imageCandidates || [])
          .map((url) => safeHttpsUrl(url)).filter(Boolean))].slice(0, 6),
        appliedRuleIds: (draft.scrapeEvidence.appliedRuleIds || [])
          .filter((id) => typeof id === 'string').map((id) => id.slice(0, 200)).slice(0, 30),
      } } : {}),
    },
    basedOnEventVersion: basedOnEventVersion || null,
    linkedJobId: safeLinkedJobId,
    evidence: {
      ...(boundedString(host, 253) ? { discoveredFromHost: boundedString(host, 253) } : {}),
      provider,
    },
  };
}

function serializeArtifactSource(outcome, seedTags, existing) {
  return {
    host: outcome.candidate.host,
    url: outcome.url,
    label: trimString(outcome.label) || null,
    provider: outcome.provider,
    status: outcome.status,
    rejectedReason: outcome.rejectedReason || null,
    enabled: existing?.enabled !== false,
    seedTags: sortedTags(seedTags),
    lastEventCount: outcome.eventCount || 0,
    curationJobId: null,
    recordVersion: existing?.recordVersion || null,
  };
}

function findContextJobForHost(contextSnapshot, host, provider) {
  const normalizedHost = trimString(host).toLowerCase();
  return (contextSnapshot.curationJobs || []).find((job) => {
    if (provider && job.provider === provider) return true;
    if (!job.url || !normalizedHost) return false;
    try {
      return new URL(job.url).hostname.replace(/^www\./, '') === normalizedHost;
    } catch {
      return false;
    }
  }) || null;
}

function createDatabaseDiscoverySinks(req, handlers = {}) {
  const {
    persistBootstrappedSource,
    persistOutcome,
    crawlNativeJob,
    ingestEvents,
  } = handlers;

  return {
    mode: 'database',

    async listEnabledJobs(tenantKey) {
      const { PivotCurationJob } = getGlobalModels(req, 'PivotCurationJob');
      const jobs = await PivotCurationJob.find({ tenantKey, enabled: { $ne: false } }).lean();
      return Array.isArray(jobs) ? jobs : [];
    },

    async loadKnownHosts(tenantKey, recheckRejected) {
      const { PivotCitySource } = getGlobalModels(req, 'PivotCitySource');
      const rows = await PivotCitySource.find({ tenantKey }).select('host status').lean();
      return new Set(
        rows
          .filter((row) => recheckRejected !== true || row.status !== 'rejected')
          .map((row) => row.host),
      );
    },

    createCurationJob: (payload) => createCurationJob(req, payload),
    updateCurationJob: (payload) => updateCurationJob(req, payload),
    persistBootstrappedSource: (...args) => persistBootstrappedSource(req, ...args),
    crawlNativeJob: (params) => crawlNativeJob(req, params),
    persistOutcome: (tenantKey, outcome, now) => persistOutcome(req, tenantKey, outcome, now),

    async linkSourceToJob(doc, jobId) {
      doc.curationJobId = jobId;
      await doc.save();
    },

    ingestDiscoveredEvents: (params) => ingestEvents(req, params),
    startNativeBatch: (params) => startCurationBatch(req, params),
  };
}

function createArtifactDiscoverySinks(contextSnapshot, collector, handlers = {}) {
  const sourceByHost = new Map(
    (contextSnapshot.sources || []).map((row) => [row.host, row]),
  );
  const proposedJobIds = new Map();
  let proposedJobCounter = 0;

  function nextProposedJobId(provider) {
    const key = provider || 'job';
    const count = (proposedJobCounter += 1);
    return `proposed-${key}-${count}`;
  }

  function runtimeJobFromContext(job) {
    return contextJobToRuntime({ ...job, cityKey: contextSnapshot.cityKey });
  }

  return {
    mode: 'artifact',
    collector,

    async listEnabledJobs() {
      return (contextSnapshot.curationJobs || [])
        .filter((job) => job.enabled !== false)
        .map(runtimeJobFromContext);
    },

    async loadKnownHosts(_tenantKey, recheckRejected) {
      return new Set(
        (contextSnapshot.sources || [])
          .filter((row) => recheckRejected === true || row.status !== 'rejected')
          .map((row) => row.host),
      );
    },

    async createCurationJob(payload) {
      const jobId = nextProposedJobId(payload.provider);
      proposedJobIds.set(`${payload.provider}:${payload.url}`, jobId);
      const proposal = buildCurationJobProposal(null, {
        label: payload.label,
        url: payload.url,
        provider: payload.provider,
        defaultTags: payload.defaultTags,
        host: payload.linkedSourceHost || null,
      });
      collector.curationJobs.push(proposal);
      return {
        data: {
          job: {
            _id: jobId,
            label: payload.label,
            url: payload.url,
            provider: payload.provider,
            defaultTags: proposal.defaultTags,
          },
        },
      };
    },

    async updateCurationJob(payload) {
      const existing = (contextSnapshot.curationJobs || []).find((job) => job.jobId === payload.jobId);
      const proposal = buildCurationJobProposal(existing, {
        label: existing?.label || payload.label,
        url: payload.url,
        provider: existing?.provider || payload.provider,
        defaultTags: existing?.defaultTags || payload.defaultTags,
        host: existing ? findContextJobForHost(contextSnapshot, null, existing.provider)?.linkedSourceHost : null,
      });
      collector.curationJobs.push(proposal);
      return {
        data: {
          job: {
            _id: payload.jobId,
            url: payload.url,
          },
        },
      };
    },

    async persistBootstrappedSource(_tenantKey, spec, _now, jobId, extras = {}) {
      const existing = sourceByHost.get(spec.host);
      const outcome = {
        candidate: {
          host: spec.host,
          discoveredVia: 'native-bootstrap',
          seedTags: new Set(),
        },
        status: 'qualified',
        provider: spec.provider,
        url: spec.url,
        label: spec.label,
        eventCount: extras.lastEventCount || 0,
      };
      const proposal = buildSourceProposal(existing, outcome, []);
      collector.sources.push(proposal);
      sourceByHost.set(spec.host, {
        ...proposal,
        recordVersion: proposal.basedOnRecordVersion,
      });
      return {
        host: spec.host,
        url: spec.url,
        provider: spec.provider,
        curationJobId: jobId,
      };
    },

    async crawlNativeJob() {
      return { upserted: 0, skipped: 0, failed: 0 };
    },

    async persistOutcome(_tenantKey, outcome, _now) {
      const seedTags = [...outcome.candidate.seedTags];
      const existing = sourceByHost.get(outcome.candidate.host);
      const proposal = buildSourceProposal(existing, outcome, seedTags);
      collector.sources.push(proposal);
      const serialized = serializeArtifactSource(outcome, seedTags, existing);
      sourceByHost.set(outcome.candidate.host, {
        ...serialized,
        recordVersion: proposal.basedOnRecordVersion,
      });
      return serialized;
    },

    async linkSourceToJob(_doc, jobId) {
      if (_doc) _doc.curationJobId = jobId;
    },

    async ingestDiscoveredEvents({ source, entries }) {
      let upserted = 0;
      for (const entry of entries || []) {
        const proposal = buildEventProposalFromEntry(entry, {
          host: source.host,
          provider: source.provider,
          defaultTags: source.seedTags,
          linkedJobId: null,
        });
        if (!proposal) continue;
        collector.events.push(proposal);
        upserted += 1;
      }
      return { upserted, skipped: 0, failed: 0 };
    },

    async startNativeBatch() {
      return { data: { started: false, artifact: true } };
    },
  };
}

module.exports = {
  createProposalCollector,
  createDatabaseDiscoverySinks,
  createArtifactDiscoverySinks,
  buildSourceProposal,
  buildCurationJobProposal,
  buildEventProposalFromEntry,
  findContextJobForHost,
};
