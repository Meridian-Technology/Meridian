/**
 * Git helpers for Meridian CLI.
 */

const { execSync, spawnSync } = require('child_process');

function git(cmd, cwd, options = {}) {
  const fullCmd = typeof cmd === 'string' ? `git ${cmd}` : ['git', ...cmd].join(' ');
  try {
    const result = execSync(fullCmd, {
      cwd,
      encoding: 'utf8',
      ...options,
    });
    return { ok: true, stdout: (result || '').trim() };
  } catch (err) {
    return { ok: false, stderr: (err.stderr || err.message || '').toString().trim(), code: err.status };
  }
}

function isClean(cwd) {
  const r = git('status --porcelain', cwd);
  if (!r.ok) return false;
  return r.stdout === '';
}

function currentBranch(cwd) {
  const r = git('rev-parse --abbrev-ref HEAD', cwd);
  return r.ok ? r.stdout : null;
}

function branchExistsLocal(cwd, branch) {
  const r = git(`branch --list ${branch}`, cwd);
  return r.ok && r.stdout.length > 0;
}

function branchExistsRemote(cwd, branch, remote = 'origin') {
  const r = git(`ls-remote --heads ${remote} ${branch}`, cwd);
  return r.ok && r.stdout.length > 0;
}

function fetchAll(cwd) {
  return git('fetch --all', cwd);
}

function getHeadSha(cwd, ref = 'HEAD') {
  const r = git(`rev-parse ${ref}`, cwd);
  return r.ok ? r.stdout : null;
}

function getShortSha(cwd, ref = 'HEAD') {
  const r = git(`rev-parse --short ${ref}`, cwd);
  return r.ok ? r.stdout : null;
}

function checkoutBranch(cwd, branch, createFrom = null) {
  if (createFrom) {
    return git(`checkout -b ${branch} ${createFrom}`, cwd);
  }
  return git(`checkout ${branch}`, cwd);
}

function pull(cwd, branch = 'main') {
  return git(`pull origin ${branch}`, cwd);
}

function push(cwd, branch, setUpstream = false) {
  const cmd = setUpstream ? `push -u origin ${branch}` : `push origin ${branch}`;
  return git(cmd, cwd);
}

function isPushed(cwd, branch) {
  const r = git(`rev-parse ${branch}`, cwd);
  if (!r.ok) return false;
  const localSha = r.stdout;
  const r2 = git(`rev-parse origin/${branch}`, cwd);
  if (!r2.ok) return false;
  return localSha === r2.stdout;
}

module.exports = {
  git,
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
};
