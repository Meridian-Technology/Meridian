const getModels = require('./getModelService');
const { validatePivotInterestTags } = require('./pivotTagCatalogService');

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

function normalizeStoredInterestTags(raw) {
  return Array.isArray(raw) ? raw : [];
}

async function getPivotProfileInterests(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId).select('pivotInterestTags').lean();
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  return {
    data: {
      interestTags: normalizeStoredInterestTags(user.pivotInterestTags),
    },
  };
}

async function updatePivotProfileInterests(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'interestTags')) {
    return {
      error: 'interestTags is required.',
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }

  const validation = await validatePivotInterestTags(req, body.interestTags);
  if (validation.error) {
    return validation;
  }

  const { User } = getModels(req, 'User');
  const user = await User.findById(userId);
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }

  user.pivotInterestTags = validation.tags;
  await user.save();

  return {
    data: {
      interestTags: validation.tags,
    },
  };
}

module.exports = {
  getPivotProfileInterests,
  updatePivotProfileInterests,
};
