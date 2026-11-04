#!/usr/bin/env node
/**
 * Seed one agent-generated carousel draft for an editorial account, so the
 * review flow (unapproved badge, caption, Approve, Mark posted, feedback) can
 * be tried without Relay.
 *
 * It takes the path a real compose job takes: create the job, claim it as a
 * worker, build the worker context from the live catalog, then submit a
 * result through the worker submission path, which applies it. Every check a
 * real result faces (bindings, the posted-event and record-version re-checks,
 * posters, presets) runs. The draft's headline and caption say it is a test.
 *
 * Usage (from Meridian/backend):
 *   node migrations/seedCarouselComposeDraft.js                       # dry run: show what it would create
 *   node migrations/seedCarouselComposeDraft.js --write               # create the job and the draft
 *   node migrations/seedCarouselComposeDraft.js --account=just.go.sf --events=4 --write
 *   node migrations/seedCarouselComposeDraft.js --decision=needs-editor --write
 *   node migrations/seedCarouselComposeDraft.js --relay --write              # have Relay's agent compose it
 *
 * Options:
 *   --account=<key>        just.go.ic (default), just.go.sf or sorry.u.missed.it
 *   --events=<3-5>         events in the draft (default 3)
 *   --decision=<kind>      compose (default), wait or needs-editor
 *   --publication=<ISO>    proposed publication time (default: the next whole hour)
 *   --relay                create a real compose job for Relay's agent instead of a
 *                          scripted result; Relay must advertise carousel-compose
 *   --write                actually create the job and the draft
 *   --allow-production     required with --write when NODE_ENV=production
 *
 * The editorial account must already exist in the carousel editor under its
 * handle (@just.go.ic, @just.go.sf, @sorry.u.missed.it).
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const { connectToGlobalDatabase } = require('../connectionsManager');
const { EDITORIAL_ACCOUNTS } = require('../constants/pivotCarouselEditorialAccounts');
const {
  buildCarouselComposeContextSnapshot,
  listCarouselComposeScheduleAccounts,
} = require('../services/pivotCarouselComposeContextService');
const { createComputeJob, claimNextPendingJob, startComputeJob, findJobByExternalId } = require('../services/pivotComputeJobStore');
const { createAdminComputeJob } = require('../services/pivotComputeAdminService');
const { fetchJobContext, submitTerminalJobResult } = require('../services/pivotComputeWorkerService');
const { loadFixture, validateExecutionResult } = require('../utilities/pivotAdminComputeJobContract');

const LOG = '[seed:carousel-compose-draft]';
const WORKER_ID = 'compose-seed-script';
const DECISIONS = ['compose', 'wait', 'needs-editor'];
const CROP = { focalX: 0.5, focalY: 0.5, scale: 1 };
const EDITORIAL_ACCOUNT_KEYS = EDITORIAL_ACCOUNTS.map((account) => account.key);

function readArgs(argv) {
  const value = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const flag = (name) => argv.includes(`--${name}`);
  const nextHour = new Date();
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  const args = {
    account: value('account') || 'just.go.ic',
    events: Number(value('events') || 3),
    decision: value('decision') || 'compose',
    publication: value('publication') || nextHour.toISOString(),
    write: flag('write'),
    relay: flag('relay'),
    allowProduction: flag('allow-production'),
  };
  if (!EDITORIAL_ACCOUNT_KEYS.includes(args.account)) {
    throw new Error(`--account must be one of ${EDITORIAL_ACCOUNT_KEYS.join(', ')}`);
  }
  if (!Number.isInteger(args.events) || args.events < 3 || args.events > 5) throw new Error('--events must be 3, 4 or 5');
  if (!DECISIONS.includes(args.decision)) throw new Error(`--decision must be one of ${DECISIONS.join(', ')}`);
  if (!Number.isFinite(new Date(args.publication).getTime())) throw new Error('--publication must be an ISO date-time');
  if (args.relay && args.decision !== 'compose') throw new Error('--relay lets the agent decide; drop --decision');
  args.publication = new Date(args.publication).toISOString();
  return args;
}

/** The cover family the last posted issue did not use, so no repeat reason is needed. */
function pickCover(context) {
  const last = context.lastPostedIssues[0]?.cover;
  const family = context.templates.coverFamilies.find((name) => name !== last?.family) || context.templates.coverFamilies[0];
  const variation = family === last?.family && last?.variation === 1 ? 2 : 1;
  return { family, variation };
}

