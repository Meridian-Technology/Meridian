const path = require('path');
const fs = require('fs');

const CONTRACT_VERSION = '1';

const COMPUTE_JOB_KINDS = Object.freeze([
  'city-source-discovery',
  'city-curation-refresh',
  'carousel-export',
]);

const CAROUSEL_EXPORT_LIMITS = Object.freeze({
  maxSlideCount: 20,
  maxArtifactCount: 21,
  maxBytesPerArtifact: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  allowedMimeTypes: Object.freeze(['image/png', 'application/zip']),
  maxWarnings: 20,
});

function carouselSlideLogicalName(slideNumber) {
  return `slide-${String(slideNumber).padStart(2, '0')}.png`;
}

function sequentialCarouselSlideNumbers(count) {
  const size = Number(count);
  if (!Number.isInteger(size) || size < 1 || size > CAROUSEL_EXPORT_LIMITS.maxSlideCount) {
    return [];
  }
  return Array.from({ length: size }, (_, index) => index + 1);
}

function normalizeCarouselSlideNumbers(value, { maxIndex = CAROUSEL_EXPORT_LIMITS.maxSlideCount } = {}) {
  if (!Array.isArray(value) || !value.length || value.length > CAROUSEL_EXPORT_LIMITS.maxSlideCount) {
    return [];
  }
  const numbers = [...new Set(value.map((entry) => Number(entry)))].sort((left, right) => left - right);
  if (numbers.some((slideNumber) => !Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > maxIndex)) {
    return [];
  }
  return numbers;
}

function resolveCarouselExportSlideNumbers(options, deckSlideCount) {
  const selected = normalizeCarouselSlideNumbers(options?.slideNumbers, { maxIndex: deckSlideCount });
  if (Array.isArray(options?.slideNumbers) && options.slideNumbers.length) {
    return selected;
  }
  return sequentialCarouselSlideNumbers(deckSlideCount);
}

function carouselExportArtifactPlan(slideNumbersOrCount) {
  const numbers = Array.isArray(slideNumbersOrCount)
    ? normalizeCarouselSlideNumbers(slideNumbersOrCount)
    : sequentialCarouselSlideNumbers(slideNumbersOrCount);
  if (!numbers.length) return [];
  const artifacts = numbers.map((slideNumber) => ({
    logicalName: carouselSlideLogicalName(slideNumber),
    mimeType: 'image/png',
    slideNumber,
  }));
  if (numbers.length > 1) {
    artifacts.push({
      logicalName: 'carousel.zip',
      mimeType: 'application/zip',
      slideNumber: null,
    });
  }
  return artifacts;
}

const EXECUTION_OUTCOMES = Object.freeze(['completed', 'failed', 'cancelled']);

const PREVIEW_ACTIONS = Object.freeze([
  'create',
  'update',
  'unchanged',
  'conflict',
  'rejected',
  'stale',
]);

/** Keys that must never appear in importable execution results. */
const FORBIDDEN_IMPORTABLE_KEYS = Object.freeze([
  'command',
  'module',
  'filesystemPath',
  'callbackUrl',
  'callback',
  'credential',
  'credentials',
  'password',
  'apiKey',
  'secret',
  'token',
  'query',
  'sql',
  'logs',
  'memory',
  'mutex',
  'internalRunId',
  'vendorRunId',
  'relayJobId',
  'mongoConnectionString',
  'diagnostics',
  'steps',
]);

