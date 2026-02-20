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

const dim = (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[2m${s}\x1b[0m` : s);
const green = (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[33m${s}\x1b[0m` : s);
const cyan = (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[36m${s}\x1b[0m` : s);
const bold = (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[31m${s}\x1b[0m` : s);

function usage() {
  const sep = '─'.repeat(50);
  console.log('');
  console.log(bold('  meridian') + dim(' <command> [options]'));
  console.log(dim(`  ${sep}`));
  console.log('');
  console.log(cyan('  Commands'));
  console.log(dim('  ├─ status       ') + 'Show repo state and lockfile pin');
  console.log(dim('  ├─ start        ') + 'Create fresh feature branch in both repos');
  console.log(dim('  ├─ switch       ') + 'Switch both repos to existing branch');
  console.log(dim('  ├─ pin          ') + 'Pin events to current origin/main');
  console.log(dim('  └─ ship         ') + 'Ship full-stack feature (Events PR → merge → pin → Meridian PR)');
  console.log('');
  console.log(cyan('  Examples'));
  console.log(dim('  meridian start MER-123-Org-Forms'));
  console.log(dim('  meridian switch MER-123-Org-Forms'));
  console.log(dim('  meridian ship'));
  console.log('');
  console.log(dim('  Branch names: MER-<number>-<slug> (e.g. MER-123-Org-Forms)'));
  console.log('');
}

function validateBranchName(branch) {
  if (!branch || !BRANCH_REGEX.test(branch)) {
    console.error('');
    console.error(red('  Invalid branch name'));
    console.error(dim('  Must match: MER-<number>-<slug>'));
    console.error(dim('  Examples:  MER-123-Org-Forms, MER-456-Fix-Login'));
    console.error('');
    process.exit(1);
  }
}

function ensureClean(meridianPath, eventsPath) {
  if (!isClean(meridianPath)) {
    console.error('');
    console.error(red('  Meridian has uncommitted changes'));
    console.error(dim('  Commit, stash, or discard before continuing.'));
    console.error('');
    process.exit(1);
  }
  if (!isClean(eventsPath)) {
    console.error('');
    console.error(red('  Events-Backend has uncommitted changes'));
    console.error(dim('  Commit, stash, or discard before continuing.'));
    console.error('');
    process.exit(1);
  }
}

function resolveWorkspace() {
  const root = findWorkspaceRoot();
  if (!root) {
    console.error('');
    console.error(red('  Could not find Meridian workspace'));
    console.error(dim('  Run from Meridian/ or set MERIDIAN_WORKSPACE.'));
    console.error('');
    process.exit(1);
  }
  const { meridianPath, eventsPath } = getRepoPaths(root);
  const merCheck = assertRepoExists(meridianPath, 'Meridian');
  if (!merCheck.ok) {
    console.error('');
    console.error(red('  Meridian not found'));
    console.error(dim(`  ${merCheck.message}`));
    console.error('');
    process.exit(1);
  }
  const evCheck = assertRepoExists(eventsPath, 'Events-Backend');
  if (!evCheck.ok) {
    console.error('');
    console.error(red('  Events-Backend not found'));
    console.error(dim(`  ${evCheck.message}`));
    console.error('');
    console.error(cyan('  Clone Events-Backend:'));
    console.error(dim(`  git clone ${EVENTS_CLONE_URL} ${eventsPath}`));
    console.error(dim('  Or set MERIDIAN_WORKSPACE to the parent of Meridian and Events-Backend.'));
    console.error('');
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

  console.error('');
  console.error(yellow(`  Branch ${branch} already exists on remote`));
  console.error(dim(`  In: ${repos.map((r) => r.name).join(', ')}`));
  for (const r of repos) {
    console.error(dim(`  ├─ ${r.name}: ${r.sha ? r.sha.slice(0, 7) : '?'}`));
  }
  console.error('');

  const choice = await promptChoice('How to proceed?', [
    { label: 'Resume (checkout existing branch tracking remote)', value: 'resume' },
    { label: 'Abort (recommended)', value: 'abort' },
    { label: 'Force create new (requires different branch name)', value: 'force' },
  ]);

  if (choice === 'abort' || choice === null) {
    console.error(dim('  Aborted.'));
    process.exit(1);
  }
  if (choice === 'force') {
    console.error(dim('  Use a different branch name and run meridian start again.'));
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

  const lockRef = getEventsRef(meridianPath);
  const lockShort = lockRef ? lockRef.slice(0, 7) : '?';
  let eventsMainSha = null;
  let matches = false;
  if (lockRef) {
    fetchAll(eventsPath);
    eventsMainSha = getHeadSha(eventsPath, 'origin/main');
    matches = eventsMainSha && lockRef === eventsMainSha;
  }

  const sep = '─'.repeat(50);
  const status = (clean) => (clean ? green('clean') : yellow('dirty'));
  const syncStatus = (ok) => (ok ? green('in sync') : yellow('out of sync'));

  console.log('');
  console.log(bold('  meridian status'));
  console.log(dim(`  ${sep}`));
  console.log('');
  console.log(cyan('  Meridian'));
  console.log(dim('  ├─ Branch:    '), merBranch);
  console.log(dim('  ├─ Status:    '), status(merClean), dim(merClean ? '(no uncommitted changes)' : '(uncommitted changes)'));
  console.log(dim('  └─ HEAD:     '), merSha || '?');
  console.log('');
  console.log(cyan('  Events-Backend'));
  console.log(dim('  ├─ Branch:    '), evBranch);
  console.log(dim('  ├─ Status:    '), status(evClean), dim(evClean ? '(no uncommitted changes)' : '(uncommitted changes)'));
  console.log(dim('  └─ HEAD:     '), evSha || '?');
  console.log('');
  console.log(cyan('  Lockfile'));
  console.log(dim('  ├─ Pinned:    '), lockShort, lockRef ? dim(`(${lockRef})`) : '');
  console.log(dim('  └─ With main: '), syncStatus(matches), matches ? dim('— pin matches origin/main') : dim(`— Events main is ${eventsMainSha ? eventsMainSha.slice(0, 7) : '?'}`));
  console.log('');
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
        console.error(red('  Failed to checkout Meridian:'), r.stderr);
        process.exit(1);
      }
    }
    if (branchExistsLocal(eventsPath, branch)) {
      checkoutBranch(eventsPath, branch);
    } else {
      const r = require('./lib/git').git(`checkout -b ${branch} origin/${branch}`, eventsPath);
      if (!r.ok) {
        console.error(red('  Failed to checkout Events:'), r.stderr);
        process.exit(1);
      }
    }
    console.log('');
    console.log(green('  Switched to existing branch ') + bold(branch) + green(' in both repos'));
    console.log(dim('  Work normally; when ready run ') + cyan('meridian ship'));
    console.log('');
    return;
  }

  // Create new branch from origin/main
  const merR = require('./lib/git').git('checkout main', meridianPath);
  if (!merR.ok) {
    console.error(red('  Failed to checkout Meridian main:'), merR.stderr);
    process.exit(1);
  }
  pull(meridianPath, 'main');
  const merCreate = checkoutBranch(meridianPath, branch, 'origin/main');
  if (!merCreate.ok) {
    console.error(red('  Failed to create Meridian branch:'), merCreate.stderr);
    process.exit(1);
  }

  const evR = require('./lib/git').git('checkout main', eventsPath);
  if (!evR.ok) {
    console.error(red('  Failed to checkout Events main:'), evR.stderr);
    process.exit(1);
  }
  pull(eventsPath, 'main');
  const evCreate = checkoutBranch(eventsPath, branch, 'origin/main');
  if (!evCreate.ok) {
    console.error(red('  Failed to create Events branch:'), evCreate.stderr);
    process.exit(1);
  }

  console.log('');
  console.log(green('  Created branch ') + bold(branch) + green(' in both repos'));
  console.log(dim('  Work normally; when ready run ') + cyan('meridian ship'));
  console.log('');
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
        console.error(red(`  Failed to checkout ${name}:`), r.stderr);
        process.exit(1);
      }
      return;
    }
    if (branchExistsRemote(repoPath, branch)) {
      const r = require('./lib/git').git(`checkout -b ${branch} origin/${branch}`, repoPath);
      if (!r.ok) {
        console.error(red(`  Failed to checkout ${name}:`), r.stderr);
        process.exit(1);
      }
      return;
    }
    const create = branchExistsLocal(repoPath, 'main')
      ? checkoutBranch(repoPath, branch, 'origin/main')
      : require('./lib/git').git(`checkout -b ${branch} origin/main`, repoPath);
    if (!create.ok) {
      console.error(red(`  Failed to create ${name} branch:`), create.stderr);
      process.exit(1);
    }
  }

  doSwitch(meridianPath, 'Meridian');
  doSwitch(eventsPath, 'Events-Backend');

  console.log('');
  console.log(green('  Switched both repos to ') + bold(branch));
  console.log('');
}

