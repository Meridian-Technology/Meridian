import React, { useCallback, useEffect, useState } from 'react';
import Popup from '../../../../components/Popup/Popup';
import TenantLifecycleModalContent from '../TenantLifecycleModal/TenantLifecycleModalContent';
import TenantMetadataModalContent from '../TenantMetadataModal/TenantMetadataModalContent';

const DISPLAY_CLEAR_MS = 320;

/**
 * Single portaled Popup for tenant lifecycle + metadata dialogs (avoids stacked overlays).
 */
function TenantModals({
  tenant,
  lifecycleRequest,
  metadataOpen,
  savingVisibility,
  savingMetadata,
  onClose,
  onSaveVisibility,
  onSaveMetadata,
}) {
  const isOpen = Boolean(tenant && (lifecycleRequest || metadataOpen));
  const [displayMode, setDisplayMode] = useState(null);
  const [lifecycleSession, setLifecycleSession] = useState(null);

  useEffect(() => {
    if (lifecycleRequest && tenant) {
      setDisplayMode('lifecycle');
      setLifecycleSession({
        mode: lifecycleRequest.mode || 'status',
        targetStatus: lifecycleRequest.targetStatus ?? tenant.status ?? 'coming_soon',
        initialMessage: lifecycleRequest.initialMessage ?? tenant.statusMessage ?? '',
      });
      return;
    }
    if (metadataOpen && tenant) {
      setDisplayMode('metadata');
      return;
    }
    if (!isOpen) {
      const timer = setTimeout(() => {
        setDisplayMode(null);
        setLifecycleSession(null);
      }, DISPLAY_CLEAR_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [lifecycleRequest, metadataOpen, tenant, isOpen]);

  const shellClassName =
    displayMode === 'lifecycle'
      ? 'tenant-lifecycle-modal__shell'
      : displayMode === 'metadata'
        ? 'tenant-metadata-modal__shell'
        : '';

  const handleLifecycleConfirm = useCallback(
    async (payload) => {
      try {
        const ok = await onSaveVisibility(tenant.tenantKey, payload);
        return ok !== false;
      } catch (_) {
        return false;
      }
    },
    [onSaveVisibility, tenant]
  );

  const handleMetadataSave = useCallback(
    async (payload) => {
      try {
        return await onSaveMetadata(tenant.tenantKey, payload);
      } catch (_) {
        return false;
      }
    },
    [onSaveMetadata, tenant]
  );

  if (!tenant) {
    return <Popup isOpen={false} onClose={onClose} />;
  }

  return (
    <Popup isOpen={isOpen} onClose={onClose} customClassName={shellClassName}>
      {displayMode === 'lifecycle' && lifecycleSession ? (
        <TenantLifecycleModalContent
          session={lifecycleSession}
          tenant={tenant}
          saving={savingVisibility}
          onConfirm={handleLifecycleConfirm}
        />
      ) : null}
      {displayMode === 'metadata' ? (
        <TenantMetadataModalContent
          tenant={tenant}
          saving={savingMetadata}
          onSave={handleMetadataSave}
        />
      ) : null}
    </Popup>
  );
}

export default TenantModals;
