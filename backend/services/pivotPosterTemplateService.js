const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const QRCode = require('qrcode');
const s3 = require('../aws-config');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');

const POSTER_FOLDER = 'pivot-posters';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function isPivotTenant(tenant) {
  return tenant?.pivotPilot === true || tenant?.tenantType === 'pivot';
}

async function requirePivotTenant(req, tenantKey) {
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant) {
    return { error: 'Tenant not found.', status: 404 };
  }
  if (!isPivotTenant(tenant)) {
    return { error: 'Poster templates are only available for Pivot city tenants.', status: 403 };
  }
  return { tenant };
}

function serializePosterTemplate(doc) {
  const row = doc?.toObject ? doc.toObject() : doc;
  return {
    _id: String(row._id),
    tenantKey: row.tenantKey,
    name: row.name,
    imageUrl: row.imageUrl,
    width: row.width || null,
    height: row.height || null,
    qrBox: {
      x: row.qrBox?.x ?? 0.5,
      y: row.qrBox?.y ?? 0.5,
      w: row.qrBox?.w ?? 0.25,
    },
    qrColor: row.qrColor || '#1A1714',
    plate: row.plate !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseQrBox(raw) {
  let box = raw;
  if (typeof raw === 'string') {
    try {
      box = JSON.parse(raw);
    } catch {
      return { error: 'qrBox must be valid JSON.' };
    }
  }
  if (!box || typeof box !== 'object') return { error: 'qrBox is required.' };
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  if (![x, y, w].every(Number.isFinite)) {
    return { error: 'qrBox.x, qrBox.y and qrBox.w must be numbers.' };
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return { error: 'qrBox.x and qrBox.y must be between 0 and 1.' };
  }
  if (w < 0.02 || w > 1) {
    return { error: 'qrBox.w must be between 0.02 and 1.' };
  }
  return { box: { x, y, w } };
}

function normalizeColor(raw, fallback = '#1A1714') {
  const value = String(raw || '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : fallback;
}

function s3KeyForPoster(tenantKey, file) {
  const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
  const random = crypto.randomBytes(8).toString('hex');
  return `${POSTER_FOLDER}/${tenantKey}/${Date.now()}-${random}${ext}`;
}

async function listPosterTemplates(req, tenantKey) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotPosterTemplate } = getGlobalModels(req, 'PivotPosterTemplate');
  const docs = await PivotPosterTemplate.find({ tenantKey }).sort({ createdAt: -1 }).lean();
  return { tenantKey, templates: docs.map(serializePosterTemplate) };
}

async function createPosterTemplate(req, tenantKey, file, body = {}) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  if (!file) return { error: 'A poster image file is required.', status: 400 };
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { error: 'Poster must be a JPEG, PNG, or WebP image.', status: 400 };
  }

  const name = String(body.name || '').trim();
  if (!name) return { error: 'Template name is required.', status: 400 };

  const parsedBox = parseQrBox(body.qrBox);
  if (parsedBox.error) return { error: parsedBox.error, status: 400 };

  let meta;
  try {
    meta = await sharp(file.buffer).metadata();
  } catch {
    return { error: 'Could not read the poster image.', status: 400 };
  }

  const key = s3KeyForPoster(tenantKey, file);
  const uploaded = await s3
    .upload({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000',
    })
    .promise();

  const { PivotPosterTemplate } = getGlobalModels(req, 'PivotPosterTemplate');
  const doc = await PivotPosterTemplate.create({
    tenantKey,
    name,
    imageUrl: uploaded.Location,
    imageKey: key,
    width: meta.width || null,
    height: meta.height || null,
    qrBox: parsedBox.box,
    qrColor: normalizeColor(body.qrColor),
    plate: body.plate === undefined ? true : body.plate === true || body.plate === 'true',
  });

  return { template: serializePosterTemplate(doc) };
}

