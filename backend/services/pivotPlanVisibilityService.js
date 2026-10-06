const mongoose = require('mongoose');
const getModels = require('./getModelService');

/**
 * Who can see the events a user marks interested or going.
 *
 * - friends (default): every accepted friend, on cards, sheets, and the Friends tab
 * - circles: only friends who share an active circle with them
 * - nobody: no friend-facing surface. Circle decide rooms still show picks,
 *   because joining a circle is an explicit choice to plan together.
 */
const PIVOT_PLAN_VISIBILITY = Object.freeze(['friends', 'circles', 'nobody']);
const DEFAULT_PIVOT_PLAN_VISIBILITY = 'friends';

function normalizePlanVisibility(value) {
  return PIVOT_PLAN_VISIBILITY.includes(value) ? value : DEFAULT_PIVOT_PLAN_VISIBILITY;
}

function toObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

/**
 * Of `users` (docs selected with `pivotPlanVisibility`), the ids whose plans
 * `viewerId` may see. Only queries circles when someone chose `circles`.
 */
async function resolvePlanVisibleUserIds(req, viewerId, users = []) {
  const visible = new Set();
  const circlesOnly = [];

  for (const user of users) {
    const id = String(user._id);
    const visibility = normalizePlanVisibility(user.pivotPlanVisibility);
    if (visibility === 'friends') {
      visible.add(id);
    } else if (visibility === 'circles') {
      circlesOnly.push(id);
    }
  }

  const viewerObjectId = toObjectId(viewerId);
  if (!circlesOnly.length || !viewerObjectId) {
    return visible;
  }

  const { PivotCrewMembership } = getModels(req, 'PivotCrewMembership');
  const viewerCrewIds = await PivotCrewMembership.distinct('crewId', {
    userId: viewerObjectId,
    status: 'active',
  });
  if (!viewerCrewIds.length) {
    return visible;
  }

  const sharedIds = await PivotCrewMembership.distinct('userId', {
    crewId: { $in: viewerCrewIds },
    userId: { $in: circlesOnly.map(toObjectId).filter(Boolean) },
    status: 'active',
  });
  for (const id of sharedIds) {
    visible.add(String(id));
  }
  return visible;
}

function unauthorized() {
  return { error: 'Authentication required.', status: 401, code: 'UNAUTHORIZED' };
}

async function getPivotPlanVisibility(req) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }
  const { User } = getModels(req, 'User');
  const user = await User.findById(userId).select('pivotPlanVisibility').lean();
  if (!user) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }
  return { data: { planVisibility: normalizePlanVisibility(user.pivotPlanVisibility) } };
}

async function updatePivotPlanVisibility(req, body = {}) {
  const userId = req.user?.userId;
  if (!userId) {
    return unauthorized();
  }
  const planVisibility = body.planVisibility;
  if (!PIVOT_PLAN_VISIBILITY.includes(planVisibility)) {
    return {
      error: `planVisibility must be one of: ${PIVOT_PLAN_VISIBILITY.join(', ')}.`,
      status: 400,
      code: 'VALIDATION_ERROR',
    };
  }
  const { User } = getModels(req, 'User');
  const result = await User.updateOne({ _id: userId }, { $set: { pivotPlanVisibility: planVisibility } });
  if (!result?.matchedCount && !result?.n) {
    return { error: 'User not found.', status: 404, code: 'USER_NOT_FOUND' };
  }
  return { data: { planVisibility } };
}

module.exports = {
  PIVOT_PLAN_VISIBILITY,
  DEFAULT_PIVOT_PLAN_VISIBILITY,
  normalizePlanVisibility,
  resolvePlanVisibleUserIds,
  getPivotPlanVisibility,
  updatePivotPlanVisibility,
};
