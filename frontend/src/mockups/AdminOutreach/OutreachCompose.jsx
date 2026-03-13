/**
 * MOCKUP — New outreach compose. Meridian Admin/ManageUsers design language.
 */
import React, { useState } from 'react';
import './AdminOutreachMock.scss';

export default function OutreachCompose() {
  const [major, setMajor] = useState('');
  const [year, setYear] = useState('');
  const [program, setProgram] = useState('');
  const [enrollment, setEnrollment] = useState('');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');

  return (
    <div className="outreach-mock-panel">
      <header className="outreach-mock-header">
        <h2>New outreach</h2>
        <p className="subtitle">Target students by attributes. Recipients update as data changes.</p>
      </header>

      <div className="outreach-mock-content outreach-mock-content--compose">
        <div className="outreach-targeting-section">
          <h3>Who receives this message?</h3>
          <p className="outreach-hint">Targeting updates automatically as student attributes change.</p>
          <div className="outreach-filters">
            <div className="outreach-field">
              <label>Major / Department</label>
              <select
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                className="role-filter-select"
              >
                <option value="">Any</option>
                <option value="cs">Computer Science</option>
                <option value="ece">Electrical & Computer Engineering</option>
                <option value="math">Mathematics</option>
              </select>
            </div>
            <div className="outreach-field">
              <label>Graduation year</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="role-filter-select"
              >
                <option value="">Any</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
                <option value="2028">2028</option>
              </select>
            </div>
            <div className="outreach-field">
              <label>Program type</label>
              <select
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="role-filter-select"
              >
                <option value="">Any</option>
                <option value="ug">Undergraduate</option>
                <option value="grad">Graduate</option>
                <option value="phd">PhD</option>
              </select>
            </div>
            <div className="outreach-field">
              <label>Enrollment status</label>
              <select
                value={enrollment}
                onChange={(e) => setEnrollment(e.target.value)}
                className="role-filter-select"
              >
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="leave">Leave</option>
                <option value="graduated">Graduated</option>
              </select>
            </div>
          </div>
          <div className="outreach-preview-box">
            <strong>Estimated recipients:</strong> 342 students (live count)
          </div>
        </div>

        <div className="outreach-message-section">
          <h3>Message</h3>
          <div className="outreach-field">
            <label>Subject</label>
            <input
              type="text"
              className="search-input"
              placeholder="e.g. Internship Fair – Class of 2027"
              value={messageSubject}
              onChange={(e) => setMessageSubject(e.target.value)}
            />
          </div>
          <div className="outreach-field">
            <label>Body</label>
            <textarea
              className="outreach-textarea"
              placeholder="Write your announcement. Supports plain text and links."
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={8}
            />
          </div>
          <p className="outreach-delivery-hint">
            Delivery: Email + in-app notification (configured in Configuration).
          </p>
          <div className="outreach-actions">
            <button type="button" className="outreach-mock-btn outreach-mock-btn--primary">
              Send to 342 students
            </button>
            <button type="button" className="outreach-mock-btn outreach-mock-btn--secondary">
              Save draft
            </button>
          </div>
        </div>
      </div>

      <div className="outreach-mock-banner">
        Mockup only — no data is saved.
      </div>
    </div>
  );
}
