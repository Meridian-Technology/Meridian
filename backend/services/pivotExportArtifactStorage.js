const { createHash } = require('crypto');
const s3 = require('../aws-config');
const { skipS3DeleteOnStaging } = require('../utilities/stagingEnvironment');

const EXPORT_PREFIX_ROOT = 'pivot-exports';
const TENANT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const JOB_ID_PATTERN = /^[a-zA-Z0-9:_-]{8,128}$/;
const LOGICAL_NAME_PATTERN = /^(slide-(0[1-9]|1[0-9]|20)\.png|carousel\.zip)$/;
const DEFAULT_PRESIGN_TTL_SECONDS = 10 * 60;
const MAX_GET_PRESIGN_TTL_SECONDS = 60 * 60;

function serviceError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function resolveBucket() {
  const bucket = String(process.env.AWS_S3_BUCKET_NAME || '').trim();
  if (!bucket) {
    throw serviceError(
      'Carousel export object storage is not configured',
      'CAROUSEL_EXPORT_STORAGE_UNCONFIGURED',
      503,
    );
  }
  return bucket;
}

function assertTenantKey(tenantKey) {
  const value = String(tenantKey || '').trim().toLowerCase();
  if (!TENANT_KEY_PATTERN.test(value)) {
    throw serviceError('Invalid export tenant key', 'INVALID_EXPORT_OBJECT_PREFIX');
  }
  return value;
}

function assertExternalJobId(externalJobId) {
  const value = String(externalJobId || '').trim();
  if (!JOB_ID_PATTERN.test(value)) {
    throw serviceError('Invalid export job id', 'INVALID_EXPORT_OBJECT_PREFIX');
  }
  return value;
}

function assertAttemptNumber(attemptNumber) {
  const value = Number(attemptNumber);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw serviceError('Invalid export attempt number', 'INVALID_EXPORT_OBJECT_PREFIX');
  }
  return value;
}

function assertLogicalName(logicalName) {
  const value = String(logicalName || '').trim();
  if (!LOGICAL_NAME_PATTERN.test(value)) {
    throw serviceError(`Unapproved export filename: ${value || '(empty)'}`, 'UNAPPROVED_EXPORT_FILENAME');
  }
  return value;
}

function buildExportPrefix({ tenantKey, externalJobId, attemptNumber }) {
  const tenant = assertTenantKey(tenantKey);
  const jobId = assertExternalJobId(externalJobId);
  const attempt = assertAttemptNumber(attemptNumber);
  return `${EXPORT_PREFIX_ROOT}/${tenant}/${jobId}/${attempt}/`;
}

function buildExportObjectKey({ tenantKey, externalJobId, attemptNumber, logicalName }) {
  return `${buildExportPrefix({ tenantKey, externalJobId, attemptNumber })}${assertLogicalName(logicalName)}`;
}

function assertObjectKeyBelongsToPrefix(objectKey, prefix) {
  const key = String(objectKey || '');
  if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/') || key.includes('..')) {
    throw serviceError('Export object key is outside its job attempt prefix', 'EXPORT_OBJECT_PREFIX_MISMATCH', 409);
  }
}

function sha256HexToS3Checksum(sha256) {
  return Buffer.from(String(sha256), 'hex').toString('base64');
}