async function updatePosterTemplate(req, tenantKey, id, body = {}) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotPosterTemplate } = getGlobalModels(req, 'PivotPosterTemplate');
  const doc = await PivotPosterTemplate.findOne({ _id: id, tenantKey });
  if (!doc) return { error: 'Poster template not found.', status: 404 };

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'Template name cannot be empty.', status: 400 };
    doc.name = name;
  }
  if (body.qrBox !== undefined) {
    const parsedBox = parseQrBox(body.qrBox);
    if (parsedBox.error) return { error: parsedBox.error, status: 400 };
    doc.qrBox = parsedBox.box;
  }
  if (body.qrColor !== undefined) {
    doc.qrColor = normalizeColor(body.qrColor, doc.qrColor);
  }
  if (body.plate !== undefined) {
    doc.plate = body.plate === true || body.plate === 'true';
  }

  await doc.save();
  return { template: serializePosterTemplate(doc) };
}

async function deletePosterTemplate(req, tenantKey, id) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotPosterTemplate } = getGlobalModels(req, 'PivotPosterTemplate');
  const doc = await PivotPosterTemplate.findOneAndDelete({ _id: id, tenantKey });
  if (!doc) return { error: 'Poster template not found.', status: 404 };

  if (doc.imageKey) {
    try {
      await s3
        .deleteObject({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: doc.imageKey })
        .promise();
    } catch (err) {
      // Non-fatal: the DB record is already gone; log and move on.
      console.error('Failed to delete poster art from S3:', err.message);
    }
  }
  return { deleted: true };
}

function resolveOrigin(requestedOrigin) {
  const fallback =
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://www.meridian.study';
  if (!requestedOrigin) return fallback;
  try {
    const parsed = new URL(requestedOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

function buildInviteUrl(code, requestedOrigin) {
  return `${resolveOrigin(requestedOrigin)}/invite?code=${encodeURIComponent(code)}`;
}

/**
 * Build a rounded-style QR as an SVG string, matching the frontend "QR" option
 * (qr-code-styling extra-rounded): data modules are drawn with corners rounded
 * only where they have no filled neighbour (so runs connect into smooth shapes),
 * and the three finder patterns are drawn as rounded square outlines with a
 * rounded centre dot. Rasterized by sharp at composite time.
 */
function buildStyledQrSvg(text, { sizePx, color = '#1A1714', margin = 0 } = {}) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const N = qr.modules.size;
  const data = qr.modules.data;
  const total = N + margin * 2;
  const m = sizePx / total;
  const off = margin * m;
  const get = (r, c) => (r < 0 || c < 0 || r >= N || c >= N ? 0 : data[r * N + c]);
  const inFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  const f = (n) => Math.round(n * 100) / 100;

  const s = m;
  const r = m / 2;
  let d = '';
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (!get(row, col) || inFinder(row, col)) continue;
      const px = col * m + off;
      const py = row * m + off;
      const rTL = !get(row - 1, col) && !get(row, col - 1);
      const rTR = !get(row - 1, col) && !get(row, col + 1);
      const rBR = !get(row + 1, col) && !get(row, col + 1);
      const rBL = !get(row + 1, col) && !get(row, col - 1);
      let p = `M ${f(px + (rTL ? r : 0))} ${f(py)} `;
      p += `L ${f(px + s - (rTR ? r : 0))} ${f(py)} `;
      p += rTR ? `A ${f(r)} ${f(r)} 0 0 1 ${f(px + s)} ${f(py + r)} ` : `L ${f(px + s)} ${f(py)} `;
      p += `L ${f(px + s)} ${f(py + s - (rBR ? r : 0))} `;
      p += rBR ? `A ${f(r)} ${f(r)} 0 0 1 ${f(px + s - r)} ${f(py + s)} ` : `L ${f(px + s)} ${f(py + s)} `;
      p += `L ${f(px + (rBL ? r : 0))} ${f(py + s)} `;
      p += rBL ? `A ${f(r)} ${f(r)} 0 0 1 ${f(px)} ${f(py + s - r)} ` : `L ${f(px)} ${f(py + s)} `;
      p += `L ${f(px)} ${f(py + (rTL ? r : 0))} `;
      p += rTL ? `A ${f(r)} ${f(r)} 0 0 1 ${f(px + r)} ${f(py)} ` : `L ${f(px)} ${f(py)} `;
      d += `${p}Z `;
    }
  }

  const finders = [[0, 0], [0, N - 7], [N - 7, 0]];
  let finderSvg = '';
  for (const [r0, c0] of finders) {
    const ox = c0 * m + off;
    const oy = r0 * m + off;
    finderSvg +=
      `<rect x="${f(ox + m / 2)}" y="${f(oy + m / 2)}" width="${f(6 * m)}" height="${f(6 * m)}" ` +
      `rx="${f(2 * m)}" ry="${f(2 * m)}" fill="none" stroke="${color}" stroke-width="${f(m)}"/>`;
    finderSvg +=
      `<rect x="${f(ox + 2 * m)}" y="${f(oy + 2 * m)}" width="${f(3 * m)}" height="${f(3 * m)}" ` +
      `rx="${f(1.2 * m)}" ry="${f(1.2 * m)}" fill="${color}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}">` +
    `<path d="${d}" fill="${color}"/>${finderSvg}</svg>`
  );
}

