const { createHash, randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const getGlobalModels = require('./getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('./ensurePivotComputeJobIndexes');
const { UPLOAD_PURPOSE } = require('./pivotCarouselComputeContextService');
const {
  CAROUSEL_EXPORT_LIMITS,
  carouselExportArtifactPlan,
  normalizeCarouselSlideNumbers,
  sequentialCarouselSlideNumbers,
} = require('../utilities/pivotAdminComputeJobContract');
const {
  DEFAULT_PRESIGN_TTL_SECONDS,
  buildExportPrefix,
  buildExportObjectKey,
  assertObjectKeyBelongsToPrefix,
  sha256HexToS3Checksum,
  createPresignedPutUrl,
  headExportObject,
  hashExportObject,
  deleteExportPrefix,
} = require('./pivotExportArtifactStorage');

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function serviceError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function retentionMs() {
  const configured = Number(process.env.PIVOT_CAROUSEL_EXPORT_RETENTION_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_MS;
}

function asManifestEntry(artifact) {
  return {
    logicalName: artifact.logicalName,
    artifactId: artifact.artifactId,
    mimeType: artifact.mimeType,
    byteCount: artifact.byteCount,
    sha256: artifact.sha256,
    slideNumber: artifact.slideNumber ?? null,
  };
}

function verifyUploadGrant(grantToken, job, now) {
  const token = trimString(grantToken);
  if (!token) throw serviceError('Artifact upload grant token is required', 'ARTIFACT_GRANT_REQUIRED');
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, {
      clockTimestamp: Math.floor(now.getTime() / 1000),
    });
  } catch {
    throw serviceError('Artifact upload grant is expired or invalid', 'ARTIFACT_GRANT_INVALID', 401);
  }
  if (claims.purpose !== UPLOAD_PURPOSE) {
    throw serviceError('Token is not an artifact upload grant', 'ARTIFACT_GRANT_WRONG_PURPOSE', 403);
  }
  const attemptId = String(job.lease?.attemptId || '');
  if (
    claims.tenantKey !== job.tenantKey
    || claims.cityKey !== job.cityKey
    || claims.jobId !== job.externalJobId
    || claims.attemptId !== attemptId
    || claims.deckId !== job.options?.deckId
    || claims.deckRevision !== job.options?.deckRevision
  ) {
    throw serviceError('Artifact upload grant does not match this job attempt', 'ARTIFACT_GRANT_BINDING_MISMATCH', 403);
  }
  return claims;
}

function plannedSlideNumbers(job, slideCount) {
  if (Array.isArray(job?.options?.slideNumbers) && job.options.slideNumbers.length) {
    const selected = normalizeCarouselSlideNumbers(job.options.slideNumbers);
    if (selected.length !== slideCount) return [];
    return selected;
  }
  return sequentialCarouselSlideNumbers(slideCount);
}

function normalizeRequestedArtifacts(rawArtifacts, slideNumbers) {
  if (!Array.isArray(rawArtifacts) || !rawArtifacts.length) {
    throw serviceError('Artifact list is required', 'INVALID_ARTIFACT_UPLOADS');
  }
  const planByName = new Map(
    carouselExportArtifactPlan(slideNumbers).map((entry) => [entry.logicalName, entry]),
  );
  const seen = new Set();
  const artifacts = [];
  let totalBytes = 0;
  for (const raw of rawArtifacts) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw serviceError('Each artifact must be an object', 'INVALID_ARTIFACT_UPLOADS');
    }
    const logicalName = trimString(raw.logicalName);
    const mimeType = trimString(raw.mimeType);
    const sha256 = trimString(raw.sha256).toLowerCase();
    const byteCount = Number(raw.byteCount);
    const expected = planByName.get(logicalName);
    if (!expected) {
      throw serviceError(`Unapproved export filename: ${logicalName || '(empty)'}`, 'UNAPPROVED_EXPORT_FILENAME');
    }
    if (seen.has(logicalName)) {
      throw serviceError(`Duplicate export filename: ${logicalName}`, 'DUPLICATE_EXPORT_FILENAME');
    }
    if (mimeType !== expected.mimeType) {
      throw serviceError(`MIME type is not allowed for ${logicalName}`, 'UNAPPROVED_EXPORT_CONTENT_TYPE');
    }
    if (!Number.isInteger(byteCount) || byteCount < 1 || byteCount > CAROUSEL_EXPORT_LIMITS.maxBytesPerArtifact) {
      throw serviceError(`Artifact byte count is outside the allowed range: ${logicalName}`, 'ARTIFACT_SIZE_INVALID');
    }
    if (!SHA256_PATTERN.test(sha256)) {
      throw serviceError(`Artifact checksum is invalid: ${logicalName}`, 'ARTIFACT_CHECKSUM_INVALID');
    }
    seen.add(logicalName);
    totalBytes += byteCount;
    artifacts.push({
      logicalName,
      mimeType,
      byteCount,
      sha256,
      slideNumber: expected.slideNumber,
      artifactId: trimString(raw.artifactId) || null,
    });
  }
  if (artifacts.length > CAROUSEL_EXPORT_LIMITS.maxArtifactCount) {
    throw serviceError('Artifact count exceeds the export limit', 'ARTIFACT_COUNT_INVALID');
  }
  if (totalBytes > CAROUSEL_EXPORT_LIMITS.maxTotalBytes) {
    throw serviceError('Total artifact bytes exceed the export limit', 'ARTIFACT_TOTAL_SIZE_INVALID');
  }
  return artifacts;
}