const ABSOLUTE_PATH_PATTERN = /(?:^|[\s'"`])(?:\/(?:Users|home|private|tmp|var\/folders)\/|[A-Za-z]:\\)/;
const CREDENTIAL_VALUE_PATTERN = /(?:api[_-]?key|secret|password|token|bearer)\s*[:=]/i;

const SCHEMAS = Object.freeze({
  jobRequest: loadSchema('job-request.v1.schema.json'),
  contextSnapshot: loadSchema('context-snapshot.v1.schema.json'),
  executionResult: loadSchema('execution-result.v1.schema.json'),
  diagnosticExport: loadSchema('diagnostic-export.v1.schema.json'),
  workerCapability: loadSchema('worker-capability.v1.schema.json'),
  resultPreview: loadSchema('result-preview.v1.schema.json'),
});

const FIXTURES_DIR = path.join(__dirname, '../contracts/pivot-admin-compute/fixtures');

function loadSchema(filename) {
  const raw = fs.readFileSync(
    path.join(__dirname, '../contracts/pivot-admin-compute', filename),
    'utf8',
  );
  return JSON.parse(raw);
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce((value, segment) => value[segment], root);
}

function matchesSchema(value, node, root = node) {
  if (!node || typeof node !== 'object') return true;
  if (node.$ref) return matchesSchema(value, resolveRef(root, node.$ref), root);
  if (node.allOf) {
    return node.allOf.every((candidate) => matchesSchema(value, candidate, root));
  }
  if (node.oneOf) {
    return node.oneOf.filter((candidate) => matchesSchema(value, candidate, root)).length === 1;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'const') && value !== node.const) return false;
  if (node.enum && !node.enum.includes(value)) return false;

  if (node.type === 'null') return value === null;
  if (node.type === 'boolean') return typeof value === 'boolean';
  if (node.type === 'integer') {
    if (!Number.isInteger(value)) return false;
    if (node.minimum != null && value < node.minimum) return false;
    if (node.maximum != null && value > node.maximum) return false;
    return true;
  }
  if (node.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (node.minItems != null && value.length < node.minItems) return false;
    if (node.maxItems != null && value.length > node.maxItems) return false;
    if (node.items) return value.every((item) => matchesSchema(item, node.items, root));
    return true;
  }
  if (node.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if ((node.required || []).some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
      return false;
    }
    if (node.additionalProperties === false && keys.some((key) => !node.properties?.[key])) {
      return false;
    }
    return keys.every((key) => !node.properties?.[key] || matchesSchema(value[key], node.properties[key], root));
  }
  if (node.type === 'string') {
    if (typeof value !== 'string') return false;
    if (node.minLength != null && value.length < node.minLength) return false;
    if (node.maxLength != null && value.length > node.maxLength) return false;
    if (node.pattern && !new RegExp(node.pattern).test(value)) return false;
    if (node.format === 'date-time' && Number.isNaN(Date.parse(value))) return false;
    if (node.format === 'uri') {
      try {
        new URL(value);
      } catch {
        return false;
      }
    }
  }
  return true;
}

const MAX_SCHEMA_ERRORS = 25;

function schemaTypeLabel(node) {
  if (node?.oneOf) return 'one allowed shape';
  if (node?.enum) return `one of ${node.enum.map((entry) => JSON.stringify(entry)).join(', ')}`;
  if (Object.prototype.hasOwnProperty.call(node || {}, 'const')) return JSON.stringify(node.const);
  return node?.type || 'the required shape';
}

function discriminatorMatch(candidate, value, root) {
  const resolved = candidate?.$ref ? resolveRef(root, candidate.$ref) : candidate;
  const nodes = resolved?.allOf || [resolved];
  for (const node of nodes) {
    const materialized = node?.$ref ? resolveRef(root, node.$ref) : node;
    const kind = materialized?.properties?.kind;
    if (kind?.const !== undefined) return kind.const === value?.kind;
    if (kind?.enum) return kind.enum.includes(value?.kind);
  }
  return false;
}

function collectSchemaErrors(value, node, root = node, trail = '$', found = []) {
  if (found.length >= MAX_SCHEMA_ERRORS || !node || typeof node !== 'object') return found;
  if (node.$ref) return collectSchemaErrors(value, resolveRef(root, node.$ref), root, trail, found);
  if (node.allOf) {
    node.allOf.forEach((candidate) => collectSchemaErrors(value, candidate, root, trail, found));
    return found;
  }
  if (node.oneOf) {
    const matches = node.oneOf.filter((candidate) => matchesSchema(value, candidate, root));
    if (matches.length === 1) return found;
    const discriminated = value && typeof value === 'object'
      ? node.oneOf.find((candidate) => discriminatorMatch(candidate, value, root))
      : null;
    if (discriminated) return collectSchemaErrors(value, discriminated, root, trail, found);
    found.push(`${trail}: expected ${schemaTypeLabel(node)}`);
    return found;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'const') && value !== node.const) {
    found.push(`${trail}: expected ${JSON.stringify(node.const)}`);
    return found;
  }
  if (node.enum && !node.enum.includes(value)) {
    found.push(`${trail}: expected ${schemaTypeLabel(node)}`);
    return found;
  }
  if (node.type === 'null') {
    if (value !== null) found.push(`${trail}: expected null`);
    return found;
  }
  if (node.type === 'boolean') {
    if (typeof value !== 'boolean') found.push(`${trail}: expected boolean`);
    return found;
  }
  if (node.type === 'integer') {
    if (!Number.isInteger(value)) found.push(`${trail}: expected integer`);
    else if (node.minimum != null && value < node.minimum) found.push(`${trail}: must be at least ${node.minimum}`);
    else if (node.maximum != null && value > node.maximum) found.push(`${trail}: must be at most ${node.maximum}`);
    return found;
  }
  if (node.type === 'array') {
    if (!Array.isArray(value)) {
      found.push(`${trail}: expected array`);
      return found;
    }
    if (node.minItems != null && value.length < node.minItems) found.push(`${trail}: requires at least ${node.minItems} items`);
    if (node.maxItems != null && value.length > node.maxItems) found.push(`${trail}: allows at most ${node.maxItems} items`);
    if (node.items) value.forEach((item, index) => collectSchemaErrors(item, node.items, root, `${trail}[${index}]`, found));
    return found;
  }
  if (node.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      found.push(`${trail}: expected object`);
      return found;
    }
    const keys = Object.keys(value);
    for (const key of node.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) found.push(`${trail}.${key}: required`);
    }
    if (node.additionalProperties === false) {
      for (const key of keys) {
        if (!node.properties?.[key]) found.push(`${trail}.${key}: unknown field`);
      }
    }
    for (const key of keys) {
      if (node.properties?.[key]) collectSchemaErrors(value[key], node.properties[key], root, `${trail}.${key}`, found);
    }
    return found;
  }
  if (node.type === 'string') {
    if (typeof value !== 'string') {
      found.push(`${trail}: expected string`);
      return found;
    }
    if (node.minLength != null && value.length < node.minLength) found.push(`${trail}: must contain at least ${node.minLength} characters`);
    if (node.maxLength != null && value.length > node.maxLength) found.push(`${trail}: exceeds ${node.maxLength} characters`);
    if (node.pattern && !new RegExp(node.pattern).test(value)) found.push(`${trail}: invalid format`);
    if (node.format === 'date-time' && Number.isNaN(Date.parse(value))) found.push(`${trail}: invalid date-time`);
    if (node.format === 'uri') {
      try {
        new URL(value);
      } catch {
        found.push(`${trail}: invalid URI`);
      }
    }
  }
  return found;
}

