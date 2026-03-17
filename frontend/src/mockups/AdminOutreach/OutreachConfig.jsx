/**
 * MOCKUP — Outreach configuration panel. Meridian Admin/ManageUsers design language.
 */
import React, { useState } from 'react';
import './AdminOutreachMock.scss';

const MOCK_ATTRIBUTES = [
  { key: 'major', label: 'Major / Department', source: 'SIS', editable: false },
  { key: 'graduation_year', label: 'Graduation year', source: 'SIS', editable: false },
  { key: 'program_type', label: 'Program type', source: 'SIS', editable: false },
  { key: 'enrollment_status', label: 'Enrollment status', source: 'SIS', editable: false },
  { key: 'college', label: 'College', source: 'SIS', editable: false },
  { key: 'custom_cohort', label: 'Custom cohort', source: 'Manual', editable: true },
];

const MOCK_ROLES = [
  { role: 'Admin', canSend: true, canConfigure: true },
  { role: 'Outreach manager', canSend: true, canConfigure: false },
  { role: 'Viewer', canSend: false, canConfigure: false },
];

export default function OutreachConfig() {
  const [dataSource, setDataSource] = useState('sis');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [notificationEnabled, setNotificationEnabled] = useState(true);

  return (
    <div className="outreach-mock-panel outreach-mock-panel--config">
      <header className="outreach-mock-header">
        <h2>Outreach configuration</h2>
        <p className="subtitle">Student attributes, data source, roles, and delivery settings.</p>
      </header>

      <div className="outreach-config-sections">
        <section className="outreach-config-section">
          <h3>Student attributes</h3>
          <p className="outreach-hint">Attributes used for targeting. List updates when data source syncs.</p>
          <div className="outreach-list-section">
            <div className="outreach-list-header outreach-list-header--config">
              <span>Attribute</span>
              <span>Source</span>
              <span>Editable</span>
            </div>
            <div className="outreach-list">
              {MOCK_ATTRIBUTES.map((a) => (
                <div key={a.key} className="outreach-row outreach-row--config">
                  <span className="outreach-row-name">
                    <code>{a.key}</code> — {a.label}
                  </span>
                  <span className="outreach-row-meta">{a.source}</span>
                  <span className="outreach-row-meta">{a.editable ? 'Yes' : 'No'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="outreach-config-section">
          <h3>Data source</h3>
          <p className="outreach-hint">Where student attributes are pulled from.</p>
          <div className="outreach-field">
            <label>Primary source</label>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="role-filter-select"
            >
              <option value="sis">Student Information System (SIS)</option>
              <option value="manual">Manual / CSV</option>
              <option value="api">External API</option>
            </select>
          </div>
          <div className="outreach-preview-box">
            Last sync: Mar 12, 2025 2:00 PM — 4,201 students
          </div>
        </section>

        <section className="outreach-config-section">
          <h3>Admin roles & permissions</h3>
          <p className="outreach-hint">Who can send outreach and who can change these settings.</p>
          <div className="outreach-list-section">
            <div className="outreach-list-header">
              <span>Role</span>
              <span>Can send</span>
              <span>Can configure</span>
            </div>
            <div className="outreach-list">
              {MOCK_ROLES.map((r) => (
                <div key={r.role} className="outreach-row outreach-row--config">
                  <span className="outreach-row-name">{r.role}</span>
                  <span className="outreach-row-meta">{r.canSend ? 'Yes' : 'No'}</span>
                  <span className="outreach-row-meta">{r.canConfigure ? 'Yes' : 'No'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="outreach-config-section">
          <h3>Delivery</h3>
          <p className="outreach-hint">How outreach messages are delivered.</p>
          <div className="outreach-checkboxes">
            <label className="outreach-checkbox">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
              />
              Send via email
            </label>
            <label className="outreach-checkbox">
              <input
                type="checkbox"
                checked={notificationEnabled}
                onChange={(e) => setNotificationEnabled(e.target.checked)}
              />
              Send in-app notification
            </label>
          </div>
          <div className="outreach-preview-box">
            Default from address and templates are set in system email config.
          </div>
        </section>
      </div>

      <div className="outreach-config-actions">
        <button type="button" className="outreach-mock-btn outreach-mock-btn--primary">
          Save configuration
        </button>
        <button type="button" className="outreach-mock-btn outreach-mock-btn--secondary">
          Discard changes
        </button>
      </div>

      <div className="outreach-mock-banner">
        Mockup only — no data is saved.
      </div>
    </div>
  );
}