async function fetchPosterBuffer(doc) {
  const obj = await s3
    .getObject({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: doc.imageKey })
    .promise();
  return obj.Body;
}

/**
 * Render a poster with the invite QR stamped into the template's box.
 * @returns {{ buffer?: Buffer, filename?: string, error?: string, status?: number }}
 */
async function renderPoster(req, tenantKey, id, code, origin) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return { error: 'A referral code is required.', status: 400 };

  const { PivotPosterTemplate } = getGlobalModels(req, 'PivotPosterTemplate');
  const doc = await PivotPosterTemplate.findOne({ _id: id, tenantKey }).lean();
  if (!doc) return { error: 'Poster template not found.', status: 404 };

  const posterBuffer = await fetchPosterBuffer(doc);
  const base = sharp(posterBuffer);
  const meta = await base.metadata();
  const W = meta.width;
  const H = meta.height;
  if (!W || !H) return { error: 'Poster image has no readable dimensions.', status: 400 };

  const box = doc.qrBox || { x: 0.5, y: 0.5, w: 0.25 };
  const boxSize = Math.max(1, Math.round(box.w * W));
  let left = Math.round(box.x * W);
  let top = Math.round(box.y * H);
  left = Math.max(0, Math.min(left, W - boxSize));
  top = Math.max(0, Math.min(top, H - boxSize));

  const inviteUrl = buildInviteUrl(cleanCode, origin);
  const qrColor = normalizeColor(doc.qrColor);
  const plate = doc.plate !== false;

  const composites = [];
  let qrSize = boxSize;
  let qrLeft = left;
  let qrTop = top;

  if (plate) {
    const pad = Math.max(2, Math.round(boxSize * 0.08));
    qrSize = Math.max(1, boxSize - pad * 2);
    qrLeft = left + pad;
    qrTop = top + pad;
    const radius = Math.round(boxSize * 0.12);
    const plateSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${boxSize}" height="${boxSize}">` +
        `<rect x="0" y="0" width="${boxSize}" height="${boxSize}" rx="${radius}" ry="${radius}" fill="#ffffff"/>` +
        `</svg>`
    );
    composites.push({ input: plateSvg, left, top });
  }

  // The white plate already supplies a quiet zone, so no internal margin is
  // needed there; without a plate, add a couple of modules of quiet zone.
  const qrSvg = buildStyledQrSvg(inviteUrl, {
    sizePx: qrSize,
    color: qrColor,
    margin: plate ? 0 : 2,
  });
  composites.push({ input: Buffer.from(qrSvg), left: qrLeft, top: qrTop });

  const outBuffer = await base.composite(composites).png().toBuffer();
  const safeCode = cleanCode.replace(/[^a-z0-9]/gi, '-');
  const safeName = (doc.name || 'poster').replace(/[^a-z0-9]/gi, '-');
  return { buffer: outBuffer, filename: `${safeName}-${safeCode}.png` };
}

module.exports = {
  listPosterTemplates,
  createPosterTemplate,
  updatePosterTemplate,
  deletePosterTemplate,
  renderPoster,
  serializePosterTemplate,
};
