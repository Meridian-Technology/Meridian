/**
 * MOCKUP — Campaigns list. Meridian Admin/ManageUsers design language.
 */
import React from 'react';
import './AdminOutreachMock.scss';

const MOCK_CAMPAIGNS = [
  { id: 1, name: 'CS Class of 2027 – Internship Fair', sent: 'Mar 10, 2025', recipients: 342, status: 'Sent' },
  { id: 2, name: 'Graduate Students – Thesis Deadlines', sent: 'Mar 8, 2025', recipients: 89, status: 'Sent' },
  { id: 3, name: 'Undergrad Active – Spring Events', sent: 'Mar 5, 2025', recipients: 1204, status: 'Sent' },
];

export default function OutreachCampaigns() {
  return (
    <div className="outreach-mock-panel">
      <header className="outreach-mock-header">
        <h2>Campaigns</h2>
        <p className="subtitle">View and manage past outreach</p>
      </header>

      <div className="outreach-mock-toolbar">
        <div className="search-wrapper">
          <input
            type="search"
            className="search-input"
            placeholder="Search campaigns..."
            readOnly
          />
        </div>
        <button type="button" className="outreach-mock-btn outreach-mock-btn--primary">
          New outreach
        </button>
      </div>

      <div className="outreach-mock-content outreach-mock-content--single">
        <div className="outreach-list-section">
          <div className="outreach-list-header">
            <span>Recent campaigns</span>
            <span className="count">{MOCK_CAMPAIGNS.length} campaign{MOCK_CAMPAIGNS.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="outreach-list">
            {MOCK_CAMPAIGNS.map((c) => (
              <div key={c.id} className="outreach-row">
                <div className="outreach-row-info">
                  <span className="outreach-row-name">{c.name}</span>
                  <span className="outreach-row-meta">
                    {c.sent} · {c.recipients} recipients
                  </span>
                </div>
                <span className="outreach-badge">{c.status}</span>
                <button type="button" className="outreach-mock-btn outreach-mock-btn--ghost">
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="outreach-mock-banner">
        Mockup only — no data is saved.
      </div>
    </div>
  );
}