// --- pin ---
function cmdPin(allowMain = false) {
  const { meridianPath, eventsPath } = resolveWorkspace();
  ensureClean(meridianPath, eventsPath);

  const merBranch = currentBranch(meridianPath);
  if (merBranch === 'main' && !allowMain) {
    console.error('');
    console.error(red('  Pin is for feature branches'));
    console.error(dim('  Use --allow-main to override.'));
    console.error('');
    process.exit(1);
  }

  fetchAll(eventsPath);
  const eventsMainSha = getHeadSha(eventsPath, 'origin/main');
  if (!eventsMainSha) {
    console.error('');
    console.error(red('  Could not resolve origin/main in Events-Backend'));
    console.error('');
    process.exit(1);
  }

  setEventsRef(meridianPath, eventsMainSha);
  const shortSha = eventsMainSha.slice(0, 7);

  const msg = `chore(${merBranch}): pin events @ ${shortSha}`;
  const addR = require('./lib/git').git('add private-deps.lock', meridianPath);
  if (!addR.ok) {
    console.error(red('  Add failed:'), addR.stderr);
    process.exit(1);
  }
  const commitR = require('./lib/git').git(`commit -m "${msg.replace(/"/g, '\\"')}"`, meridianPath);
  if (!commitR.ok) {
    console.error(red('  Commit failed:'), commitR.stderr);
    process.exit(1);
  }

  console.log('');
  console.log(green('  Pinned events to ') + bold(shortSha) + green(' in lockfile'));
  console.log('');
}