function expectedPlanComplete(verified, slideNumbers) {
  const plan = carouselExportArtifactPlan(slideNumbers);
  if (verified.length !== plan.length) return false;
  const byName = new Map(verified.map((entry) => [entry.logicalName, entry]));
  return plan.every((expected) => {
    const actual = byName.get(expected.logicalName);
    return actual
      && actual.mimeType === expected.mimeType
      && (actual.slideNumber ?? null) === expected.slideNumber;
  });
}

function manifestsMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const byId = new Map(right.map((entry) => [entry.artifactId, entry]));
  return left.every((entry) => {
    const other = byId.get(entry.artifactId);
    return other
      && other.logicalName === entry.logicalName
      && other.mimeType === entry.mimeType
      && other.byteCount === entry.byteCount
      && other.sha256 === entry.sha256
      && (other.slideNumber ?? null) === (entry.slideNumber ?? null);
  });
}

async function getModels(req) {
  await ensurePivotComputeJobIndexes(req);
  return getGlobalModels(req, 'PivotComputeJob', 'PivotComputeJobAttempt');
}

function artifactIdFor(existing, logicalName) {
  const digest = createHash('sha256').update(logicalName).digest('hex').slice(0, 8);
  return existing?.artifactId || `artifact:${digest}-${randomUUID().slice(0, 8)}`;
}

function serializeUploads(entries, presignsByName) {
  return entries.map((entry) => {
    const presign = presignsByName.get(entry.logicalName);
    return {
      artifactId: entry.artifactId,
      logicalName: entry.logicalName,
      mimeType: entry.mimeType,
      slideNumber: entry.slideNumber ?? null,
      objectKey: entry.objectKey,
      byteCount: entry.byteCount,
      sha256: entry.sha256,
      status: entry.status,
      ...(presign ? {
        uploadUrl: presign.uploadUrl,
        uploadHeaders: presign.uploadHeaders,
        uploadExpiresAt: presign.uploadExpiresAt,
      } : {}),
    };
  });
}