async function createPresignedGetUrl({
  objectKey,
  contentType,
  filename,
  expiresInSeconds = 120,
}) {
  const bucket = resolveBucket();
  // Downloads keep a short default. A preview asks for an hour, which is the longest GET this signs.
  const ttl = Math.max(1, Math.min(MAX_GET_PRESIGN_TTL_SECONDS, Number(expiresInSeconds) || 120));
  const safeName = assertLogicalName(filename);
  const params = {
    Bucket: bucket,
    Key: objectKey,
    Expires: ttl,
    ResponseContentType: contentType,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  };
  const downloadUrl = await s3.getSignedUrlPromise('getObject', params);
  return {
    downloadUrl,
    expiresInSeconds: ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

async function createPresignedPutUrl({
  objectKey,
  contentType,
  byteCount,
  sha256,
  expiresInSeconds = DEFAULT_PRESIGN_TTL_SECONDS,
}) {
  const bucket = resolveBucket();
  const ttl = Math.max(1, Math.min(DEFAULT_PRESIGN_TTL_SECONDS, Number(expiresInSeconds) || DEFAULT_PRESIGN_TTL_SECONDS));
  const checksum = sha256HexToS3Checksum(sha256);
  const params = {
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    ChecksumSHA256: checksum,
    Expires: ttl,
  };
  const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
  return {
    uploadUrl,
    uploadHeaders: {
      'Content-Type': contentType,
      'Content-Length': String(byteCount),
      'x-amz-checksum-sha256': checksum,
    },
    expiresInSeconds: ttl,
  };
}

async function headExportObject(objectKey) {
  const bucket = resolveBucket();
  try {
    return await s3.headObject({
      Bucket: bucket,
      Key: objectKey,
      ChecksumMode: 'ENABLED',
    }).promise();
  } catch (error) {
    if (error?.code === 'NotFound' || error?.statusCode === 404) {
      throw serviceError('Export object is missing', 'EXPORT_OBJECT_NOT_FOUND', 409);
    }
    throw error;
  }
}

async function hashExportObject(objectKey) {
  const bucket = resolveBucket();
  const response = await s3.getObject({ Bucket: bucket, Key: objectKey }).promise();
  const body = response.Body;
  const digest = createHash('sha256');
  if (Buffer.isBuffer(body)) {
    digest.update(body);
  } else if (typeof body === 'string') {
    digest.update(body);
  } else if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) digest.update(chunk);
  } else {
    throw serviceError('Export object body could not be hashed', 'EXPORT_OBJECT_HASH_FAILED', 500);
  }
  return {
    sha256: digest.digest('hex'),
    byteCount: Buffer.isBuffer(body) ? body.length : Number(response.ContentLength) || 0,
    contentType: response.ContentType || null,
  };
}

async function deleteExportPrefix(prefix) {
  if (!String(prefix || '').startsWith(`${EXPORT_PREFIX_ROOT}/`) || !prefix.endsWith('/')) {
    throw serviceError('Refusing to delete an unscoped export prefix', 'INVALID_EXPORT_OBJECT_PREFIX');
  }
  if (skipS3DeleteOnStaging(`export prefix ${prefix}`)) return { deleted: 0 };
  const bucket = resolveBucket();
  let continuationToken;
  let deleted = 0;
  do {
    const listed = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }).promise();
    const keys = (listed.Contents || []).map((entry) => entry.Key).filter(Boolean);
    if (keys.length) {
      await s3.deleteObjects({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }).promise();
      deleted += keys.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return { deleted };
}

function diagnosticCheck(name, status, detail) {
  return { name, status, detail };
}