// --- ship ---
async function cmdShip() {
  const { meridianPath, eventsPath } = resolveWorkspace();
  ensureClean(meridianPath, eventsPath);

  const branch = currentBranch(meridianPath);
  if (branch === 'main') {
    console.error('');
    console.error(red('  Ship is for feature branches, not main'));
    console.error('');
    process.exit(1);
  }

  // Ensure Meridian and Events on same branch
  const evBranch = currentBranch(eventsPath);
  if (evBranch !== branch) {
    console.error('');
    console.error(red('  Branches out of sync'));
    console.error(dim(`  Events-Backend: ${evBranch}, Meridian: ${branch}`));
    console.error(dim('  Switch both to the same branch first.'));
    console.error('');
    process.exit(1);
  }

  // Push Events if not pushed
  if (!isPushed(eventsPath, branch)) {
    const ok = await promptYesNo('Push Events branch now?');
    if (!ok) {
      console.error('');
      console.error(dim('  Aborted. Push Events branch first, then re-run ') + cyan('meridian ship'));
      console.error('');
      process.exit(1);
    }
    const pr = push(eventsPath, branch, true);
    if (!pr.ok) {
      console.error(red('  Push failed:'), pr.stderr);
      process.exit(1);
    }
  }

  const hasGh = ensureGhAvailable();

  // Events PR
  if (hasGh) {
    let merged = isPrMerged(eventsPath, branch);
    if (!merged && !prExists(eventsPath, branch)) {
      const ok = await promptYesNo('Create Events PR for Events branch?');
      if (!ok) {
        console.error('');
        console.error(dim('  Create and merge the Events PR first, then re-run ') + cyan('meridian ship'));
        console.error('');
        process.exit(0);
      }
      const title = branch.replace(/-/g, ' ');
      const create = createPr(eventsPath, branch, title, 'main');
      if (!create) {
        console.error(red('  Failed to create Events PR'));
        process.exit(1);
      }
      console.log(green('  Events PR created'));
    }

    // Poll until merged (merged may already be true if PR was merged earlier)
    const frames = ['|', '/', '-', '\\'];
    let frameIndex = 0;
    let spinner = null;
    if (!merged) {
      spinner = setInterval(() => {
        const c = frames[frameIndex % frames.length];
        process.stdout.write(`\r  ${c} Waiting for Events PR to be merged to main...   `);
        frameIndex++;
      }, 100);
    }
    while (!merged) {
      await new Promise((r) => setTimeout(r, 5000));
      fetchAll(eventsPath);
      merged = isPrMerged(eventsPath, branch);
    }
    if (spinner) {
      clearInterval(spinner);
      process.stdout.write('\r  ' + green('Merged!') + '                              \n');
    }
  } else {
    const url = getPrUrl(eventsPath, branch) || prUrlFromRemote(getRepoRemoteUrl(eventsPath), branch, 'main');
    console.log('');
    console.log(yellow('  Merge Events PR to main first, then re-run ') + cyan('meridian ship'));
    if (url) console.log(dim('  Events PR: ') + url);
    console.log('');
    process.exit(0);
  }

  // After merge: pin
  fetchAll(eventsPath);
  const eventsMainSha = getHeadSha(eventsPath, 'origin/main');
  if (!eventsMainSha) {
    console.error(red('  Could not resolve origin/main in Events-Backend'));
    process.exit(1);
  }

  const currentRef = getEventsRef(meridianPath);
  const shortSha = eventsMainSha.slice(0, 7);
  setEventsRef(meridianPath, eventsMainSha);
  if (currentRef !== eventsMainSha) {
    const msg = `chore(${branch}): pin events @ ${shortSha}`;
    const addR = require('./lib/git').git('add private-deps.lock', meridianPath);
    if (!addR.ok) {
      console.error(red('  Add failed:'), addR.stderr);
      process.exit(1);
    }
    const commitR = require('./lib/git').git(`commit -m "${msg.replace(/"/g, '\\"')}"`, meridianPath);
    if (!commitR.ok) {
      console.error(red('  Commit failed:'), commitR.stderr);
      process.exit(1);
    }
  }

  // Push Meridian
  if (!isPushed(meridianPath, branch)) {
    const ok = await promptYesNo('Push Meridian branch now?');
    if (!ok) {
      console.error('');
      console.error(dim('  Push Meridian branch manually, then create PR.'));
      process.exit(1);
    }
    const pr = push(meridianPath, branch, true);
    if (!pr.ok) {
      console.error(red('  Push failed:'), pr.stderr);
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
    if (url) console.log(dim('  Meridian PR: ') + url);
  }

  console.log('');
  console.log(green('  Review App will build deterministically'));
  console.log(dim('  Merge Meridian PR to deploy to staging.'));
  console.log('');
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
        console.error('');
        console.error(red('  Usage: ') + 'meridian start <branch>');
        console.error('');
        process.exit(1);
      }
      await cmdStart(args[1]);
      break;
    case 'switch':
      if (!args[1]) {
        console.error('');
        console.error(red('  Usage: ') + 'meridian switch <branch>');
        console.error('');
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
      console.error('');
      console.error(red(`  Unknown command: ${cmd}`));
      console.error('');
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
