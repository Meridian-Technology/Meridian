import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import { canCancelComputeJob, canRetryComputeJob } from '../pivotComputeJobActions';
import {
  artifactsExpired,
  buildCarouselExportJobRequest,
  CAROUSEL_EXPORT_KIND,
  deckRevisionIso,
  deriveExportUiState,
  exportFailureLabel,
  formatExportProgress,
  isCarouselExportUiEnabled,
  isExportActive,
  isRevisionStale,
  pickDeckExportJob,
  readExportSession,
  startBrowserDownload,
  writeExportSession,
} from './pivotCarouselExport';

const POLL_MS = 2500;

function mergeJob(current, next) {
  if (!next?.externalJobId) return current;
  if (!current || current.externalJobId === next.externalJobId) {
    return current ? { ...current, ...next } : next;
  }
  return next;
}

export default function useCarouselExport({ tenantKey, deck, dirty }) {
  const { addNotification } = useNotification();
  const [job, setJob] = useState(null);
  const [wake, setWake] = useState(null);
  const [creating, setCreating] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const creatingRef = useRef(false);
  const createKeyRef = useRef(null);
  const jobRef = useRef(null);

  const deckId = deck?._id || null;
  const currentRevision = deckRevisionIso(deck);
  const uiEnabled = isCarouselExportUiEnabled(tenantKey);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  useEffect(() => {
    setJob(null);
    jobRef.current = null;
    setWake(null);
    setPanelOpen(false);
    createKeyRef.current = null;
  }, [tenantKey, deckId]);

  useEffect(() => {
    if (!tenantKey || !deckId) return undefined;
    let cancelled = false;

    (async () => {
      const session = readExportSession(tenantKey, deckId);
      createKeyRef.current = session?.createKey || null;
      const listed = await authenticatedRequest('/admin/pivot/compute-jobs', {
        params: { cityKey: tenantKey, kind: CAROUSEL_EXPORT_KIND, limit: 20 },
      });
      if (cancelled) return;

      let next = pickDeckExportJob(listed.data?.jobs, deckId, session?.jobId);
      if (session?.jobId && next?.externalJobId !== session.jobId) {
        const detail = await authenticatedRequest(
          `/admin/pivot/compute-jobs/${encodeURIComponent(session.jobId)}`,
        );
        if (cancelled) return;
        if (detail.data?.job?.options?.deckId === deckId) {
          next = detail.data.job;
        }
      }
      if (!next) return;
      jobRef.current = next;
      setJob(next);
      if (session?.panelOpen || isExportActive(next)) setPanelOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantKey, deckId]);

  useEffect(() => {
    if (!tenantKey || !deckId) return;
    writeExportSession(tenantKey, deckId, {
      jobId: job?.externalJobId || null,
      panelOpen,
      createKey: isExportActive(job) ? createKeyRef.current : null,
    });
  }, [tenantKey, deckId, job, panelOpen]);

  useEffect(() => {
    if (!job?.externalJobId || !isExportActive(job)) return undefined;
    let cancelled = false;
    const tick = async () => {
      const { data } = await authenticatedRequest(
        `/admin/pivot/compute-jobs/${encodeURIComponent(job.externalJobId)}`,
      );
      if (cancelled || !data?.job) return;
      setJob((current) => mergeJob(current, data.job));
    };
    const timer = setInterval(tick, POLL_MS);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.externalJobId, job?.status]);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const startExport = useCallback(async (slideNumbers) => {
    if (!uiEnabled || !tenantKey || !deckId || !currentRevision) return;
    if (dirty) {
      addNotification({
        title: 'Save the deck first',
        message: 'Export renders the stored revision, not the draft on screen.',
        type: 'error',
      });
      return;
    }
    if (creatingRef.current) return;
    const currentJob = jobRef.current || job;
    if (isExportActive(currentJob) && currentJob.options?.deckId === deckId) {
      setPanelOpen(true);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setPanelOpen(true);
    const reuseKey = !currentJob || isExportActive(currentJob) ? createKeyRef.current : null;
    const selection = Array.isArray(slideNumbers) && slideNumbers.length
      ? [...slideNumbers].sort((left, right) => left - right).join('.')
      : 'all';
    const idempotencyKey = reuseKey || `idem:carousel-${tenantKey}-${deckId}-${selection}-${Date.now()}`;
    createKeyRef.current = idempotencyKey;
    writeExportSession(tenantKey, deckId, {
      jobId: currentJob?.externalJobId || null,
      panelOpen: true,
      createKey: idempotencyKey,
    });

    const request = buildCarouselExportJobRequest({
      tenantKey,
      deckId,
      deckRevision: currentRevision,
      idempotencyKey,
      slideNumbers,
      slideCount: Array.isArray(deck?.slides) ? deck.slides.length : undefined,
    });
    const { data, error } = await authenticatedRequest('/admin/pivot/compute-jobs', {
      method: 'POST',
      data: { request },
    });

    creatingRef.current = false;
    setCreating(false);
    if (error || !data?.job) {
      addNotification({
        title: 'Could not start the export',
        message: error || 'The request failed.',
        type: 'error',
      });
      return;
    }

    jobRef.current = data.job;
    setJob(data.job);
    setWake(data.wake || null);
    if (!isExportActive(data.job)) createKeyRef.current = null;
  }, [uiEnabled, tenantKey, deckId, currentRevision, dirty, job, deck?.slides, addNotification]);

  const cancelExport = useCallback(async () => {
    if (!job?.externalJobId || !canCancelComputeJob(job)) return;
    setBusy('cancel');
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(job.externalJobId)}/cancel`,
      { method: 'POST', data: {} },
    );
    setBusy(null);
    if (error) {
      addNotification({ title: 'Could not cancel the export', message: error, type: 'error' });
      return;
    }
    setJob((current) => mergeJob(current, data?.job));
    createKeyRef.current = null;
  }, [job, addNotification]);

  const retryExport = useCallback(async () => {
    if (canRetryComputeJob(job) && job?.externalJobId) {
      setBusy('retry');
      const { data, error } = await authenticatedRequest(
        `/admin/pivot/compute-jobs/${encodeURIComponent(job.externalJobId)}/retry`,
        { method: 'POST', data: { contextVersion: job.contextVersion || undefined } },
      );
      setBusy(null);
      if (error) {
        addNotification({ title: 'Could not retry the export', message: error, type: 'error' });
        return;
      }
      setJob((current) => mergeJob(current, data?.job));
      setWake(data?.wake || null);
      setPanelOpen(true);
      return;
    }
    createKeyRef.current = null;
    await startExport(job?.options?.slideNumbers);
  }, [job, startExport, addNotification]);

  const downloadArtifact = useCallback(async (artifact) => {
    if (!job?.externalJobId || !artifact?.artifactId) return;
    setBusy(artifact.artifactId);
    const { data, error } = await authenticatedRequest(
      `/admin/pivot/compute-jobs/${encodeURIComponent(job.externalJobId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`,
      { params: { tenantKey } },
    );
    setBusy(null);
    if (error || !data?.downloadUrl) {
      addNotification({
        title: 'Could not download the file',
        message: error || 'The download request failed.',
        type: 'error',
      });
      return;
    }
    startBrowserDownload(data.downloadUrl, data.filename || artifact.logicalName);
  }, [job, tenantKey, addNotification]);

  const uiState = deriveExportUiState({ creating, job, wake });

  return {
    job,
    wake,
    creating,
    panelOpen,
    busy,
    uiState,
    progressLabel: formatExportProgress(job, uiState),
    failureLabel: uiState === 'failed' ? exportFailureLabel(job) : null,
    revisionStale: isRevisionStale(job, currentRevision),
    artifactsExpired: artifactsExpired(job),
    currentRevision,
    uiEnabled,
    startExport,
    openPanel,
    closePanel,
    cancelExport,
    retryExport,
    downloadArtifact,
  };
}
