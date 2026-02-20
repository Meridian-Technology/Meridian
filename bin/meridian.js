#!/usr/bin/env node
/**
 * Meridian CLI - coordinates work across Meridian + Events-Backend repos.
 *
 * Why lockfile pins exist:
 *   private-deps.lock pins private modules (Events-Backend) by SHA so Heroku builds
 *   are deterministic. Without pins, branch drift causes mismatched subrepo commits.
 *
 * Why merge-to-main before pin:
 *   We pin only SHAs that exist on origin/main. This ensures staging deploys use
 *   code that has passed review and is on main. Prevents downtime from pinning
 *   unmerged or divergent commits.
 *
 * Anti-downtime rationale:
 *   Past downtime occurred when Meridian branch pointed at Events code that wasn't
 *   merged or was from a different branch. Pinning merged main SHAs prevents this.
 */

const path = require('path');
const { findWorkspaceRoot, getRepoPaths, assertRepoExists } = require('./lib/workspace');
const {
  isClean,
  currentBranch,
  branchExistsLocal,
  branchExistsRemote,
  fetchAll,
  getHeadSha,
  getShortSha,
  checkoutBranch,
  pull,
  push,
  isPushed,
} = require('./lib/git');
const { promptYesNo, promptChoice } = require('./lib/prompts');
const { setEventsRef, getEventsRef } = require('./lib/lockfile');
const {
  ensureGhAvailable,
  prExists,
  getPrUrl,
  createPr,
  isPrMerged,
  getRepoRemoteUrl,
  prUrlFromRemote,
} = require('./lib/gh');

const BRANCH_REGEX = /^MER-\d+-[A-Za-z0-9][A-Za-z0-9-]*$/;
const EVENTS_CLONE_URL = 'git@github.com:Study-Compass/Events-Backend.git';

function usage() {
  console.log(`
meridian <command> [options]

Commands:
  status              Show repo state and lockfile pin
  start <branch>      Create fresh feature branch in both repos
  switch <branch>     Switch both repos to existing branch
  pin                 Pin events to current origin/main (requires clean state)
  ship                Ship full-stack feature (Events PR → merge → pin → Meridian PR)

Examples:
  meridian start MER-123-Org-Forms
  meridian switch MER-123-Org-Forms
  meridian ship

Branch names must match: MER-<number>-<slug> (e.g. MER-123-Org-Forms)
`);
}

function validateBranchName(branch) {
  if (!branch || !BRANCH_REGEX.test(branch)) {
    console.error('Invalid branch name. Must match: MER-<number>-<slug>');
    console.error('Examples: MER-123-Org-Forms, MER-456-Fix-Login');
    process.exit(1);
  }
}

function ensureClean(meridianPath, eventsPath) {
  if (!isClean(meridianPath)) {
    console.error('Meridian has uncommitted changes. Commit, stash, or discard before continuing.');
    process.exit(1);
  }
  if (!isClean(eventsPath)) {
    console.error('Events-Backend has uncommitted changes. Commit, stash, or discard before continuing.');
    process.exit(1);
  }
}

function resolveWorkspace() {
  const root = findWorkspaceRoot();
  if (!root) {
    console.error('Could not find Meridian workspace. Run from Meridian/ or set MERIDIAN_WORKSPACE.');
    process.exit(1);
  }
  const { meridianPath, eventsPath } = getRepoPaths(root);
  const merCheck = assertRepoExists(meridianPath, 'Meridian');
  if (!merCheck.ok) {
    console.error(merCheck.message);
    process.exit(1);
  }
  const evCheck = assertRepoExists(eventsPath, 'Events-Backend');
  if (!evCheck.ok) {
    console.error(evCheck.message);
    console.error('');
    console.error('Clone Events-Backend:');
    console.error(`  git clone ${EVENTS_CLONE_URL} ${eventsPath}`);
    console.error('Or set MERIDIAN_WORKSPACE to the parent of Meridian and Events-Backend.');
    process.exit(1);
  }
  return { meridianPath, eventsPath };
}

