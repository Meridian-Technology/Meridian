const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { uploadImageToS3 } = require('./imageUploadService');
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MIME_BY_FORMAT = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES }, fileFilter: (_req, file, callback) => callback(TYPES.has(file.mimetype) ? null : new Error('Use PNG, JPEG, WebP or GIF.'), TYPES.has(file.mimetype)) }).single('image');
function studioUpload(req, res, next) {
  upload(req, res, error => error ? res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Images must be 8 MB or smaller.' : error.message }) : next());
}
const serialize = row => ({ id: String(row._id), accountId: String(row.accountId), key: row.key, src: row.src, width: row.width, height: row.height, alt: row.alt, credit: row.credit });
async function listAssets(req, accountId) {
  const { loadAccount } = require('./pivotCarouselIssueService');
  const gate = await loadAccount(req, accountId); if (gate.error) return gate;
  const { PivotCarouselAsset } = getGlobalModels(req, 'PivotCarouselAsset');
  const rows = await PivotCarouselAsset.find({ accountId }).sort({ createdAt: -1 }).limit(200).lean();
  return { data: { assets: rows.map(serialize) } };
}
async function uploadAsset(req, accountId, file) {
  const { loadAccount } = require('./pivotCarouselIssueService');
  const gate = await loadAccount(req, accountId); if (gate.error) return gate;
  if (!file || !TYPES.has(file.mimetype) || file.size > MAX_BYTES) return { error: 'Choose a PNG, JPEG, WebP or GIF up to 8 MB.', status: 400, code: 'INVALID_IMAGE' };
  let metadata;
  try { metadata = await sharp(file.buffer, { limitInputPixels: 60_000_000 }).metadata(); }
  catch (_) { return { error: 'The image could not be decoded.', status: 400, code: 'INVALID_IMAGE' }; }
  const mime = MIME_BY_FORMAT[metadata.format];
  if (!metadata.width || !metadata.height || mime !== file.mimetype) return { error: 'The image format does not match its file type.', status: 400, code: 'INVALID_IMAGE' };
  const folder = `pivot-carousel/accounts/${accountId}`;
  const filename = `${randomUUID()}.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`;
  const src = await uploadImageToS3(file, folder, filename, { maxBytes: MAX_BYTES });
  const { PivotCarouselAsset } = getGlobalModels(req, 'PivotCarouselAsset');
  const row = await PivotCarouselAsset.create({ accountId, key: `${folder}/${filename}`, src, width: metadata.width, height: metadata.height, mimeType: mime, alt: String(file.originalname || '').slice(0, 255), credit: String(req.body?.credit || '').slice(0, 1000), createdBy: req.user?.globalUserId || req.user?.userId });
  return { data: { asset: serialize(row) } };
}
async function validateAssetOwnership(req, accountId, document) {
  const refs = [];
  const walk = node => {
    if (!node) return;
    if (node.asset && (node.asset.accountId || node.asset.key?.startsWith('pivot-carousel/accounts/') || String(node.asset.src || '').includes('/pivot-carousel/accounts/'))) refs.push(node.asset);
    if (node.background) walk(node.background);
    for (const child of node.slides || node.elements || node.children || []) walk(child);
  }; walk(document);
  if (!refs.length) return null;
  const { PivotCarouselAsset } = getGlobalModels(req, 'PivotCarouselAsset');
  for (const asset of refs) {
    const stored = await PivotCarouselAsset.findOne({ accountId, key: asset.key }).lean();
    if (!stored || stored.src !== asset.src || (asset.accountId && String(asset.accountId) !== String(accountId))) return { error: 'This image belongs to another account or is unavailable.', status: 403, code: 'ASSET_NOT_ALLOWED' };
  }
  return null;
}
async function fitExportImage(bytes) {
  let metadata;
  try { metadata = await sharp(bytes, { limitInputPixels: 60_000_000 }).metadata(); }
  catch (_) { return { error: 'A photograph in this revision could not be saved for export.', status: 422, code: 'ASSET_UNAVAILABLE' }; }
  const type = MIME_BY_FORMAT[metadata.format];
  if (!metadata.width || !metadata.height || (!type && metadata.format !== 'heif' && metadata.format !== 'avif')) {
    return { error: 'A photograph in this revision is not a PNG, JPEG, WebP, or GIF.', status: 422, code: 'ASSET_UNAVAILABLE' };
  }
  if (type && bytes.length <= MAX_BYTES) return { buffer: bytes, mimetype: type };
  const encoded = await sharp(bytes, { limitInputPixels: 60_000_000, animated: false })
    .rotate()
    .resize({ width: 2160, height: 2700, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  if (encoded.length > MAX_BYTES) {
    return { error: 'A photograph in this revision is too large to save for export.', status: 422, code: 'ASSET_UNAVAILABLE' };
  }
  return { buffer: encoded, mimetype: 'image/jpeg' };
}
function assetNeedsPin(asset) {
  const src = String(asset?.src || '');
  if (!/^https?:\/\//i.test(src)) return false;
  return !(asset.key && String(asset.key).startsWith('pivot-carousel/accounts/'));
}

async function pinRemoteAssets(req, accountId, document) {
  const copy = JSON.parse(JSON.stringify(document));
  const assets = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (assetNeedsPin(node.asset)) assets.push(node.asset);
    if (node.background) walk(node.background);
    for (const child of node.slides || node.elements || node.children || []) walk(child);
  };
  walk(copy);
  for (const asset of assets) {
    const response = await fetch(asset.src);
    if (!response.ok) return { error: 'A photograph in this revision could not be saved for export.', status: 422, code: 'ASSET_UNAVAILABLE' };
    const bytes = Buffer.from(await response.arrayBuffer());
    const fitted = await fitExportImage(bytes);
    if (fitted.error) return fitted;
    const pinned = await uploadAsset(req, accountId, { buffer: fitted.buffer, size: fitted.buffer.length, mimetype: fitted.mimetype, originalname: 'export-pin' });
    if (pinned.error) return pinned;
    asset.key = pinned.data.asset.key;
    asset.src = pinned.data.asset.src;
    asset.accountId = String(accountId);
  }
  return { document: copy };
}

module.exports = { studioUpload, listAssets, uploadAsset, validateAssetOwnership, pinRemoteAssets, assetNeedsPin, fitExportImage };
