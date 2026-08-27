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

function isRelayBranchName(branch) {
  return Boolean(branch && branch.startsWith('relay/') && isGitSafeBranchName(branch));
}

function isValidBranchName(branch, anyBranch = false) {
  if (anyBranch || isRelayBranchName(branch)) return isGitSafeBranchName(branch);
  return TICKET_BRANCH_REGEX.test(branch || '');
}

function collisionAction({ yes = false, resume = false } = {}) {
  if (resume) return 'resume';
  if (yes) return 'abort';
  return 'prompt';
}

module.exports = {
  collisionAction,
  isGitSafeBranchName,
  isRelayBranchName,
  isValidBranchName,
};
