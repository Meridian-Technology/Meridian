/**
 * Lockfile helpers for Meridian CLI.
 * private-deps.lock pins private modules by SHA to ensure deterministic builds.
 * Refs must be 40-char hex SHAs; no branch names or tags.
 */

const fs = require('fs');
const path = require('path');

const LOCKFILE_NAME = 'private-deps.lock';

function getLockfilePath(meridianPath) {
  return path.join(meridianPath, LOCKFILE_NAME);
}

function readLockfile(meridianPath) {
  const p = getLockfilePath(meridianPath);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function writeLockfile(meridianPath, data) {
  const p = getLockfilePath(meridianPath);
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(p, content, 'utf8');
}

function setEventsRef(meridianPath, sha) {
  const data = readLockfile(meridianPath);
  if (!data) throw new Error('Lockfile not found');
  if (!data.events) data.events = { repo: 'git@github.com:Study-Compass/Events-Backend.git', dest: 'backend/events' };
  data.events.ref = sha;
  writeLockfile(meridianPath, data);
}

function getEventsRef(meridianPath) {
  const data = readLockfile(meridianPath);
  return data?.events?.ref || null;
}

function isValidSha(ref) {
  return typeof ref === 'string' && /^[a-f0-9]{40}$/i.test(ref);
}

module.exports = {
  readLockfile,
  writeLockfile,
  setEventsRef,
  getEventsRef,
  getLockfilePath,
  isValidSha,
};