function collectForbiddenImportableViolations(value, trail = 'root', found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenImportableViolations(item, `${trail}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = String(key).toLowerCase();
    if (FORBIDDEN_IMPORTABLE_KEYS.some((forbidden) => forbidden.toLowerCase() === normalized)) {
      found.push(`${trail}.${key}`);
    }
    if (typeof child === 'string') {
      if (ABSOLUTE_PATH_PATTERN.test(child)) found.push(`${trail}.${key}:absolute-path`);
      if (CREDENTIAL_VALUE_PATTERN.test(child)) found.push(`${trail}.${key}:credential-like-value`);
    }
    collectForbiddenImportableViolations(child, `${trail}.${key}`, found);
  }
  return found;
}

function validateWithSchema(schema, value, { importable = false } = {}) {
  const errors = [];
  if (!matchesSchema(value, schema)) {
    errors.push(...collectSchemaErrors(value, schema));
    if (!errors.length) errors.push('schema mismatch');
  }
  if (importable) {
    const forbidden = collectForbiddenImportableViolations(value);
    if (forbidden.length) {
      errors.push(`forbidden importable fields: ${forbidden.join(', ')}`);
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true };
}

function validateJobRequest(value) {
  return validateWithSchema(SCHEMAS.jobRequest, value);
}

function validateContextSnapshot(value) {
  return validateWithSchema(SCHEMAS.contextSnapshot, value);
}

function validateExecutionResult(value) {
  const validation = validateWithSchema(SCHEMAS.executionResult, value, { importable: true });
  if (!validation.valid || value?.kind !== 'carousel-export') return validation;

  const errors = [];
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts : [];
  const totalBytes = artifacts.reduce((sum, artifact) => sum + (Number(artifact?.byteCount) || 0), 0);
  if (totalBytes > CAROUSEL_EXPORT_LIMITS.maxTotalBytes) {
    errors.push(`$.artifacts: total byte count exceeds ${CAROUSEL_EXPORT_LIMITS.maxTotalBytes}`);
  }
  const pngs = artifacts.filter((artifact) => artifact?.mimeType === 'image/png');
  const zips = artifacts.filter((artifact) => artifact?.mimeType === 'application/zip');
  const slideNumbers = pngs.map((artifact) => artifact.slideNumber);
  if (new Set(slideNumbers).size !== slideNumbers.length) {
    errors.push('$.artifacts: PNG slide numbers must be unique');
  }
  if (slideNumbers.some((slideNumber) => (
    slideNumber < 1 || slideNumber > CAROUSEL_EXPORT_LIMITS.maxSlideCount
  ))) {
    errors.push('$.artifacts: PNG slide number is outside the export limits');
  }
  if (value.outcome === 'completed') {
    if (pngs.length !== value.slideCount) {
      errors.push('$.artifacts: completed exports require exactly one PNG per slide');
    }
    if (pngs.length > 1 && zips.length !== 1) {
      errors.push('$.artifacts: completed exports require exactly one ZIP');
    }
    if (pngs.length <= 1 && zips.length !== 0) {
      errors.push('$.artifacts: a single-slide export must not include a ZIP');
    }
  }
  return errors.length ? { valid: false, errors } : validation;
}

/**
 * Central repair hook for worker-quarantined results. Keep this deliberately
 * side-effect free: a future contract migration may normalize a cloned value
 * here before validation without repeating provider calls.
 */
function prepareExecutionResultForRepair(value) {
  const result = value == null ? value : JSON.parse(JSON.stringify(value));
  const validation = validateExecutionResult(result);
  return validation.valid
    ? { valid: true, result }
    : { valid: false, result, errors: validation.errors };
}

function validateDiagnosticExport(value) {
  return validateWithSchema(SCHEMAS.diagnosticExport, value);
}

function validateWorkerCapability(value) {
  return validateWithSchema(SCHEMAS.workerCapability, value);
}

function validateResultPreview(value) {
  return validateWithSchema(SCHEMAS.resultPreview, value);
}

function loadFixture(name) {
  const target = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function listFixtures() {
  return fs.readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.json')).sort();
}

function isStaleContextPreview(preview, currentContextVersion) {
  return preview?.basedOnContextVersion !== currentContextVersion;
}

module.exports = {
  CONTRACT_VERSION,
  COMPUTE_JOB_KINDS,
  EXECUTION_OUTCOMES,
  PREVIEW_ACTIONS,
  CAROUSEL_EXPORT_LIMITS,
  carouselSlideLogicalName,
  sequentialCarouselSlideNumbers,
  normalizeCarouselSlideNumbers,
  resolveCarouselExportSlideNumbers,
  carouselExportArtifactPlan,
  FORBIDDEN_IMPORTABLE_KEYS,
  SCHEMAS,
  FIXTURES_DIR,
  matchesSchema,
  collectSchemaErrors,
  collectForbiddenImportableViolations,
  validateJobRequest,
  validateContextSnapshot,
  validateExecutionResult,
  prepareExecutionResultForRepair,
  validateDiagnosticExport,
  validateWorkerCapability,
  validateResultPreview,
  loadFixture,
  listFixtures,
  isStaleContextPreview,
};
