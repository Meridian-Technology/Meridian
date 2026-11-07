const mongoose = require('mongoose');

/**
 * One carousel MCP action, kept so a repeated idempotency key can return the
 * first result and so the audit names the token that performed it.
 * globalUserId is the token owner. tokenLabel is the token's name.
 * idempotencyKey is null for actions that are bound only to an issue revision.
 */
const carouselMcpActionSchema = new mongoose.Schema(
  {
    globalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalUser',
      required: true,
    },
    tokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformAccessToken',
      required: true,
    },
    tokenLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    tool: {
      type: String,
      required: true,
      enum: ['start_compose', 'request_revision', 'pick_option', 'approve', 'mark_posted'],
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 128,
    },
    outcome: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

carouselMcpActionSchema.index(
  { globalUserId: 1, tool: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = carouselMcpActionSchema;