async function initializeCarouselArtifactUploads(req, {
  job,
  grantToken,
  slideCount,
  artifacts: rawArtifacts,
  now = new Date(),
} = {}) {
  if (job?.kind !== 'carousel-export') {
    throw serviceError('Artifact uploads are only supported for carousel exports', 'ARTIFACT_KIND_UNSUPPORTED', 409);
  }
  const count = Number(slideCount);
  if (!Number.isInteger(count) || count < 1 || count > CAROUSEL_EXPORT_LIMITS.maxSlideCount) {
    throw serviceError('Carousel slide count is outside the export limits', 'CAROUSEL_SLIDE_COUNT_INVALID', 422);
  }
  const claims = verifyUploadGrant(grantToken, job, now);
  const slideNumbers = plannedSlideNumbers(job, count);
  if (!slideNumbers.length) {
    throw serviceError('Carousel slide selection does not match this export', 'CAROUSEL_SLIDE_SELECTION_INVALID', 422);
  }
  const requested = normalizeRequestedArtifacts(rawArtifacts, slideNumbers);
  const { PivotComputeJobAttempt, PivotComputeJob } = await getModels(req);
  const attempt = await PivotComputeJobAttempt.findById(job.lease.attemptId);
  if (!attempt) throw serviceError('Compute job attempt not found', 'COMPUTE_JOB_ATTEMPT_NOT_FOUND', 404);

  const prefix = buildExportPrefix({
    tenantKey: job.tenantKey,
    externalJobId: job.externalJobId,
    attemptNumber: job.lease.attemptNumber,
  });
  const existingByName = new Map((attempt.artifactUploads?.artifacts || []).map((entry) => [entry.logicalName, entry]));
  if (attempt.artifactUploads?.finalizedAt) {
    const verified = (attempt.artifactUploads.artifacts || []).filter((entry) => entry.status === 'verified');
    const requestedMatch = requested.every((entry) => {
      const existing = existingByName.get(entry.logicalName);
      return existing
        && existing.status === 'verified'
        && existing.sha256 === entry.sha256
        && existing.byteCount === entry.byteCount;
    });
    if (!requestedMatch) {
      throw serviceError('Finalized artifacts cannot be replaced on this attempt', 'ARTIFACTS_ALREADY_FINALIZED', 409);
    }
    return {
      prefix,
      finalized: true,
      expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
      artifacts: verified.map(asManifestEntry),
      uploads: serializeUploads(verified, new Map()),
    };
  }

  const grantExpiresAt = claims.exp ? new Date(claims.exp * 1000) : new Date(now.getTime() + DEFAULT_PRESIGN_TTL_SECONDS * 1000);
  const ttlSeconds = Math.max(1, Math.min(
    DEFAULT_PRESIGN_TTL_SECONDS,
    Math.floor((grantExpiresAt.getTime() - now.getTime()) / 1000),
  ));
  const nextArtifacts = [];
  const presignsByName = new Map();
  for (const entry of requested) {
    const existing = existingByName.get(entry.logicalName);
    if (existing?.status === 'verified') {
      if (existing.sha256 !== entry.sha256 || existing.byteCount !== entry.byteCount) {
        throw serviceError(`Verified artifact cannot be replaced: ${entry.logicalName}`, 'ARTIFACT_ALREADY_VERIFIED', 409);
      }
      nextArtifacts.push(existing);
      continue;
    }
    const objectKey = buildExportObjectKey({
      tenantKey: job.tenantKey,
      externalJobId: job.externalJobId,
      attemptNumber: job.lease.attemptNumber,
      logicalName: entry.logicalName,
    });
    const artifactId = artifactIdFor(existing, entry.logicalName);
    const presign = await createPresignedPutUrl({
      objectKey,
      contentType: entry.mimeType,
      byteCount: entry.byteCount,
      sha256: entry.sha256,
      expiresInSeconds: ttlSeconds,
    });
    const uploadExpiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    presignsByName.set(entry.logicalName, { ...presign, uploadExpiresAt });
    nextArtifacts.push({
      artifactId,
      logicalName: entry.logicalName,
      objectKey,
      mimeType: entry.mimeType,
      byteCount: entry.byteCount,
      sha256: entry.sha256,
      slideNumber: entry.slideNumber,
      status: 'pending',
      verifiedAt: null,
    });
  }
  for (const [logicalName, existing] of existingByName.entries()) {
    if (!requested.some((entry) => entry.logicalName === logicalName)) {
      nextArtifacts.push(existing);
    }
  }

  attempt.artifactUploads = {
    grantId: claims.grantId,
    prefix,
    slideCount: count,
    initializedAt: attempt.artifactUploads?.initializedAt || now,
    finalizedAt: null,
    cleanedAt: attempt.artifactUploads?.cleanedAt || null,
    artifacts: nextArtifacts,
  };
  await attempt.save();
  await PivotComputeJob.updateOne(
    { _id: job.id || job._id, 'lease.attemptId': job.lease.attemptId },
    { $set: { 'exportArtifacts': null } },
  );

  return {
    prefix,
    finalized: false,
    expiresAt: grantExpiresAt.toISOString(),
      artifacts: nextArtifacts.map(asManifestEntry),
      uploads: serializeUploads(
        nextArtifacts.filter((entry) => presignsByName.has(entry.logicalName)),
        presignsByName,
      ),
  };
}

