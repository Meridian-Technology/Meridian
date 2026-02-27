/**
 * Workspace detection and repo paths for Meridian CLI.
 * Expects layout: <WORKSPACE>/Meridian/ and <WORKSPACE>/Events-Backend/
 * When invoked from Meridian/, workspace root = parent dir.
 */

const path = require('path');
const fs = require('fs');

function findWorkspaceRoot() {
  const envWorkspace = process.env.MERIDIAN_WORKSPACE;
  if (envWorkspace) {
    const resolved = path.resolve(envWorkspace);
    if (fs.existsSync(resolved)) return resolved;
  }

  // Assume we're in Meridian/bin/ or Meridian/ - workspace is parent of Meridian
  const cwd = process.cwd();
  const meridianMarker = path.join(cwd, 'private-deps.lock');
  if (fs.existsSync(meridianMarker)) {
    return path.dirname(cwd); // cwd is Meridian, parent is workspace
  }
  const fromBin = path.join(cwd, '..', 'private-deps.lock');
  if (fs.existsSync(fromBin)) {
    return path.dirname(path.resolve(cwd, '..')); // cwd is Meridian/bin, workspace is parent of Meridian
  }
  return null;
}

function getRepoPaths(workspaceRoot) {
  if (!workspaceRoot) return null;
  const meridianPath = path.join(workspaceRoot, 'Meridian');
  const eventsPath = path.join(workspaceRoot, 'Events-Backend');
  return { meridianPath, eventsPath };
}

function assertRepoExists(repoPath, name) {
  if (!fs.existsSync(repoPath)) {
    return { ok: false, message: `${name} not found at ${repoPath}` };
  }
  const gitDir = path.join(repoPath, '.git');
  if (!fs.existsSync(gitDir)) {
    return { ok: false, message: `${name} at ${repoPath} is not a git repo` };
  }
  return { ok: true };
}

module.exports = {
  findWorkspaceRoot,
  getRepoPaths,
  assertRepoExists,
};
