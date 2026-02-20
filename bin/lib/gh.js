/**
 * Optional GitHub CLI (gh) integration for Meridian CLI.
 * Returns null/false if gh not installed or not authenticated.
 */

const { execSync } = require('child_process');

function ensureGhAvailable() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function gh(cmd, cwd) {
  try {
    const result = execSync(`gh ${cmd}`, { cwd, encoding: 'utf8' });
    return { ok: true, stdout: (result || '').trim() };
  } catch (err) {
    return { ok: false, stderr: (err.stderr || err.message || '').toString().trim() };
  }
}

function prExists(repoPath, branch, base = 'main') {
  const r = gh(`pr list --head ${branch} --base ${base} --json number`, repoPath);
  if (!r.ok) return false;
  try {
    const data = JSON.parse(r.stdout || '[]');
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

function getPrUrl(repoPath, branch, base = 'main') {
  const r = gh(`pr list --head ${branch} --base ${base} --json url`, repoPath);
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.stdout || '[]');
    return data[0]?.url || null;
  } catch {
    return null;
  }
}

function createPr(repoPath, branch, title, base = 'main') {
  const r = gh(`pr create --head ${branch} --base ${base} --title "${title.replace(/"/g, '\\"')}" --body ""`, repoPath);
  return r.ok ? r.stdout : null;
}

function isPrMerged(repoPath, branch, base = 'main') {
  const r = gh(`pr list --head ${branch} --base ${base} --state merged --json number`, repoPath);
  if (!r.ok) return false;
  try {
    const data = JSON.parse(r.stdout || '[]');
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

function getRepoRemoteUrl(repoPath) {
  const { execSync } = require('child_process');
  try {
    const out = execSync('git config --get remote.origin.url', { cwd: repoPath, encoding: 'utf8' });
    return (out || '').trim();
  } catch {
    return null;
  }
}

function prUrlFromRemote(remoteUrl, branch, base = 'main') {
  if (!remoteUrl) return null;
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!m) return null;
  const [, owner, repo] = m;
  const repoName = repo.replace(/\.git$/, '');
  return `https://github.com/${owner}/${repoName}/compare/${base}...${branch}?expand=1`;
}

module.exports = {
  ensureGhAvailable,
  gh,
  prExists,
  getPrUrl,
  createPr,
  isPrMerged,
  getRepoRemoteUrl,
  prUrlFromRemote,
};