function composition(context, count) {
  const withPosters = context.candidates.filter((candidate) => typeof candidate.snapshot?.image === 'string' && candidate.snapshot.image);
  if (withPosters.length < count) {
    throw new Error(`Only ${withPosters.length} of ${context.candidates.length} candidate events have a poster; `
      + `a draft needs ${count}. Try --events=3, another --account, or --decision=needs-editor.`);
  }
  const selected = withPosters.slice(0, count);
  const refs = selected.map((candidate) => candidate.ref);
  const presets = context.templates.eventPresets;
  const city = context.account.displayName;
  return {
    selectedEventRefs: refs,
    evidenceRefs: refs.map((ref) => `catalog:${ref.eventId}`),
    cover: {
      headline: `Test draft · ${city}`,
      subtitle: `${count} events seeded for review`,
      ...pickCover(context),
      assetRef: { kind: 'event-poster', eventRef: refs[0] },
      crop: CROP,
    },
    eventSlides: selected.map((candidate, index) => ({
      eventRef: candidate.ref,
      blurb: `${candidate.snapshot.name || 'Event'}${candidate.snapshot.location ? ` · ${candidate.snapshot.location}` : ''}`.slice(0, 1000),
      presetId: presets[index % presets.length],
      assetRef: { kind: 'event-poster', eventRef: candidate.ref },
      crop: CROP,
    })),
    socialCaption: [
      '[Seeded test draft. Not for posting.]',
      ...selected.map((candidate) => `• ${candidate.snapshot.name || 'Event'}`),
    ].join('\n'),
  };
}

function result({ job, context, args }) {
  const body = {
    contractVersion: '1',
    jobId: job.externalJobId,
    scheduleOccurrenceId: job.scheduleOccurrenceId || null,
    kind: 'carousel-compose',
    cityKey: job.cityKey,
    implementationRevision: WORKER_ID,
    idempotencyKey: `idem:${job.externalJobId}`,
    basedOnContextVersion: context.contextVersion,
    completedAt: new Date().toISOString(),
    outcome: 'completed',
    editorialAccountKey: args.account,
    decision: args.decision,
  };
  if (args.decision === 'compose') body.composition = composition(context, args.events);
  else body.reason = `Seeded ${args.decision} decision for testing the review flow.`;
  const validation = validateExecutionResult(body);
  if (!validation.valid) throw new Error(`Seeded result fails the contract: ${validation.errors.join(', ')}`);
  return body;
}

function describe(context, args, log) {
  const { coverage, window } = context;
  log(`account ${context.account.handle} (${context.account.displayName}), city ${context.cityKey}, timezone ${context.account.timezone}`);
  log(`window ${window.from} → ${window.to}${window.toExclusive ? ' (exclusive)' : ''}`);
  log(`${context.candidates.length} candidates from ${coverage.tenantsRead} tenant(s)`
    + `${coverage.cutOff ? ', cut off at the cap' : ''}${coverage.complete ? '' : ', coverage incomplete'}`);
  if (args.decision === 'compose') {
    const draft = composition(context, args.events);
    log(`draft: cover ${draft.cover.family} v${draft.cover.variation}, events:`);
    draft.eventSlides.forEach((slide) => log(`  ${slide.presetId}: ${slide.blurb}`));
  } else log(`decision: ${args.decision} (no draft is created)`);
}

/**
 * Seed one compose outcome. Without `args.write` it only builds the context
 * and reports what it would create. Returns the job id and, for a compose
 * decision, the new draft's issue id.
 */
