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
  rotatePivotCrewInviteLink,
  joinPivotCrew,
  invitePivotCrewPlaceholders,
  addPivotCrewMember,
} = require('../services/pivotCrewService');
const {
  getPivotCrewWeekProgress,
  CREW_WEEK_PROGRESS_CACHE_TTL_MS,
} = require('../services/pivotCrewWeekStateService');
const {
  getPivotCrewWeekJudgement,
  confirmPivotCrewWeekPick,
  swapPivotCrewWeekPick,
} = require('../services/pivotCrewJudgementService');

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

router.post(
  '/:crewId/week/confirm',
  verifyToken,
  param('crewId').isMongoId().withMessage('Invalid crew id.'),
  body('eventId').isMongoId().withMessage('A valid eventId is required.'),
  async (req, res) => {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) {
      return validationResponse;
    }

    try {
      const result = await confirmPivotCrewWeekPick(req, {
        crewId: req.params.crewId,
        eventId: req.body.eventId,
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
