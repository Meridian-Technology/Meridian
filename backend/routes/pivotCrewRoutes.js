const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { verifyToken } = require('../middlewares/verifyToken');
const {
  logPivotRouteError,
} = require('../utilities/pivotLogger');
const {
  createPivotCrew,
  listPivotCrews,
  getPivotCrewDetail,
  updatePivotCrewSettings,
  deletePivotCrew,
  rotatePivotCrewInviteLink,
  joinPivotCrew,
  invitePivotCrewPlaceholders,
  addPivotCrewMember,
  listPivotCrewInvites,
  acceptPivotCrewInvite,
  declinePivotCrewInvite,
} = require('../services/pivotCrewService');
const {
  getPivotCrewWeekProgress,
  CREW_WEEK_PROGRESS_CACHE_TTL_MS,
} = require('../services/pivotCrewWeekStateService');
const {
  getPivotCrewWeekJudgement,
  getPivotCrewWeekJudgements,
  castPivotCrewWeekBallot,
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
  resetPivotCrewWeekPick,
} = require('../services/pivotCrewJudgementService');
const { requireMinAppVersion } = require('../middlewares/requireMinAppVersion');
const { RITUAL_MIN_APP_VERSION } = require('../services/pivotWeekRitualService');

const router = express.Router();

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0]?.msg || 'Invalid request.',
      code: 'VALIDATION_ERROR',
    });
  }
  return null;
}

function handleServiceResult(res, result, successStatus = 200) {
  if (result.error) {
    return res.status(result.status || 400).json({
      success: false,
      message: result.error,
      code: result.code,
    });
  }

  return res.status(successStatus).json({
    success: true,
    data: result.data,
  });
}

router.post(
  '/join',
  verifyToken,
  body('token').isString().trim().notEmpty().withMessage('Invite token is required.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await joinPivotCrew(req, { token: req.body.token });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/join', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to join crew.',
      });
    }
  },
);

router.post(
  '/',
  verifyToken,
  body('name').isString().trim().notEmpty().withMessage('Crew name is required.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await createPivotCrew(req, { name: req.body.name });
      return handleServiceResult(res, result, 201);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to create crew.',
      });
    }
  },
);

router.get(
  /** @deprecated remove after min store version — new binary uses GET /pivot/week-ritual */
  '/week',
  verifyToken,
  async (req, res) => {
    try {
      const result = await getPivotCrewWeekProgress(req, {
        batchWeek: req.query.batchWeek,
      });

      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      res.set(
        'Cache-Control',
        `private, max-age=${Math.floor(CREW_WEEK_PROGRESS_CACHE_TTL_MS / 1000)}`,
      );

      return res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('GET /pivot/crews/week', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load crew week progress.',
      });
    }
  },
);

router.get(
  '/week/judgements',
  verifyToken,
  requireMinAppVersion(RITUAL_MIN_APP_VERSION),
  async (req, res) => {
    try {
      const result = await getPivotCrewWeekJudgements(req, {
        batchWeek: req.query.batchWeek,
      });

      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      res.set('Cache-Control', 'private, max-age=15');
      return res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('GET /pivot/crews/week/judgements', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load crew judgements.',
      });
    }
  },
);

router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await listPivotCrews(req);
    return handleServiceResult(res, result);
  } catch (err) {
    logPivotRouteError('GET /pivot/crews', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load crews.',
    });
  }
});

router.get('/invites', verifyToken, async (req, res) => {
  try {
    const result = await listPivotCrewInvites(req);
    return handleServiceResult(res, result);
  } catch (err) {
    logPivotRouteError('GET /pivot/crews/invites', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load crew invites.',
    });
  }
});

router.post(
  '/invites/:membershipId/accept',
  verifyToken,
  param('membershipId').isMongoId().withMessage('Invalid membership id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await acceptPivotCrewInvite(req, req.params.membershipId);
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/invites/:membershipId/accept', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to accept crew invite.',
      });
    }
  },
);

router.post(
  '/invites/:membershipId/decline',
  verifyToken,
  param('membershipId').isMongoId().withMessage('Invalid membership id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await declinePivotCrewInvite(req, req.params.membershipId);
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/invites/:membershipId/decline', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to decline crew invite.',
      });
    }
  },
);

