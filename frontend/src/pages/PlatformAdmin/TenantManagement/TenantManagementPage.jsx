import React, { useCallback, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { setTenantConfigCache } from '../../../config/tenantRedirect';
import { useNotification } from '../../../NotificationContext';
import TenantModals from './TenantModals/TenantModals';
import TenantStatusDropdown from './TenantStatusDropdown/TenantStatusDropdown';
import { formatTenantHealthMessage, isTenantHealthOk } from './tenantHealthUtils';
import { isPivotTenant } from './tenantPivotUtils';
import PivotReferralCodesPanel from './PivotReferralCodesPanel/PivotReferralCodesPanel';
import PivotTagCatalogPanel from './PivotTagCatalogPanel/PivotTagCatalogPanel';
import { useGradient } from '../../../hooks/useGradient';
import './TenantManagementPage.scss';

const EMPTY_FORM = {
  tenantKey: '',
  name: '',
  subdomain: '',
  location: '',
  tenantType: 'pivot',
  mongoDatabaseName: '',
  mongoUri: '',
  status: 'coming_soon',
};

function StatusBadge({ status }) {
  return <span className={`linear-badge linear-badge--${status}`}>{status.replace(/_/g, ' ')}</span>;
}

function HealthDot({ health }) {
  if (!health) return <span className="linear-health linear-health--unknown" title="Unknown" />;
  if (isTenantHealthOk(health)) {
    return <span className="linear-health linear-health--ok" title={`DB OK · ${health.latencyMs}ms`} />;
  }
  return <span className="linear-health linear-health--error" title={health.error || 'DB error'} />;
}

function ManualStepsPanel({ tenant, onConfirmStep, savingStepId }) {
  if (!tenant?.manualSteps?.length) return null;
  const checklistId = `tenant-setup-${tenant.tenantKey}`;

  return (
    <section className="linear-section tenant-setup" aria-labelledby={checklistId}>
      <h3 id={checklistId} className="linear-section__title">Setup checklist</h3>
      <ul className="linear-checklist">
        {tenant.manualSteps.map((step) => (
          <li key={step.id} className={`linear-checklist__item ${step.completed ? 'is-done' : ''}`}>
            <div className="linear-checklist__row">
              <span className={`linear-checklist__icon ${step.completed ? 'is-done' : ''}`}>
                <Icon icon={step.completed ? 'mdi:check' : step.automated ? 'mdi:cog-outline' : 'mdi:circle-outline'} onClick={!step.completed? () => onConfirmStep(tenant, step.id) : null}/>
              </span>
              <div className="linear-checklist__body">
                <div className="linear-checklist__head">
                  <span className="linear-checklist__label">{step.title}</span>
                  <span className={`linear-tag ${step.automated ? 'linear-tag--auto' : 'linear-tag--manual'}`}>
                    {step.automated ? 'Automated' : 'Manual'}
                  </span>
                </div>
                <p className="linear-checklist__desc">{step.description}</p>
                {step.command ? <code className="linear-code">{step.command}</code> : null}
                {step.orgId ? <code className="linear-code">pivotCatalogOrgId: {step.orgId}</code> : null}
                {!step.automated && !step.completed ? (
                  <button
                    type="button"
                    className="linear-btn linear-btn--ghost linear-btn--sm"
                    disabled={savingStepId === step.id}
                    onClick={() => onConfirmStep(tenant, step.id)}
                  >
                    {savingStepId === step.id ? 'Saving…' : step.id === 'verify_picker' ? 'Confirm verified' : 'Mark complete'}
                  </button>
                ) : null}
                {step.id === 'verify_picker' && step.completed && step.requiresActiveStatus ? (
                  <p className="linear-checklist__note">Verified on picker — activate subdomain when ready to go live.</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateTenantForm({ form, creating, onChange, onSubmit, onCancel }) {
  return (
    <article className="tenant-detail tenant-detail--create">
      <header className="tenant-detail__header">
        <div className="tenant-detail__identity">
          <p className="tenant-detail__eyebrow">New tenant</p>
          <h2 className="tenant-detail__title">Create city</h2>
          <p className="tenant-detail__meta">Starts as <StatusBadge status="coming_soon" /> until you activate the subdomain.</p>
        </div>
        <button type="button" className="linear-btn linear-btn--ghost linear-btn--icon" onClick={onCancel} aria-label="Close">
          <Icon icon="mdi:close" />
        </button>
      </header>
      <form className="linear-form" onSubmit={onSubmit}>
        <section className="tenant-detail__section" aria-label="Tenant configuration">
          <div className="linear-form__grid">
            <label className="linear-field">
              <span className="linear-field__label">Tenant key</span>
              <input
                className="linear-input"
                value={form.tenantKey}
                onChange={(e) => onChange('tenantKey', e.target.value.toLowerCase())}
                placeholder="brooklyn"
                required
                pattern="[a-z][a-z0-9_-]{1,31}"
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Display name</span>
              <input
                className="linear-input"
                value={form.name}
                onChange={(e) => onChange('name', e.target.value)}
                placeholder="Brooklyn Pilot"
                required
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">City / location</span>
              <input
                className="linear-input"
                value={form.location}
                onChange={(e) => onChange('location', e.target.value)}
                placeholder="Brooklyn, NY"
                required
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Subdomain</span>
              <input
                className="linear-input"
                value={form.subdomain}
                onChange={(e) => onChange('subdomain', e.target.value.toLowerCase())}
                placeholder="brooklyn"
                required
              />
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Type</span>
              <select className="linear-input" value={form.tenantType} onChange={(e) => onChange('tenantType', e.target.value)}>
                <option value="pivot">Pivot city pilot</option>
                <option value="campus">Campus</option>
              </select>
            </label>
            <label className="linear-field">
              <span className="linear-field__label">Mongo database</span>
              <input
                className="linear-input"
                value={form.mongoDatabaseName}
                onChange={(e) => onChange('mongoDatabaseName', e.target.value.toLowerCase())}
                placeholder="brooklyn"
              />
            </label>
            <label className="linear-field linear-field--full">
              <span className="linear-field__label">Mongo URI (optional)</span>
              <input
                className="linear-input"
                value={form.mongoUri}
                onChange={(e) => onChange('mongoUri', e.target.value)}
                placeholder="Derived from DEFAULT_MONGO_URI when empty"
              />
            </label>
          </div>
          <p className="linear-form__hint">
            Stored in global TenantConfig. Legacy <code>MONGO_URI_RPI</code> / <code>MONGO_URI_TVCOG</code> env vars still take precedence.
          </p>
        </section>
        <div className="linear-form__actions">
          <button type="button" className="linear-btn linear-btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="linear-btn linear-btn--primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create tenant'}
          </button>
        </div>
      </form>
    </article>
  );
}

function TenantDetail({
  tenant,
  actionKey,
  onHealthCheck,
  onProvisionCatalog,
  onConfirmStep,
  onOpenLifecycle,
  onOpenMetadata,
  savingVisibility,
  savingMetadata,
  savingStepId,
}) {
  const savedStatus = tenant.status || 'coming_soon';

  const checklistComplete = tenant.provisioningComplete === true;
  const showActivateCta = checklistComplete && savedStatus !== 'active';
  const infraHeadingId = `tenant-infra-${tenant.tenantKey}`;

  const openStatusDialog = (nextStatus, mode = 'status') => {
    if (nextStatus === savedStatus && mode !== 'message') return;
    onOpenLifecycle({
      mode: mode === 'activate' ? 'activate' : 'status',
      targetStatus: nextStatus,
      initialMessage: tenant.statusMessage || '',
    });
  };

  const openMessageDialog = () => {
    onOpenLifecycle({
      mode: 'message',
      targetStatus: savedStatus,
      initialMessage: tenant.statusMessage || '',
    });
  };

  return (
    <article className="tenant-detail">
      <header className="tenant-detail__header">
        <div className="tenant-detail__identity">
          <p className="tenant-detail__eyebrow">{tenant.tenantKey}</p>
          <h2 className="tenant-detail__title">{tenant.name}</h2>
          <p className="tenant-detail__meta">
            <a href={tenant.subdomainUrl} target="_blank" rel="noopener noreferrer">{tenant.subdomainUrl}</a>
            {tenant.statusMessage ? (
              <span className="tenant-detail__message-preview" title="Status message">{tenant.statusMessage}</span>
            ) : null}
          </p>
        </div>

        <div className="tenant-detail__lifecycle" aria-label="Tenant visibility controls">
          <div className="tenant-detail__lifecycle-primary">
            <TenantStatusDropdown
              value={savedStatus}
              disabled={savingVisibility}
              onSelect={(next) => openStatusDialog(next)}
              actionElement={showActivateCta ? (
                <button
                  type="button"
                  className="linear-btn linear-btn--primary tenant-detail__activate"
                  disabled={savingVisibility}
                  onClick={() => openStatusDialog('active', 'activate')}
                >
                  <Icon icon="mdi:rocket-launch-outline" />
                  Activate
                </button>
              ) : null}
            />
            <button
              type="button"
              className="tenant-detail__message-btn linear-btn linear-btn--ghost linear-btn--icon"
              aria-label="Edit status message"
              title="Edit status message"
              disabled={savingVisibility}
              onClick={openMessageDialog}
            >
              <Icon icon="mdi:message-text-outline" />
            </button>
            <button
              type="button"
              className="tenant-detail__message-btn linear-btn linear-btn--ghost linear-btn--icon"
              aria-label="Edit tenant details"
              title="Edit tenant details"
              disabled={savingMetadata}
              onClick={onOpenMetadata}
            >
              <Icon icon="mdi:pencil-outline" />
            </button>
          </div>
          {/* {showActivateCta ? (
            <button
              type="button"
              className="linear-btn linear-btn--primary tenant-detail__activate"
              disabled={savingVisibility}
              onClick={() => openStatusDialog('active', 'activate')}
            >
              <Icon icon="mdi:rocket-launch-outline" />
              Activate subdomain
            </button>
          ) : null} */}
        </div>
      </header>

      <section className="tenant-detail__section tenant-detail__tags" aria-label="Tenant labels">
        {isPivotTenant(tenant) ? <span className="linear-tag linear-tag--pivot">Pivot pilot</span> : null}
        {!checklistComplete ? (
          <span className="tenant-detail__soft-tag">Setup in progress</span>
        ) : savedStatus !== 'active' ? (
          <span className="tenant-detail__soft-tag tenant-detail__soft-tag--ready">Ready to activate</span>
        ) : null}
      </section>

      <section className="tenant-detail__section" aria-labelledby={infraHeadingId}>
        <h3 id={infraHeadingId} className="linear-section__title">Infrastructure</h3>
        <div className="linear-detail__stats">
          <div className="linear-stat">
            <span className="linear-stat__label">Database</span>
          <span className={`linear-stat__value ${isTenantHealthOk(tenant.health) ? 'is-ok' : tenant.health ? 'is-error' : ''}`}>
            {tenant.health
              ? isTenantHealthOk(tenant.health)
                ? `Connected · ${tenant.health.latencyMs}ms`
                : tenant.health.error || 'Unreachable'
              : 'Not checked'}
          </span>
          </div>
          <div className="linear-stat">
            <span className="linear-stat__label">Location</span>
            <span className="linear-stat__value">{tenant.location || '—'}</span>
          </div>
          {tenant.pivotCatalogOrgId ? (
            <div className="linear-stat linear-stat--wide">
              <span className="linear-stat__label">Pivot Catalog org</span>
              <code className="linear-code linear-code--inline">{tenant.pivotCatalogOrgId}</code>
            </div>
          ) : null}
        </div>
        <div className="linear-detail__actions">
          <button
            type="button"
            className="linear-btn linear-btn--secondary"
            onClick={() => onHealthCheck(tenant.tenantKey)}
            disabled={actionKey === `${tenant.tenantKey}-health`}
          >
            <Icon icon="mdi:database-check-outline" />
            Health check
          </button>
          {isPivotTenant(tenant) ? (
            <button
              type="button"
              className="linear-btn linear-btn--secondary"
              onClick={() => onProvisionCatalog(tenant.tenantKey)}
              disabled={actionKey === `${tenant.tenantKey}-catalog`}
            >
              <Icon icon="mdi:store-cog-outline" />
              Provision catalog org
            </button>
          ) : null}
        </div>
      </section>

      <ManualStepsPanel tenant={tenant} onConfirmStep={onConfirmStep} savingStepId={savingStepId} />

      {isPivotTenant(tenant) ? (
        <>
          <PivotTagCatalogPanel />
          <PivotReferralCodesPanel tenantKey={tenant.tenantKey} />
        </>
      ) : null}

      {isPivotTenant(tenant) && tenant.dropSchedule ? (
        <section className="tenant-detail__section" aria-label="Weekly drop schedule">
          <h3 className="linear-section__title">Weekly drop</h3>
          <div className="linear-detail__stats">
            <div className="linear-stat linear-stat--wide">
              <span className="linear-stat__label">Next drop</span>
              <span className="linear-stat__value">{tenant.dropSchedule.nextDropFormatted}</span>
              <span className="tenant-detail__drop-meta">
                {tenant.dropSchedule.localSchedule}
                {' · '}
                {tenant.dropSchedule.source === 'override' ? 'override week' : 'default schedule'}
              </span>
            </div>
          </div>
          <p className="tenant-detail__drop-hint">
            Edit in tenant details or Platform Admin → Weekly drop.
          </p>
        </section>
      ) : null}
    </article>
  );
}

function TenantManagementPage() {
  const { addNotification } = useNotification();
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [savingStepId, setSavingStepId] = useState(null);
  const [savingVisibilityKey, setSavingVisibilityKey] = useState(null);
  const [savingMetadataKey, setSavingMetadataKey] = useState(null);
  const [lifecycleRequest, setLifecycleRequest] = useState(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [actionKey, setActionKey] = useState(null);
  const [search, setSearch] = useState('');

  const closeTenantModals = useCallback(() => {
    setLifecycleRequest(null);
    setMetadataOpen(false);
  }, []);

  const openLifecycleModal = useCallback((request) => {
    setMetadataOpen(false);
    setLifecycleRequest(request);
  }, []);

  const openMetadataModal = useCallback(() => {
    setLifecycleRequest(null);
    setMetadataOpen(true);
  }, []);

  const {AdminGrad} = useGradient('Admin');

  const { data, loading, error, refetch } = useFetch('/admin/platform/tenants', {
    cache: { enabled: true, ttlMs: 15000 },
  });

  const tenants = data?.success ? data.data?.tenants || [] : [];
  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.tenantKey?.toLowerCase().includes(q) ||
        t.subdomain?.toLowerCase().includes(q) ||
        t.location?.toLowerCase().includes(q)
    );
  }, [tenants, search]);

  const selected = useMemo(
    () => tenants.find((tenant) => tenant.tenantKey === selectedKey) || null,
    [tenants, selectedKey]
  );

  const handleFormChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'tenantKey' && !prev.subdomain) next.subdomain = value;
      if (field === 'tenantKey' && !prev.mongoDatabaseName) next.mongoDatabaseName = value;
      return next;
    });
  };

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    setCreating(true);
    const payload = {
      ...form,
      status: 'coming_soon',
      statusMessage: '',
      pivotPilot: form.tenantType === 'pivot',
      mongoDatabaseName: form.mongoDatabaseName || form.tenantKey,
    };
    const { data: res, error: reqError } = await authenticatedRequest('/admin/platform/tenants', {
      method: 'POST',
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    setCreating(false);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Create failed',
        message: res?.message || reqError || 'Unable to create tenant',
        type: 'error',
      });
      return;
    }
    addNotification({
      title: 'Tenant created',
      message: `${form.tenantKey} is coming soon — finish setup, then activate`,
      type: 'success',
    });
    try {
      const cfgRes = await fetch('/api/tenant-config', { credentials: 'include' });
      const cfgPayload = await cfgRes.json();
      if (cfgPayload?.success) setTenantConfigCache(cfgPayload.data?.tenants || []);
    } catch (_) {}
    setForm(EMPTY_FORM);
    setShowCreate(false);
    setSelectedKey(res.data.tenantKey);
    refetch();
  }, [addNotification, form, refetch]);

  const runHealthCheck = useCallback(async (tenantKey) => {
    setActionKey(`${tenantKey}-health`);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}/health-check`,
      { method: 'POST' }
    );
    setActionKey(null);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Health check',
        message: res?.message || reqError || 'Health check failed',
        type: 'error',
      });
      return;
    }
    const health = res?.data?.health;
    addNotification({
      title: 'Health check',
      message: formatTenantHealthMessage(health),
      type: isTenantHealthOk(health) ? 'success' : 'error',
    });
    refetch();
  }, [addNotification, refetch]);

  const provisionCatalog = useCallback(async (tenantKey) => {
    setActionKey(`${tenantKey}-catalog`);
    const { data: res } = await authenticatedRequest(
      `/admin/platform/tenants/${tenantKey}/provision-pivot-catalog`,
      { method: 'POST' }
    );
    setActionKey(null);
    if (res?.success) {
      addNotification({
        title: 'Pivot Catalog',
        message: `Org ${res.data.pivotCatalog?.orgId || res.data.pivotCatalogOrgId}`,
        type: 'success',
      });
      refetch();
    } else {
      addNotification({
        title: 'Provision failed',
        message: res?.message || 'Unable to provision catalog org',
        type: 'error',
      });
    }
  }, [addNotification, refetch]);

  const saveMetadata = useCallback(async (tenantKey, payload) => {
    setSavingMetadataKey(tenantKey);
    const { data: res, error: reqError } = await authenticatedRequest(`/admin/platform/tenants/${tenantKey}`, {
      method: 'PUT',
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    setSavingMetadataKey(null);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Save failed',
        message: res?.message || reqError || 'Unable to update tenant details',
        type: 'error',
      });
      return false;
    }
    const savedKey = res.data?.tenantKey || tenantKey;
    const renameNote = res.renamedFrom
      ? ` Renamed from ${res.renamedFrom}.`
      : '';
    addNotification({
      title: 'Saved',
      message: `${savedKey} details updated.${renameNote}`,
      type: 'success',
    });
    if (res.renamedFrom && savedKey !== selectedKey) {
      setSelectedKey(savedKey);
    }
    try {
      const cfgRes = await fetch('/api/tenant-config', { credentials: 'include' });
      const cfgPayload = await cfgRes.json();
      if (cfgPayload?.success) setTenantConfigCache(cfgPayload.data?.tenants || []);
    } catch (_) {}
    refetch();
    return true;
  }, [addNotification, refetch, selectedKey]);

  const saveVisibility = useCallback(async (tenantKey, { status, statusMessage }) => {
    setSavingVisibilityKey(tenantKey);
    const { data: res, error: reqError } = await authenticatedRequest(`/admin/platform/tenants/${tenantKey}`, {
      method: 'PUT',
      data: { status, statusMessage },
      headers: { 'Content-Type': 'application/json' },
    });
    setSavingVisibilityKey(null);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Save failed',
        message: res?.message || reqError || 'Unable to update tenant visibility',
        type: 'error',
      });
      return false;
    }
    addNotification({ title: 'Saved', message: `${tenantKey} visibility updated`, type: 'success' });
    try {
      const cfgRes = await fetch('/api/tenant-config', { credentials: 'include' });
      const cfgPayload = await cfgRes.json();
      if (cfgPayload?.success) setTenantConfigCache(cfgPayload.data?.tenants || []);
    } catch (_) {}
    refetch();
    return true;
  }, [addNotification, refetch]);

  const confirmManualStep = useCallback(async (tenant, stepId) => {
    const fieldMap = { dns: 'dns', verify_picker: 'pickerVerified' };
    const field = fieldMap[stepId];
    if (!field) {
      addNotification({
        title: 'Cannot save step',
        message: 'This checklist item is completed automatically.',
        type: 'error',
      });
      return;
    }

    setSavingStepId(stepId);
    const { data: res, error: reqError } = await authenticatedRequest(`/admin/platform/tenants/${tenant.tenantKey}`, {
      method: 'PUT',
      data: {
        provisioningConfirmations: {
          ...(tenant.provisioningConfirmations || {}),
          [field]: true,
        },
      },
      headers: { 'Content-Type': 'application/json' },
    });
    setSavingStepId(null);
    if (reqError || !res?.success) {
      addNotification({
        title: 'Could not update checklist',
        message: res?.message || reqError || 'Save failed',
        type: 'error',
      });
      return;
    }
    addNotification({
      title: 'Checklist updated',
      message: stepId === 'verify_picker' ? 'School picker verification saved' : 'Step marked complete',
      type: 'success',
    });
    refetch();
  }, [addNotification, refetch]);

  const openCreate = () => {
    closeTenantModals();
    setShowCreate(true);
    setSelectedKey(null);
  };

  const selectTenant = (tenantKey) => {
    closeTenantModals();
    setSelectedKey(tenantKey);
    setShowCreate(false);
  };

  return (
    <div className="linear-admin dash">
        <header className="header">
            <h1>Tenant Management</h1>
            <p>Centralized tenant concern management</p>
            <img src={AdminGrad} alt="" />
        </header>
      {error ? <div className="linear-admin__error">{error}</div> : null}

      <div className="linear-admin__split">
        <aside className="linear-admin__sidebar">
          <div className="linear-admin__sidebar-actions">
            <button type="button" className="linear-btn linear-btn--primary" onClick={openCreate}>
              <Icon icon="mdi:plus" />
              New tenant
            </button>
          </div>
          <div className="linear-admin__search">
            <Icon icon="mdi:magnify" className="linear-admin__search-icon" />
            <input
              className="linear-input linear-input--search"
              placeholder="Filter tenants…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="linear-admin__list">
            {loading && tenants.length === 0 ? (
              <p className="linear-admin__empty-list">Loading…</p>
            ) : filteredTenants.length === 0 ? (
              <p className="linear-admin__empty-list">No tenants match your search.</p>
            ) : (
              filteredTenants.map((tenant) => (
                <button
                  type="button"
                  key={tenant.tenantKey}
                  className={`linear-row ${selectedKey === tenant.tenantKey && !showCreate ? 'is-selected' : ''}`}
                  onClick={() => selectTenant(tenant.tenantKey)}
                >
                  <HealthDot health={tenant.health} />
                  <div className="linear-row__content">
                    <span className="linear-row__title">{tenant.name}</span>
                    <span className="linear-row__sub">{tenant.subdomainUrl || `${tenant.subdomain}.meridian.study`}</span>
                  </div>
                  <StatusBadge status={tenant.status} />
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="linear-admin__main">
          {showCreate ? (
            <CreateTenantForm
              form={form}
              creating={creating}
              onChange={handleFormChange}
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
            />
          ) : selected ? (
            <>
              <TenantDetail
                tenant={selected}
                actionKey={actionKey}
                onHealthCheck={runHealthCheck}
                onProvisionCatalog={provisionCatalog}
                onConfirmStep={confirmManualStep}
                onOpenLifecycle={openLifecycleModal}
                onOpenMetadata={openMetadataModal}
                savingVisibility={savingVisibilityKey === selected.tenantKey}
                savingMetadata={savingMetadataKey === selected.tenantKey}
                savingStepId={savingStepId}
              />
              <TenantModals
                tenant={selected}
                lifecycleRequest={lifecycleRequest}
                metadataOpen={metadataOpen}
                savingVisibility={savingVisibilityKey === selected.tenantKey}
                savingMetadata={savingMetadataKey === selected.tenantKey}
                onClose={closeTenantModals}
                onSaveVisibility={saveVisibility}
                onSaveMetadata={saveMetadata}
              />
            </>
          ) : (
            <div className="linear-empty">
              <Icon icon="mdi:city-variant-outline" className="linear-empty__icon" />
              <h3>Select a tenant</h3>
              <p>Choose a city from the list or create a new tenant to get started.</p>
              <button type="button" className="linear-btn linear-btn--secondary" onClick={openCreate}>
                <Icon icon="mdi:plus" />
                New tenant
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default TenantManagementPage;