async function diagnoseCarouselExportStorage({
  env = process.env,
  s3Client = s3,
  now = () => Date.now(),
} = {}) {
  const startedAtMs = now();
  const bucket = String(env.AWS_S3_BUCKET_NAME || '').trim();
  const region = String(env.AWS_REGION || '').trim() || 'unspecified region';
  const hasKeys = Boolean(
    String(env.AWS_ACCESS_KEY_ID || '').trim()
    && String(env.AWS_SECRET_ACCESS_KEY || '').trim(),
  );
  const checkedAt = new Date(startedAtMs).toISOString();
  const finish = (payload) => ({
    checkedAt,
    durationMs: Math.max(0, now() - startedAtMs),
    target: { bucket: bucket || null, prefix: `${EXPORT_PREFIX_ROOT}/` },
    ...payload,
  });

  if (!bucket) {
    return finish({
      status: 'failed',
      code: 'CAROUSEL_EXPORT_STORAGE_UNCONFIGURED',
      message: 'Carousel export object storage is not configured.',
      checks: [
        diagnosticCheck('Bucket configuration', 'failed', 'AWS_S3_BUCKET_NAME is missing.'),
        diagnosticCheck('Credentials', 'not-run', 'Skipped until a bucket is configured.'),
        diagnosticCheck('List prefix', 'not-run', 'Skipped until a bucket is configured.'),
        diagnosticCheck('Presigned upload', 'not-run', 'Skipped until a bucket is configured.'),
      ],
    });
  }

  const checks = [
    diagnosticCheck('Bucket configuration', 'passed', `Bucket ${bucket} is set in ${region}.`),
  ];
  if (!hasKeys) {
    checks.push(diagnosticCheck('Credentials', 'failed', 'AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing.'));
    checks.push(diagnosticCheck('List prefix', 'not-run', 'Skipped until credentials are present.'));
    checks.push(diagnosticCheck('Presigned upload', 'not-run', 'Skipped until credentials are present.'));
    return finish({
      status: 'failed',
      code: 'CAROUSEL_EXPORT_STORAGE_UNCONFIGURED',
      message: 'Carousel export object storage credentials are missing.',
      checks,
    });
  }
  checks.push(diagnosticCheck('Credentials', 'passed', 'AWS access keys are present.'));

  try {
    await s3Client.listObjectsV2({
      Bucket: bucket,
      Prefix: `${EXPORT_PREFIX_ROOT}/`,
      MaxKeys: 1,
    }).promise();
    checks.push(diagnosticCheck('List prefix', 'passed', `Meridian can list ${EXPORT_PREFIX_ROOT}/.`));
  } catch (error) {
    checks.push(diagnosticCheck(
      'List prefix',
      'failed',
      error?.message || 'Could not list the export prefix.',
    ));
    checks.push(diagnosticCheck('Presigned upload', 'not-run', 'Skipped because listing the prefix failed.'));
    return finish({
      status: 'failed',
      code: 'CAROUSEL_EXPORT_STORAGE_LIST_FAILED',
      message: 'Meridian could not list the carousel export prefix.',
      checks,
    });
  }

  try {
    const uploadUrl = await s3Client.getSignedUrlPromise('putObject', {
      Bucket: bucket,
      Key: `${EXPORT_PREFIX_ROOT}/_diagnostic/probe.bin`,
      ContentType: 'application/octet-stream',
      ChecksumSHA256: sha256HexToS3Checksum('00'.repeat(32)),
      Expires: 60,
    });
    if (!uploadUrl) throw new Error('Presign returned an empty URL');
    checks.push(diagnosticCheck(
      'Presigned upload',
      'passed',
      'A short-lived PUT URL can be minted without writing an object.',
    ));
  } catch (error) {
    checks.push(diagnosticCheck(
      'Presigned upload',
      'failed',
      error?.message || 'Could not mint a presigned upload URL.',
    ));
    return finish({
      status: 'failed',
      code: 'CAROUSEL_EXPORT_STORAGE_PRESIGN_FAILED',
      message: 'Meridian could not mint a presigned carousel upload URL.',
      checks,
    });
  }

  return finish({
    status: 'accepted',
    code: 'CAROUSEL_EXPORT_STORAGE_OK',
    message: 'Object storage can list the export prefix and mint a short-lived upload URL.',
    checks,
  });
}

module.exports = {
  EXPORT_PREFIX_ROOT,
  DEFAULT_PRESIGN_TTL_SECONDS,
  MAX_GET_PRESIGN_TTL_SECONDS,
  LOGICAL_NAME_PATTERN,
  buildExportPrefix,
  buildExportObjectKey,
  assertObjectKeyBelongsToPrefix,
  sha256HexToS3Checksum,
  createPresignedGetUrl,
  createPresignedPutUrl,
  headExportObject,
  hashExportObject,
  deleteExportPrefix,
  diagnoseCarouselExportStorage,
};
