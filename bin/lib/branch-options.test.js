const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collisionAction,
  isGitSafeBranchName,
  isValidBranchName,
} = require('./branch-options');

test('ticket branches remain the default', () => {
  assert.equal(isValidBranchName('MER-123-Org-Forms'), true);
  assert.equal(isValidBranchName('not-a-ticket'), false);
  assert.equal(isValidBranchName('relay/foo/bar'), false);
});

test('--any-branch accepts Relay names but still enforces git-safe syntax', () => {
  assert.equal(isValidBranchName('relay/foo/bar', true), true);
  assert.equal(isGitSafeBranchName('feature.with_dots/v2'), true);
  assert.equal(isValidBranchName('../main', true), false);
  assert.equal(isValidBranchName('/main', true), false);
  assert.equal(isValidBranchName('-main', true), false);
  assert.equal(isValidBranchName('bad branch', true), false);
});

test('--yes never selects the prompt path on a collision', () => {
  assert.equal(collisionAction({ yes: true }), 'abort');
  assert.equal(collisionAction({ yes: true, resume: true }), 'resume');
  assert.equal(collisionAction({ resume: true }), 'resume');
  assert.equal(collisionAction(), 'prompt');
});
