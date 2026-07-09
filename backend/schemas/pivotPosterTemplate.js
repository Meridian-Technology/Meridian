const mongoose = require('mongoose');

// A poster template is base artwork (stored in S3) plus a normalized square
// region where a per-code invite QR is stamped at render time. Coordinates are
// fractions of the poster's natural dimensions (0..1) so they are resolution
// independent: qrBox.x/y is the top-left of the square, qrBox.w is the side
// length as a fraction of the poster width (the region is always square in px).
const qrBoxSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    y: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    w: { type: Number, required: true, min: 0.02, max: 1, default: 0.25 },
  },
  { _id: false }
);

const pivotPosterTemplateSchema = new mongoose.Schema(
  {
    tenantKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    // S3 object key (folder/filename) so we can fetch/delete without relying on
    // the poster being publicly readable.
    imageKey: {
      type: String,
      required: true,
    },
    // Natural pixel dimensions of the base artwork (from sharp metadata).
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    qrBox: {
      type: qrBoxSchema,
      required: true,
      default: () => ({ x: 0.5, y: 0.5, w: 0.25 }),
    },
    // QR foreground color.
    qrColor: {
      type: String,
      default: '#1A1714',
      trim: true,
    },
    // When true, a rounded white card is drawn behind the QR for scannability on
    // busy artwork; otherwise the QR is stamped with a transparent background.
    plate: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

pivotPosterTemplateSchema.pre('validate', function normalizeFields() {
  if (this.tenantKey) {
    this.tenantKey = String(this.tenantKey).trim().toLowerCase();
  }
  if (this.name) {
    this.name = String(this.name).trim();
  }
});

pivotPosterTemplateSchema.index({ tenantKey: 1, createdAt: -1 });

module.exports = pivotPosterTemplateSchema;