async function handleBranchCollision(meridianPath, eventsPath, branch) {
  const merRemote = branchExistsRemote(meridianPath, branch);
  const evRemote = branchExistsRemote(eventsPath, branch);
  if (!merRemote && !evRemote) return null;

  const repos = [];
  if (merRemote) {
    const sha = getHeadSha(meridianPath, `origin/${branch}`);
    repos.push({ name: 'Meridian', path: meridianPath, sha });
  }
  if (evRemote) {
    const sha = getHeadSha(eventsPath, `origin/${branch}`);
    repos.push({ name: 'Events-Backend', path: eventsPath, sha });
  }

  console.error(`Branch ${branch} already exists on remote in: ${repos.map((r) => r.name).join(', ')}`);
  for (const r of repos) {
    console.error(`  ${r.name}: ${r.sha ? r.sha.slice(0, 7) : '?'}`);
  }

  const choice = await promptChoice('How to proceed?', [
    { label: 'Resume (checkout existing branch tracking remote)', value: 'resume' },
    { label: 'Abort (recommended)', value: 'abort' },
    { label: 'Force create new (requires different branch name)', value: 'force' },
  ]);

  if (choice === 'abort' || choice === null) {
    console.error('Aborted.');
    process.exit(1);
  }
  if (choice === 'force') {
    console.error('Use a different branch name and run meridian start again.');
    process.exit(1);
  }
  return choice; // resume
}

// --- status ---
function cmdStatus() {
  const { meridianPath, eventsPath } = resolveWorkspace();

  const merBranch = currentBranch(meridianPath);
  const merClean = isClean(meridianPath);
  const merSha = getShortSha(meridianPath);

  const evBranch = currentBranch(eventsPath);
  const evClean = isClean(eventsPath);
  const evSha = getShortSha(eventsPath);

  console.log(`Meridian:     branch=${merBranch} ${merClean ? 'clean' : 'dirty'} sha=${merSha || '?'}`);
  console.log(`Events:       branch=${evBranch} ${evClean ? 'clean' : 'dirty'} sha=${evSha || '?'}`);

  const lockRef = getEventsRef(meridianPath);
  const lockShort = lockRef ? lockRef.slice(0, 7) : '?';
  console.log(`Lockfile:     events.ref=${lockShort}`);

  if (lockRef) {
    fetchAll(eventsPath);
    const eventsMainSha = getHeadSha(eventsPath, 'origin/main');
    const matches = eventsMainSha && lockRef === eventsMainSha;
    console.log(`             matches events/main? ${matches ? 'yes' : 'no'}`);
  }
}

// --- start ---
async function cmdStart(branch) {
  validateBranchName(branch);
  const { meridianPath, eventsPath } = resolveWorkspace();
  ensureClean(meridianPath, eventsPath);

  fetchAll(meridianPath);
  fetchAll(eventsPath);

  const collision = await handleBranchCollision(meridianPath, eventsPath, branch);
  if (collision === 'resume') {
    // Checkout existing branches
    if (branchExistsLocal(meridianPath, branch)) {
      checkoutBranch(meridianPath, branch);
    } else {
      const r = require('./lib/git').git(`checkout -b ${branch} origin/${branch}`, meridianPath);
      if (!r.ok) {
        console.error('Failed to checkout Meridian:', r.stderr);
        process.exit(1);
      }
    }
    if (branchExistsLocal(eventsPath, branch)) {
      checkoutBranch(eventsPath, branch);
    } else {
      const r = require('./lib/git').git(`checkout -b ${branch} origin/${branch}`, eventsPath);
      if (!r.ok) {
        console.error('Failed to checkout Events:', r.stderr);
        process.exit(1);
      }
    }
    console.log(`Switched to existing branch ${branch} in both repos.`);
    console.log('Work normally; when ready run `meridian ship`');
    return;
  }

  // Create new branch from origin/main
  const merR = require('./lib/git').git('checkout main', meridianPath);
  if (!merR.ok) {
    console.error('Failed to checkout Meridian main:', merR.stderr);
    process.exit(1);
  }
  pull(meridianPath, 'main');
  const merCreate = checkoutBranch(meridianPath, branch, 'origin/main');
  if (!merCreate.ok) {
    console.error('Failed to create Meridian branch:', merCreate.stderr);
    process.exit(1);
  }

  const evR = require('./lib/git').git('checkout main', eventsPath);
  if (!evR.ok) {
    console.error('Failed to checkout Events main:', evR.stderr);
    process.exit(1);
  }
  pull(eventsPath, 'main');
  const evCreate = checkoutBranch(eventsPath, branch, 'origin/main');
  if (!evCreate.ok) {
    console.error('Failed to create Events branch:', evCreate.stderr);
    process.exit(1);
  }

  console.log(`Created branch ${branch} in both repos.`);
  console.log('Work normally; when ready run `meridian ship`');
}

