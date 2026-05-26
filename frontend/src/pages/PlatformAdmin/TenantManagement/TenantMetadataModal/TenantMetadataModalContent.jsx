import React, { useEffect, useState } from 'react';
import './TenantMetadataModal.scss';

function tenantToForm(tenant) {
  const isPivot = tenant.pivotPilot === true || tenant.tenantType === 'pivot';
  return {
    name: tenant.name || '',
    location: tenant.location || '',
    subdomain: tenant.subdomain || tenant.tenantKey || '',
    tenantType: isPivot ? 'pivot' : 'campus',
    mongoDatabaseName: tenant.mongoDatabaseName || tenant.tenantKey || '',
    mongoUri: '',
  };
}

function TenantMetadataModalContent({ tenant, saving, onSave, handleClose = () => {} }) {
  const [form, setForm] = useState(() => tenantToForm(tenant));

  useEffect(() => {
    setForm(tenantToForm(tenant));
  }, [tenant]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      subdomain: form.subdomain.trim().toLowerCase(),
      tenantType: form.tenantType,
      pivotPilot: form.tenantType === 'pivot',
      mongoDatabaseName: form.mongoDatabaseName.trim().toLowerCase() || tenant.tenantKey,
    };
    const uri = form.mongoUri.trim();
    if (uri) payload.mongoUri = uri;

    const ok = await onSave(payload);
    if (ok !== false) handleClose();
  };

  return (
    <form className="tenant-metadata-modal" onSubmit={handleSubmit}>
      <h2 className="tenant-metadata-modal__title">Edit tenant details</h2>
      <p className="tenant-metadata-modal__lead">
        Update display and infrastructure metadata for <strong>{tenant.tenantKey}</strong>.
        Status and lifecycle controls are unchanged.
      </p>

      <div className="tenant-metadata-modal__grid">
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Display name</span>
          <input
            className="tenant-metadata-modal__input"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
          />
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">City / location</span>
          <input
            className="tenant-metadata-modal__input"
            value={form.location}
            onChange={(e) => handleChange('location', e.target.value)}
            required
          />
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Subdomain</span>
          <input
            className="tenant-metadata-modal__input"
            value={form.subdomain}
            onChange={(e) => handleChange('subdomain', e.target.value.toLowerCase())}
            required
            pattern="[a-z][a-z0-9_-]{0,31}"
          />
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Type</span>
          <select
            className="tenant-metadata-modal__input"
            value={form.tenantType}
            onChange={(e) => handleChange('tenantType', e.target.value)}
          >
            <option value="pivot">Pivot city pilot</option>
            <option value="campus">Campus</option>
          </select>
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Mongo database</span>
          <input
            className="tenant-metadata-modal__input"
            value={form.mongoDatabaseName}
            onChange={(e) => handleChange('mongoDatabaseName', e.target.value.toLowerCase())}
          />
        </label>
        <label className="tenant-metadata-modal__field tenant-metadata-modal__field--full">
          <span className="tenant-metadata-modal__label">Mongo URI (optional)</span>
          <input
            className="tenant-metadata-modal__input"
            value={form.mongoUri}
            onChange={(e) => handleChange('mongoUri', e.target.value)}
            placeholder={tenant.mongoUriConfigured ? 'Leave blank to keep current URI' : 'Set connection URI'}
          />
        </label>
      </div>

      <footer className="tenant-metadata-modal__footer">
        <button type="button" className="tenant-metadata-modal__btn tenant-metadata-modal__btn--ghost" onClick={handleClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="tenant-metadata-modal__btn tenant-metadata-modal__btn--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </form>
  );
}

export default TenantMetadataModalContent;