/** @deprecated remove after min store version — new binary uses GET /pivot/crews/week/judgements */
router.get(
  '/:crewId/week/judgement',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await getPivotCrewWeekJudgement(req, {
        crewId: req.params.crewId,
        batchWeek: req.query.batchWeek,
      });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('GET /pivot/crews/:crewId/week/judgement', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load crew judgement.',
      });
    }
  },
);

router.patch(
  '/:crewId/settings',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  body('maxPickSlots')
    .optional({ nullable: true })
    .custom((value) => value === null || value === 1 || value === 2)
    .withMessage('maxPickSlots must be 1, 2, or null.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await updatePivotCrewSettings(req, {
        crewId: req.params.crewId,
        maxPickSlots: req.body.maxPickSlots,
      });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('PATCH /pivot/crews/:crewId/settings', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to update crew settings.',
      });
    }
  },
);

router.delete(
  '/:crewId',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await deletePivotCrew(req, req.params.crewId);
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('DELETE /pivot/crews/:crewId', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to delete crew.',
      });
    }
  },
);

router.post(
  '/:crewId/week/ballot',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  body('ranking')
    .isArray({ min: 1, max: 3 })
    .withMessage('ranking must be an array of 1–3 event ids.'),
  body('ranking.*').isMongoId().withMessage('Each ranking entry must be a valid event id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await castPivotCrewWeekBallot(req, {
        crewId: req.params.crewId,
        ranking: req.body.ranking,
        batchWeek: req.body.batchWeek || req.query.batchWeek,
      });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/week/ballot', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to cast crew ballot.',
      });
    }
  },
);

/** @deprecated — confirm/swap retired; returns 410 CONFIRM_RETIRED */
router.post(
  '/:crewId/week/confirm',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await confirmPivotCrewWeekPick(req, {
        crewId: req.params.crewId,
        eventId: req.body.eventId,
        eventIds: req.body.eventIds,
        batchWeek: req.body.batchWeek || req.query.batchWeek,
      });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/week/confirm', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to confirm crew pick.',
      });
    }
  },
);

/** @deprecated — confirm/swap retired; returns 410 SWAP_RETIRED */
router.post(
  '/:crewId/week/swap',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await swapPivotCrewWeekPick(req, {
        crewId: req.params.crewId,
        eventId: req.body.eventId,
        slotIndex: req.body.slotIndex,
        batchWeek: req.body.batchWeek || req.query.batchWeek,
      });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/week/swap', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to swap crew pick.',
      });
    }
  },
);

/** Dev only — clear locked/consensus pick so the crew returns to decide. */
router.post(
  '/:crewId/week/dev/reset-pick',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({
        success: false,
        message: 'Not found.',
      });
    }

    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await resetPivotCrewWeekPick(req, {
        crewId: req.params.crewId,
        batchWeek: req.body.batchWeek || req.query.batchWeek,
      });
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/week/dev/reset-pick', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to reset crew pick.',
      });
    }
  },
);

router.get(
  '/:crewId',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await getPivotCrewDetail(req, req.params.crewId);
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('GET /pivot/crews/:crewId', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load crew.',
      });
    }
  },
);

router.post(
  '/:crewId/invite',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  body('count').optional().isInt({ min: 1, max: 20 }).withMessage('count must be between 1 and 20.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await invitePivotCrewPlaceholders(req, req.params.crewId, {
        count: req.body?.count,
      });
      return handleServiceResult(res, result, 201);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/invite', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to create crew invites.',
      });
    }
  },
);

router.post(
  '/:crewId/members',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  body('userId').isMongoId().withMessage('A valid userId is required.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await addPivotCrewMember(req, req.params.crewId, {
        userId: req.body.userId,
      });
      return handleServiceResult(res, result, 201);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/members', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to add crew member.',
      });
    }
  },
);

router.post(
  '/:crewId/invite-link',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await rotatePivotCrewInviteLink(req, req.params.crewId);
      return handleServiceResult(res, result);
    } catch (err) {
      logPivotRouteError('POST /pivot/crews/:crewId/invite-link', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to rotate invite link.',
      });
    }
  },
);

module.exports = router;