async function verifyStoredObject(entry) {
  assertObjectKeyBelongsToPrefix(entry.objectKey, entry.objectKey.slice(0, entry.objectKey.lastIndexOf('/') + 1));
  const head = await headExportObject(entry.objectKey);
  const contentLength = Number(head.ContentLength);
  if (contentLength !== entry.byteCount) {
    throw serviceError(`Uploaded size does not match ${entry.logicalName}`, 'ARTIFACT_SIZE_MISMATCH', 409);
  }
  const contentType = String(head.ContentType || '').split(';')[0].trim();
  if (contentType && contentType !== entry.mimeType) {
    throw serviceError(`Uploaded content type does not match ${entry.logicalName}`, 'ARTIFACT_CONTENT_TYPE_MISMATCH', 409);
  }
  const storedChecksum = head.ChecksumSHA256 || head.checksumSHA256;
  if (storedChecksum) {
    if (storedChecksum !== sha256HexToS3Checksum(entry.sha256)) {
      throw serviceError(`Uploaded checksum does not match ${entry.logicalName}`, 'ARTIFACT_CHECKSUM_MISMATCH', 409);
    }
    return;
  }
  const hashed = await hashExportObject(entry.objectKey);
  if (hashed.sha256 !== entry.sha256 || hashed.byteCount !== entry.byteCount) {
    throw serviceError(`Uploaded checksum does not match ${entry.logicalName}`, 'ARTIFACT_CHECKSUM_MISMATCH', 409);
  }
}

async function finalizeCarouselArtifactUploads(req, {
  job,
  grantToken,
  artifacts: rawArtifacts,
  now = new Date(),
} = {}) {
  if (job?.kind !== 'carousel-export') {
    throw serviceError('Artifact uploads are only supported for carousel exports', 'ARTIFACT_KIND_UNSUPPORTED', 409);
  }
  const claims = verifyUploadGrant(grantToken, job, now);
  const { PivotComputeJobAttempt, PivotComputeJob } = await getModels(req);
  const attempt = await PivotComputeJobAttempt.findById(job.lease.attemptId);
  if (!attempt?.artifactUploads?.artifacts?.length) {
    throw serviceError('Artifact uploads have not been initialized', 'ARTIFACTS_NOT_INITIALIZED', 409);
  }

  const slideCount = Number(attempt.artifactUploads.slideCount);
  const slideNumbers = plannedSlideNumbers(job, slideCount);
  if (!slideNumbers.length) {
    throw serviceError('Carousel slide selection does not match this export', 'CAROUSEL_SLIDE_SELECTION_INVALID', 422);
  }
  const requested = normalizeRequestedArtifacts(rawArtifacts, slideNumbers);
  const existingByName = new Map(attempt.artifactUploads.artifacts.map((entry) => [entry.logicalName, entry]));

  if (attempt.artifactUploads.finalizedAt) {
    const verified = attempt.artifactUploads.artifacts
      .filter((entry) => entry.status === 'verified')
      .map(asManifestEntry);
    if (!manifestsMatch(verified, requested.map((entry) => {
      const existing = existingByName.get(entry.logicalName);
      return {
        ...entry,
        artifactId: existing?.artifactId || entry.artifactId,
      };
    }))) {
      throw serviceError('Finalized artifact manifest does not match this attempt', 'ARTIFACT_MANIFEST_MISMATCH', 409);
    }
    return {
      prefix: attempt.artifactUploads.prefix,
      finalized: true,
      artifacts: verified,
    };
  }

  const nextArtifacts = attempt.artifactUploads.artifacts.map((entry) => ({
    ...(typeof entry.toObject === 'function' ? entry.toObject() : entry),
  }));
  const nextByName = new Map(nextArtifacts.map((entry) => [entry.logicalName, entry]));

  for (const requestedArtifact of requested) {
    const existing = nextByName.get(requestedArtifact.logicalName);
    if (!existing) {
      throw serviceError(`Artifact was not initialized: ${requestedArtifact.logicalName}`, 'ARTIFACT_NOT_INITIALIZED', 409);
    }
    if (requestedArtifact.artifactId && requestedArtifact.artifactId !== existing.artifactId) {
      throw serviceError(`Artifact id mismatch: ${requestedArtifact.logicalName}`, 'ARTIFACT_ID_MISMATCH', 409);
    }
    if (existing.status === 'verified') {
      if (existing.sha256 !== requestedArtifact.sha256 || existing.byteCount !== requestedArtifact.byteCount) {
        throw serviceError(`Verified artifact cannot be replaced: ${requestedArtifact.logicalName}`, 'ARTIFACT_ALREADY_VERIFIED', 409);
      }
      continue;
    }
    if (existing.sha256 !== requestedArtifact.sha256 || existing.byteCount !== requestedArtifact.byteCount) {
      throw serviceError(`Finalization does not match the initialized upload: ${requestedArtifact.logicalName}`, 'ARTIFACT_UPLOAD_MISMATCH', 409);
    }
    const prefix = attempt.artifactUploads.prefix;
    assertObjectKeyBelongsToPrefix(existing.objectKey, prefix);
    await verifyStoredObject(existing);
    existing.status = 'verified';
    existing.verifiedAt = now;
  }

  const verified = nextArtifacts.filter((entry) => entry.status === 'verified').map(asManifestEntry);
  const complete = expectedPlanComplete(verified, slideNumbers);
  attempt.artifactUploads.artifacts = nextArtifacts;
  if (complete) {
    attempt.artifactUploads.finalizedAt = now;
    const prefix = attempt.artifactUploads.prefix;
    const expiresAt = new Date(now.getTime() + retentionMs());
    await PivotComputeJob.updateOne(
      { _id: job.id || job._id, 'lease.attemptId': job.lease.attemptId },
      {
        $set: {
          exportArtifacts: {
            attemptId: attempt._id,
            attemptNumber: attempt.attemptNumber,
            prefix,
            grantId: claims.grantId,
            finalizedAt: now,
            expiresAt,
            expired: false,
            cleanedAt: null,
            artifacts: nextArtifacts.filter((entry) => entry.status === 'verified').map((entry) => ({
              ...asManifestEntry(entry),
              objectKey: entry.objectKey,
            })),
          },
        },
      },
    );
  }
  await attempt.save();

  return {
    prefix: attempt.artifactUploads.prefix,
    finalized: complete,
    artifacts: verified,
  };
}

