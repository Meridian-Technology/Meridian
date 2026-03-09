import React, { useState, useEffect } from 'react';
import './NoticeManagement.scss';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';

const EMPTY_CONFIG = {
  active: false,
  title: '',
  message: '',
  displayType: 'banner',
  actionLabel: '',
  actionUrl: '',
  showFor: 'both',
};

function NoticeManagement() {
  const [activeTab, setActiveTab] = useState('mobile');
  const [form, setForm] = useState({ ...EMPTY_CONFIG });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const { data: noticeResp, loading, refetch } = useFetch('/api/notice/admin', { method: 'GET' });

  useEffect(() => {
    if (noticeResp?.success && noticeResp.data) {
      const { mobile, web } = noticeResp.data;
      const config = activeTab === 'mobile' ? mobile : web;
      setForm({
        active: config?.active ?? false,
        title: config?.title ?? '',
        message: config?.message ?? '',
        displayType: config?.displayType ?? 'banner',
        actionLabel: config?.actionLabel ?? '',
        actionUrl: config?.actionUrl ?? '',
        showFor: config?.showFor ?? 'both',
      });
    }
  }, [noticeResp, activeTab]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSaveMessage(null);
    try {
      const payload = {
        platform: activeTab,
        active: form.active,
        title: form.title,
        message: form.message,
        displayType: form.displayType,
        actionLabel: form.actionLabel,
        actionUrl: form.actionUrl,
      };
      if (activeTab === 'web') {
        payload.showFor = form.showFor;
      }
      const resp = await apiRequest('/api/notice', payload, { method: 'PUT' });
      if (resp?.success) {
        setSaveMessage({ type: 'success', text: 'Notice saved successfully.' });
        refetch();
      } else {
        setSaveMessage({ type: 'error', text: resp?.message || 'Failed to save notice.' });
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: err?.message || 'Failed to save notice.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="notice-management">
      <div className="notice-management__header">
        <h1>Notice Management</h1>
        <p>
          Configure notices for mobile app and web. Mobile notices appear on the app Home screen.
          Web notices appear on Explore (guests) or Home (logged-in users).
        </p>
      </div>

      {loading && !noticeResp ? (
        <div className="notice-management__loading">Loading...</div>
      ) : (
        <>
          <div className="notice-management__tabs">
            <button
              type="button"
              className={`notice-management__tab ${activeTab === 'mobile' ? 'active' : ''}`}
              onClick={() => setActiveTab('mobile')}
            >
              Mobile
            </button>
            <button
              type="button"
              className={`notice-management__tab ${activeTab === 'web' ? 'active' : ''}`}
              onClick={() => setActiveTab('web')}
            >
              Web
            </button>
          </div>

          <form className="notice-management__form" onSubmit={handleSubmit}>
            <div className="notice-management__card">
              <h3>{activeTab === 'mobile' ? 'Mobile Notice Settings' : 'Web Notice Settings'}</h3>

              <div className="notice-management__field notice-management__field--toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => handleChange('active', e.target.checked)}
                  />
                  <span>Active</span>
                </label>
                <p className="notice-management__hint">
                  {activeTab === 'mobile'
                    ? 'When active, the notice will be shown to users on the mobile app Home screen.'
                    : 'When active, the notice will be shown on web (Explore or Home depending on audience).'}
                </p>
              </div>

              <div className="notice-management__field">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={form.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="e.g. Important Update"
                  maxLength={100}
                />
              </div>

              <div className="notice-management__field">
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  value={form.message}
                  onChange={(e) => handleChange('message', e.target.value)}
                  placeholder="Enter the notice content..."
                  rows={4}
                  maxLength={1000}
                />
                <p className="notice-management__char-count">{form.message.length}/1000</p>
              </div>

              {activeTab === 'mobile' && (
                <div className="notice-management__field">
                  <label>Display Type</label>
                  <div className="notice-management__radio-group">
                    <label className="notice-management__radio">
                      <input
                        type="radio"
                        name="displayType"
                        value="banner"
                        checked={form.displayType === 'banner'}
                        onChange={(e) => handleChange('displayType', e.target.value)}
                      />
                      <span>Banner</span>
                    </label>
                    <label className="notice-management__radio">
                      <input
                        type="radio"
                        name="displayType"
                        value="popup"
                        checked={form.displayType === 'popup'}
                        onChange={(e) => handleChange('displayType', e.target.value)}
                      />
                      <span>Popup</span>
                    </label>
                  </div>
                  <p className="notice-management__hint">
                    <strong>Banner:</strong> Shows above the action cards.{' '}
                    <strong>Popup:</strong> Opens as a modal when the user reaches the Home screen.
                  </p>
                </div>
              )}

              {activeTab === 'web' && (
                <div className="notice-management__field">
                  <label>Show for</label>
                  <div className="notice-management__radio-group">
                    <label className="notice-management__radio">
                      <input
                        type="radio"
                        name="showFor"
                        value="guest"
                        checked={form.showFor === 'guest'}
                        onChange={(e) => handleChange('showFor', e.target.value)}
                      />
                      <span>Guests only</span>
                    </label>
                    <label className="notice-management__radio">
                      <input
                        type="radio"
                        name="showFor"
                        value="authenticated"
                        checked={form.showFor === 'authenticated'}
                        onChange={(e) => handleChange('showFor', e.target.value)}
                      />
                      <span>Authenticated only</span>
                    </label>
                    <label className="notice-management__radio">
                      <input
                        type="radio"
                        name="showFor"
                        value="both"
                        checked={form.showFor === 'both'}
                        onChange={(e) => handleChange('showFor', e.target.value)}
                      />
                      <span>Both</span>
                    </label>
                  </div>
                  <p className="notice-management__hint">
                    <strong>Guests only:</strong> Explore page (unauthenticated).{' '}
                    <strong>Authenticated only:</strong> Home page (logged-in).{' '}
                    <strong>Both:</strong> Both pages.
                  </p>
                </div>
              )}

              <div className="notice-management__field">
                <label htmlFor="actionLabel">Action Button Label (optional)</label>
                <input
                  id="actionLabel"
                  type="text"
                  value={form.actionLabel}
                  onChange={(e) => handleChange('actionLabel', e.target.value)}
                  placeholder="e.g. Learn More"
                  maxLength={50}
                />
              </div>

              <div className="notice-management__field">
                <label htmlFor="actionUrl">Action URL (optional)</label>
                <input
                  id="actionUrl"
                  type="text"
                  value={form.actionUrl}
                  onChange={(e) => handleChange('actionUrl', e.target.value)}
                  placeholder="e.g. /events or https://..."
                  maxLength={500}
                />
                <p className="notice-management__hint">
                  Relative paths (e.g. /events) navigate in-app. Full URLs open in a new tab.
                </p>
              </div>
            </div>

            {saveMessage && (
              <div className={`notice-management__message notice-management__message--${saveMessage.type}`}>
                {saveMessage.type === 'success' ? (
                  <Icon icon="mdi:check-circle" />
                ) : (
                  <Icon icon="mdi:alert-circle" />
                )}
                <span>{saveMessage.text}</span>
              </div>
            )}

            <div className="notice-management__actions">
              <button
                type="submit"
                className="notice-management__btn notice-management__btn--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Icon icon="mdi:loading" className="spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:content-save" />
                    Save {activeTab === 'mobile' ? 'Mobile' : 'Web'} Notice
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default NoticeManagement;
