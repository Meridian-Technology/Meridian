const mongoose = require('mongoose');

const PIVOT_TAG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const pivotTagCatalogSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      validate: {
        validator(value) {
          return PIVOT_TAG_SLUG_PATTERN.test(value);
        },
        message: 'slug must be lowercase kebab-case (e.g. live-music)',
      },
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      required: true,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

pivotTagCatalogSchema.pre('validate', function normalizeSlug() {
  if (this.slug) {
    this.slug = String(this.slug).trim().toLowerCase();
  }
  if (this.label) {
    this.label = String(this.label).trim();
  }
});

pivotTagCatalogSchema.index({ slug: 1 }, { unique: true });
pivotTagCatalogSchema.index({ active: 1, sortOrder: 1 });

module.exports = pivotTagCatalogSchema;
module.exports.PIVOT_TAG_SLUG_PATTERN = PIVOT_TAG_SLUG_PATTERN;