async function cleanupCarouselAttemptPrefix(req, {
  tenantKey,
  externalJobId,
  attemptNumber,
  attemptId = null,
} = {}) {
  const prefix = buildExportPrefix({ tenantKey, externalJobId, attemptNumber });
  const result = await deleteExportPrefix(prefix);
  if (attemptId) {
    const { PivotComputeJobAttempt } = await getModels(req);
    await PivotComputeJobAttempt.updateOne(
      { _id: attemptId },
      { $set: { 'artifactUploads.cleanedAt': new Date() } },
    );
  }
  return { prefix, ...result };
}

async function cleanupExpiredCarouselExports(req, { now = new Date(), limit = 25 } = {}) {
  const { PivotComputeJob } = await getModels(req);
  const expiredJobs = await PivotComputeJob.find({
    kind: 'carousel-export',
    'exportArtifacts.expired': false,
    'exportArtifacts.expiresAt': { $lte: now },
  }).limit(limit).lean();

  const cleaned = [];
  for (const job of expiredJobs) {
    const prefix = job.exportArtifacts?.prefix;
    if (prefix) {
      await deleteExportPrefix(prefix);
    }
    await PivotComputeJob.updateOne(
      { _id: job._id },
      {
        $set: {
          'exportArtifacts.expired': true,
          'exportArtifacts.cleanedAt': now,
        },
      },
    );
    cleaned.push(job.externalJobId);
  }
  return { cleaned };
}

function assertCompletedResultMatchesVerifiedArtifacts(job, result) {
  if (job?.kind !== 'carousel-export' || result?.outcome !== 'completed') return;
  const verified = job.exportArtifacts?.artifacts;
  if (!Array.isArray(verified) || !verified.length || job.exportArtifacts?.expired) {
    throw serviceError('Carousel export artifacts have not been finalized', 'CAROUSEL_ARTIFACTS_NOT_FINALIZED', 409);
  }
  const submitted = Array.isArray(result.artifacts) ? result.artifacts : [];
  if (!manifestsMatch(verified.map(asManifestEntry), submitted)) {
    throw serviceError('Carousel result artifacts do not match the verified manifest', 'ARTIFACT_MANIFEST_MISMATCH', 409);
  }
  if (job.exportArtifacts.attemptNumber && job.lease?.attemptNumber
    && job.exportArtifacts.attemptNumber !== job.lease.attemptNumber) {
    throw serviceError('Verified artifacts belong to a different attempt', 'ARTIFACT_ATTEMPT_MISMATCH', 409);
  }
}

module.exports = {
  initializeCarouselArtifactUploads,
  finalizeCarouselArtifactUploads,
  cleanupCarouselAttemptPrefix,
  cleanupExpiredCarouselExports,
  assertCompletedResultMatchesVerifiedArtifacts,
  DEFAULT_RETENTION_MS,
};
