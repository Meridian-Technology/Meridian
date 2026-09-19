const mongoose = require('mongoose');
const pivotComputeJobSchema = require('../../schemas/pivotComputeJob');

const {
  MAX_APPLICATION_AUDIT_BUCKETS,
  MAX_APPLICATION_AUDIT_ROWS,
  MAX_APPLICATION_AUDIT_MANIFEST_BYTES,
  MAX_NOTIFICATION_EMAILS,
} = pivotComputeJobSchema;

const PivotComputeJob = mongoose.models.PivotComputeJobSchemaTest
  || mongoose.model('PivotComputeJobSchemaTest', pivotComputeJobSchema);

function baseJob(overrides = {}) {
  return {
    externalJobId: 'job-manifest-test',
    tenantKey: 'nyc',
    cityKey: 'nyc',
    kind: 'city-curation-refresh',
    contextVersion: 'context-v1',
    origin: { type: 'admin' },
    createIdempotencyKey: 'create-manifest-test',
    requestedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PivotComputeJob schema applicationAudit', () => {
  it('retains the bounded apply-manifest fields and their defaults', async () => {
    const generatedAt = new Date('2026-01-02T00:00:00.000Z');
    const job = new PivotComputeJob(baseJob({
      applicationAudit: {
        outcome: 'completed',
        buckets: [{
          entityType: 'event',
          disposition: 'created',
          ingestStatus: 'published',
          batchWeek: '2026-W01',
          count: 2,
        }],
        rows: [{
          entityType: 'event',
          disposition: 'created',
          eventId: 'event-1',
          name: 'A show',
          sourceUrl: 'https://example.test/events/1',
          batchWeek: '2026-W01',
          ingestStatus: 'published',
          curationJobId: 'curation-1',
          curationJobLabel: 'Weekly refresh',
          message: 'Published',
        }],
        manifestGeneratedAt: generatedAt,
      },
    }));

    await expect(job.validate()).resolves.toBeUndefined();
    expect(job.applicationAudit.rowOverflowCount).toBe(0);
    expect(job.applicationAudit.manifestGeneratedAt).toEqual(generatedAt);
    expect(job.applicationAudit.buckets[0].toObject()).toMatchObject({
      entityType: 'event', disposition: 'created', ingestStatus: 'published', batchWeek: '2026-W01', count: 2,
    });
    expect(job.applicationAudit.rows[0].toObject()).toMatchObject({
      entityType: 'event', disposition: 'created', eventId: 'event-1', name: 'A show',
      sourceUrl: 'https://example.test/events/1', batchWeek: '2026-W01', ingestStatus: 'published',
      curationJobId: 'curation-1', curationJobLabel: 'Weekly refresh', message: 'Published',
    });
  });

  it('rejects manifests exceeding bucket, row, or byte limits', async () => {
    const oversizedBuckets = new PivotComputeJob(baseJob({
      applicationAudit: { buckets: Array.from({ length: MAX_APPLICATION_AUDIT_BUCKETS + 1 }, () => ({ entityType: 'event', disposition: 'created', count: 1 })) },
    }));
    await expect(oversizedBuckets.validate()).rejects.toThrow(/application audit buckets exceed/);

    const oversizedRows = new PivotComputeJob(baseJob({
      applicationAudit: { rows: Array.from({ length: MAX_APPLICATION_AUDIT_ROWS + 1 }, () => ({ entityType: 'event', disposition: 'created' })) },
    }));
    await expect(oversizedRows.validate()).rejects.toThrow(/application audit rows exceed/);

    const oversizedManifest = new PivotComputeJob(baseJob({
      applicationAudit: { rows: [{ entityType: 'event', disposition: 'created', message: 'x'.repeat(MAX_APPLICATION_AUDIT_MANIFEST_BYTES) }] },
    }));
    await expect(oversizedManifest.validate()).rejects.toThrow(/application audit manifest exceeds/);
  });
});

describe('PivotComputeJob schema notifications', () => {
  it('retains bounded admin-email notification audit entries', async () => {
    const sentAt = new Date('2026-01-02T00:00:00.000Z');
    const job = new PivotComputeJob(baseJob({
      notifications: {
        email: [{ type: 'apply-complete', sentAt, recipientCount: 3 }],
      },
    }));

    await expect(job.validate()).resolves.toBeUndefined();
    expect(job.notifications.email[0].toObject()).toMatchObject({
      type: 'apply-complete', sentAt, recipientCount: 3,
    });
  });

  it('rejects notification audit entries beyond the cap', async () => {
    const job = new PivotComputeJob(baseJob({
      notifications: {
        email: Array.from(
          { length: MAX_NOTIFICATION_EMAILS + 1 },
          () => ({ type: 'review-required', sentAt: new Date(), recipientCount: 1 }),
        ),
      },
    }));

    await expect(job.validate()).rejects.toThrow(/notification emails exceed/);
  });
});
