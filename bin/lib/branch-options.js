const TICKET_BRANCH_REGEX = /^MER-\d+-[A-Za-z0-9][A-Za-z0-9-]*$/;
const GIT_SAFE_BRANCH_REGEX = /^[A-Za-z0-9._/-]+$/;

function isGitSafeBranchName(branch) {
  return Boolean(
    branch &&
      GIT_SAFE_BRANCH_REGEX.test(branch) &&
      !branch.includes('..') &&
      !branch.startsWith('/') &&
      !branch.startsWith('-')
  );
}

function isValidBranchName(branch, anyBranch = false) {
  return anyBranch ? isGitSafeBranchName(branch) : TICKET_BRANCH_REGEX.test(branch || '');
}

function collisionAction({ yes = false, resume = false } = {}) {
  if (resume) return 'resume';
  if (yes) return 'abort';
  return 'prompt';
}

module.exports = {
  collisionAction,
  isGitSafeBranchName,
  isValidBranchName,
};
