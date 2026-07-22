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
} = require('../services/pivotCrewService');

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