async function seedCarouselComposeDraft(req, args, { log = () => {}, createAdminJob = createAdminComputeJob } = {}) {
  const listed = await listCarouselComposeScheduleAccounts(req);
  const owner = listed.accounts.find((account) => account.key === args.account);
  if (!owner?.cityKey) throw new Error(`${args.account} has no owner city yet; set the carousel account's owner tenant first.`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Job ids and idempotency keys allow only [a-zA-Z0-9:_-], so the account's dots become dashes.
  const accountSlug = args.account.replace(/\./g, '-');
  const externalJobId = `job:compose-seed-${accountSlug}-${stamp}`;
  const options = { editorialAccountKey: args.account, proposedPublicationAt: args.publication };

  if (!args.write) {
    const preview = await buildCarouselComposeContextSnapshot(req, {
      job: { externalJobId, cityKey: owner.cityKey, options },
    });
    if (preview.error) throw new Error(`${preview.code || 'CONTEXT'}: ${preview.error}`);
    describe(preview.data.snapshot, args, log);
    log('dry run: nothing was written. Pass --write to create the job and the draft.');
    return { written: false, externalJobId: null, issueId: null };
  }

  if (args.relay) {
    // The same request an admin would post to /admin/pivot/compute-jobs. Relay's
    // worker claims it, Meridian serves the context, and the agent's own decision
    // comes back through the worker path.
    const created = await createAdminJob(req, {
      request: {
        contractVersion: '1', jobId: externalJobId, scheduleOccurrenceId: null, kind: 'carousel-compose',
        cityKey: owner.cityKey, implementationRevision: WORKER_ID, contextVersion: 'ctx:pending',
        requestedAt: new Date().toISOString(), idempotencyKey: `idem:compose-relay-${accountSlug}-${stamp}`, options,
      },
      actor: WORKER_ID,
    });
    log(`queued ${externalJobId} for Relay (wake: ${created.wake?.status || 'unknown'}).`);
    log('Relay claims it, runs the agent and submits its decision; a compose decision appears under "Unapproved drafts".');
    return { written: true, externalJobId, issueId: null, decision: null, wake: created.wake?.status || null };
  }

  const now = new Date();
  const capability = {
    ...loadFixture('worker-capability-valid.json'),
    workerId: WORKER_ID,
    implementationRevision: WORKER_ID,
    supportedKinds: ['carousel-compose'],
    advertisedAt: now.toISOString(),
  };
  const { job } = await createComputeJob(req, {
    externalJobId,
    kind: 'carousel-compose',
    cityKey: owner.cityKey,
    contextVersion: 'ctx:pending',
    createIdempotencyKey: `idem:compose-seed-${accountSlug}-${stamp}`,
    origin: { type: 'admin' },
    options,
  });
  const claim = await claimNextPendingJob(req, { externalJobId, workerId: WORKER_ID, capability, now });
  if (!claim?.job?.lease?.token) throw new Error(`Could not claim ${externalJobId}; another worker may hold it.`);
  const leaseToken = claim.job.lease.token;
  const { context } = await fetchJobContext(req, { externalJobId, workerId: WORKER_ID, leaseToken, now });
  describe(context, args, log);
  await startComputeJob(req, { externalJobId, workerId: WORKER_ID, leaseToken, now });
  const submitted = await submitTerminalJobResult(req, {
    workerId: WORKER_ID,
    externalJobId,
    now: new Date(),
    body: { leaseToken, capability, result: result({ job, context, args }), requiresReview: true },
  });
  const stored = await findJobByExternalId(req, externalJobId);
  const outcome = stored?.composeOutcome || submitted?.job?.composeOutcome;
  log(`job ${externalJobId}: ${stored?.status || submitted?.job?.status}, decision ${outcome?.decision || 'none'}`);
  if (outcome?.issueId) {
    log(`unapproved draft ${outcome.issueId} on ${context.account.handle} (account ${context.account.id}).`);
    log(`Open Platform Admin → Pivot tenant dashboard (${owner.cityKey}) → Carousel → "Unapproved drafts".`);
  }
  return { written: true, externalJobId, issueId: outcome?.issueId ? String(outcome.issueId) : null, decision: outcome?.decision };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.write && process.env.NODE_ENV === 'production' && !args.allowProduction) {
    throw new Error('NODE_ENV is production; pass --allow-production as well as --write to seed here.');
  }
  const req = { globalDb: await connectToGlobalDatabase(), user: { globalUserId: WORKER_ID } };
  await seedCarouselComposeDraft(req, args, { log: (line) => console.log(`${LOG} ${line}`) });
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`${LOG} failed:`, error.message || error);
      process.exitCode = 1;
    })
    .finally(() => {
      setTimeout(() => process.exit(process.exitCode || 0), 100);
    });
}

module.exports = { seedCarouselComposeDraft, readArgs };