// --- switch ---
async function cmdSwitch(branch) {
  validateBranchName(branch);
  const { meridianPath, eventsPath } = resolveWorkspace();
  ensureClean(meridianPath, eventsPath);

  fetchAll(meridianPath);
  fetchAll(eventsPath);

  function doSwitch(repoPath, name) {
    if (branchExistsLocal(repoPath, branch)) {
      const r = checkoutBranch(repoPath, branch);
      if (!r.ok) {
        console.error(`Failed to checkout ${name}:`, r.stderr);
        process.exit(1);
      }
      return;
    }
    if (branchExistsRemote(repoPath, branch)) {
      const r = require('./lib/git').git(`checkout -b ${branch} origin/${branch}`, repoPath);
      if (!r.ok) {
        console.error(`Failed to checkout ${name}:`, r.stderr);
        process.exit(1);
      }
      return;
    }
    const create = branchExistsLocal(repoPath, 'main')
      ? checkoutBranch(repoPath, branch, 'origin/main')
      : require('./lib/git').git(`checkout -b ${branch} origin/main`, repoPath);
    if (!create.ok) {
      console.error(`Failed to create ${name} branch:`, create.stderr);
      process.exit(1);
    }
  }

  doSwitch(meridianPath, 'Meridian');
  doSwitch(eventsPath, 'Events-Backend');

  console.log(`Switched both repos to ${branch}.`);
}

// --- pin ---
function cmdPin(allowMain = false) {
  const { meridianPath, eventsPath } = resolveWorkspace();
  ensureClean(meridianPath, eventsPath);

  const merBranch = currentBranch(meridianPath);
  if (merBranch === 'main' && !allowMain) {
    console.error('Pin is for feature branches. Use --allow-main to override.');
    process.exit(1);
  }

  fetchAll(eventsPath);
  const eventsMainSha = getHeadSha(eventsPath, 'origin/main');
  if (!eventsMainSha) {
    console.error('Could not resolve origin/main in Events-Backend.');
    process.exit(1);
  }

  setEventsRef(meridianPath, eventsMainSha);
  const shortSha = eventsMainSha.slice(0, 7);

  const msg = `chore(${merBranch}): pin events @ ${shortSha}`;
  const addR = require('./lib/git').git('add private-deps.lock', meridianPath);
  if (!addR.ok) {
    console.error('Add failed:', addR.stderr);
    process.exit(1);
  }
  const commitR = require('./lib/git').git(`commit -m "${msg.replace(/"/g, '\\"')}"`, meridianPath);
  if (!commitR.ok) {
    console.error('Commit failed:', commitR.stderr);
    process.exit(1);
  }

  console.log(`Pinned events to ${shortSha} in lockfile.`);
}

