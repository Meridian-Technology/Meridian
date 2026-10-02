const { getMergedTenants, getTenantByKey } = require('./tenantConfigService');
const { enqueueMeridianJob } = require('./meridianJobEnqueueService');
const { isFleetMeridianJobHandler } = require('./meridianJobRegistry');
const { getMeridianOpsTenantKey } = require('./meridianOpsNotifyService');
const { connectToGlobalDatabase } = require('../connectionsManager');
const {
  definitionAdminError,
  getMeridianNotificationDefinition,
  buildCityRunPayload,
  scheduleTargets,
} = require('./meridianNotificationDefinitionService');
const { previewNotificationEligibility } = require('./meridianNotificationEligibilityService');
const { discoveryDayBucket } = require('./meridianJobHandlers/eventDiscoveryEnqueue');

const NO_QUIET_HOURS = Object.freeze({ startHour: 0, endHour: 0 });

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function normalizeCities(cities) {
  if (!Array.isArray(cities)) return [];
  const seen = new Set();
  return cities.flatMap((row) => {
    const tenantKey = String(row?.tenantKey || '').trim().toLowerCase();
    const fingerprint = String(row?.fingerprint || '').trim();
    if (!tenantKey || seen.has(tenantKey)) return [];
    seen.add(tenantKey);
    return [{ tenantKey, fingerprint }];
  });
}

function runSummary(tenantKey, result) {
  return {
    tenantKey,
    created: result.created,
    runId: result.run?._id ? String(result.run._id) : null,
    runKey: result.run?.runKey || null,
    status: result.run?.status || null,
  };
}

/**
 * Re-checks every city's recipients against what the sender reviewed, then
 * queues one live run per city. Nothing is queued if any list changed.
 */
async function sendMeridianNotificationNow(req, idOrKey, {
  cities = [],
  fingerprint: fleetFingerprint = '',
  ignoreQuietHours = false,
  triggeredBy = null,
  now = new Date(),
} = {}) {
  const jobReq = await resolveJobReq(req);
  const definition = await getMeridianNotificationDefinition(jobReq, idOrKey);
  const requested = normalizeCities(cities);
  const fleet = isFleetMeridianJobHandler(definition.handlerKey);
  const stamp = `now-${now.toISOString()}`;

  if (fleet) {
    const fingerprint = String(fleetFingerprint || '').trim();
    const preview = await previewNotificationEligibility(jobReq, {
      handlerKey: definition.handlerKey,
      definitionKey: definition.definitionKey,
    });
    if (!fingerprint || preview.fingerprint !== fingerprint) {
      throw recipientsChanged([{ tenantKey: null, preview }]);
    }
    const tenantKey = getMeridianOpsTenantKey();
    const result = await enqueueMeridianJob(jobReq, {
      handlerKey: definition.handlerKey,
      tenantKey,
      scheduledFor: now,
      payload: {
        definitionKey: definition.definitionKey,
        timeBucket: stamp,
        sendNow: true,
        triggeredBy,
      },
    });
    return { definitionKey: definition.definitionKey, runs: [runSummary(tenantKey, result)] };
  }

  if (!requested.length) {
    throw definitionAdminError('Pick at least one city', 'SEND_NOW_CITIES_REQUIRED');
  }
  const allowed = new Set(
    scheduleTargets(definition, await getMergedTenants(jobReq)).map((tenant) => tenant.tenantKey),
  );
  const outside = requested.filter((row) => !allowed.has(row.tenantKey));
  if (outside.length) {
    throw definitionAdminError(
      `This schedule doesn't send in ${outside.map((row) => row.tenantKey).join(', ')}`,
      'SEND_NOW_CITY_NOT_ALLOWED',
    );
  }

  const changed = [];
  for (const row of requested) {
    const preview = await previewNotificationEligibility(jobReq, {
      handlerKey: definition.handlerKey,
      tenantKey: row.tenantKey,
      definitionKey: definition.definitionKey,
    });
    if (!row.fingerprint || preview.fingerprint !== row.fingerprint) {
      changed.push({ tenantKey: row.tenantKey, preview });
    }
  }
  if (changed.length) throw recipientsChanged(changed);

  const runs = [];
  for (const row of requested) {
    const tenant = await getTenantByKey(jobReq, row.tenantKey);
    const merged = await getMeridianNotificationDefinition(jobReq, definition.id, {
      tenantKey: row.tenantKey,
    });
    const payload = {
      ...buildCityRunPayload(merged, tenant, now),
      timeBucket: stamp,
      sendNow: true,
      dryRun: false,
      triggeredBy,
    };
    if (ignoreQuietHours) {
      payload.triggerConfig = { ...payload.triggerConfig, quietHours: { ...NO_QUIET_HOURS } };
    }
    if (definition.handlerKey === 'weekly_drop') payload.force = true;
    if (definition.handlerKey === 'event_discovery') {
      payload.dayBucket = discoveryDayBucket(now, payload.timezone);
    }
    const result = await enqueueMeridianJob(jobReq, {
      handlerKey: definition.handlerKey,
      tenantKey: row.tenantKey,
      scheduledFor: now,
      payload,
    });
    runs.push(runSummary(row.tenantKey, result));
  }
  return { definitionKey: definition.definitionKey, runs };
}

function recipientsChanged(changed) {
  const error = definitionAdminError(
    'Who would get this changed since you reviewed it. Review the new list before sending.',
    'RECIPIENTS_CHANGED',
    409,
  );
  error.details = {
    cities: changed.map(({ tenantKey, preview }) => ({ tenantKey, ...preview })),
  };
  return error;
}

module.exports = {
  sendMeridianNotificationNow,
};
