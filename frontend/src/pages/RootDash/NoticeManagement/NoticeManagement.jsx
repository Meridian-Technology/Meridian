import React, { useState, useEffect } from 'react';
import './NoticeManagement.scss';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';

function NoticeManagement() {
  const [form, setForm] = useState({
    active: false,
    title: '',
    message: '',
    displayType: 'banner',
    actionLabel: '',
    actionUrl: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const { data: noticeResp, loading, refetch } = useFetch('/api/notice/admin', { method: 'GET' });

  useEffect(() => {
    if (noticeResp?.success && noticeResp.data) {
      const d = noticeResp.data;
      setForm({
        active: d.active ?? false,
        title: d.title ?? '',
        message: d.message ?? '',
        displayType: d.displayType ?? 'banner',
        actionLabel: d.actionLabel ?? '',
        actionUrl: d.actionUrl ?? ''
      });
    }
  }, [noticeResp]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaveMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSaveMessage(null);
    try {
      const resp = await apiRequest('/api/notice', form, { method: 'PUT' });
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
        <p>Configure a notice shown to users on the mobile app Home screen (after login/register).</p>
      </div>

      {loading && !noticeResp ? (
        <div className="notice-management__loading">Loading...</div>
      ) : (
        <form className="notice-management__form" onSubmit={handleSubmit}>
          <div className="notice-management__card">
            <h3>Notice Settings</h3>

            <div className="notice-management__field notice-management__field--toggle">
              <label>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => handleChange('active', e.target.checked)}
                />
                <span>Active</span>
              </label>
              <p className="notice-management__hint">When active, the notice will be shown to users on the Home screen.</p>
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
                <strong>Banner:</strong> Shows above the action cards. <strong>Popup:</strong> Opens as a modal when the user reaches the Home screen.
              </p>
            </div>

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
                type="url"
                value={form.actionUrl}
                onChange={(e) => handleChange('actionUrl', e.target.value)}
                placeholder="https://..."
                maxLength={500}
              />
              <p className="notice-management__hint">If both are set, tapping the button will open this URL.</p>
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
                  Save Notice
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default NoticeManagement;