// --- ship ---
async function cmdShip() {
  const { meridianPath, eventsPath } = resolveWorkspace();
  ensureClean(meridianPath, eventsPath);

  const branch = currentBranch(meridianPath);
  if (branch === 'main') {
    console.error('Ship is for feature branches, not main.');
    process.exit(1);
  }

  // Ensure Meridian and Events on same branch
  const evBranch = currentBranch(eventsPath);
  if (evBranch !== branch) {
    console.error(`Events-Backend is on ${evBranch}, Meridian on ${branch}. Switch both to the same branch first.`);
    process.exit(1);
  }

  // Push Events if not pushed
  if (!isPushed(eventsPath, branch)) {
    const ok = await promptYesNo('Push Events branch now?');
    if (!ok) {
      console.error('Aborted. Push Events branch first, then re-run meridian ship.');
      process.exit(1);
    }
    const pr = push(eventsPath, branch, true);
    if (!pr.ok) {
      console.error('Push failed:', pr.stderr);
      process.exit(1);
    }
  }

  const hasGh = ensureGhAvailable();

  // Events PR
  if (hasGh) {
    if (!prExists(eventsPath, branch)) {
      const ok = await promptYesNo('Create Events PR for Events branch?');
      if (ok) {
        const title = branch.replace(/-/g, ' ');
        const create = createPr(eventsPath, branch, title, 'main');
        if (!create) {
          console.error('Failed to create Events PR.');
          process.exit(1);
        }
        console.log('Events PR created.');
      }
    }

    // Poll until merged
    let merged = isPrMerged(eventsPath, branch);
    while (!merged) {
      console.log('Waiting for Events PR to be merged to main...');
      await new Promise((r) => setTimeout(r, 5000));
      fetchAll(eventsPath);
      merged = isPrMerged(eventsPath, branch);
    }
  } else {
    const url = getPrUrl(eventsPath, branch) || prUrlFromRemote(getRepoRemoteUrl(eventsPath), branch, 'main');
    console.log('Merge Events PR to main first, then re-run `meridian ship`.');
    if (url) console.log('Events PR:', url);
    process.exit(0);
  }

  // After merge: pin
  fetchAll(eventsPath);
  const eventsMainSha = getHeadSha(eventsPath, 'origin/main');
  if (!eventsMainSha) {
    console.error('Could not resolve origin/main in Events-Backend.');
    process.exit(1);
  }

  setEventsRef(meridianPath, eventsMainSha);
  const shortSha = eventsMainSha.slice(0, 7);
  const msg = `chore(${branch}): pin events @ ${shortSha}`;
  const addR = require('./lib/git').git('add private-deps.lock', meridianPath);
  if (!addR.ok) {
    console.error('Add failed:', addR.stderr);
    process.exit(1);
  }
  const commitR = require('./lib/git').git(`commit -m "${msg.replace(/"/g, '\\"')}"`, meridianPath);
  if (!commitR.ok) {
    console.error('Commit failed:', commitR.stderr);
    process.exit(1);
  }

  // Push Meridian
  if (!isPushed(meridianPath, branch)) {
    const ok = await promptYesNo('Push Meridian branch now?');
    if (!ok) {
      console.error('Push Meridian branch manually, then create PR.');
      process.exit(1);
    }
    const pr = push(meridianPath, branch, true);
    if (!pr.ok) {
      console.error('Push failed:', pr.stderr);
      process.exit(1);
    }
  }

  // Meridian PR
  if (hasGh) {
    if (!prExists(meridianPath, branch)) {
      const ok = await promptYesNo('Create Meridian PR?');
      if (ok) {
        const title = branch.replace(/-/g, ' ');
        createPr(meridianPath, branch, title, 'main');
      }
    }
  } else {
    const url = getPrUrl(meridianPath, branch) || prUrlFromRemote(getRepoRemoteUrl(meridianPath), branch, 'main');
    if (url) console.log('Meridian PR:', url);
  }

  console.log('Review App will build deterministically; merge Meridian PR to deploy to staging.');
}

// --- main ---
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const allowMain = args.includes('--allow-main');

  switch (cmd) {
    case 'status':
      cmdStatus();
      break;
    case 'start':
      if (!args[1]) {
        console.error('Usage: meridian start <branch>');
        process.exit(1);
      }
      await cmdStart(args[1]);
      break;
    case 'switch':
      if (!args[1]) {
        console.error('Usage: meridian switch <branch>');
        process.exit(1);
      }
      await cmdSwitch(args[1]);
      break;
    case 'pin':
      cmdPin(allowMain);
      break;
    case 'ship':
      await cmdShip();
      break;
    case '--help':
    case '-h':
    case undefined:
      usage();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
