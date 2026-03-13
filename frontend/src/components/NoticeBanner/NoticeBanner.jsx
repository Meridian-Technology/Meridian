import React from 'react';
import { useNavigate } from 'react-router-dom';
import './NoticeBanner.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../hooks/useFetch';

function isRelativeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}

function NoticeBanner({
  notice: noticeProp,
  color = '#6D8EFA',
  backgroundColor = 'rgba(109, 142, 250, 0.12)',
  icon = 'tabler:info-circle',
}) {
  const navigate = useNavigate();
  const { data: noticeData } = useFetch(noticeProp ? null : '/api/notice/web');
  const notice = noticeProp || noticeData?.data;

  if (!notice || !notice.title) {
    return null;
  }

  const handleAction = () => {
    if (notice.actionUrl) {
      if (isRelativeUrl(notice.actionUrl)) {
        navigate(notice.actionUrl);
      } else {
        window.open(notice.actionUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div
      className="notice-banner"
      style={{
        '--notice-color': color,
        '--notice-bg': backgroundColor,
      }}
      role="alert"
    >
      <div className="notice-banner__content">
        <Icon icon={icon} className="notice-banner__icon" />
        <div className="notice-banner__text">
          <span className="notice-banner__title">{notice.title}</span>
          {notice.message && (
            <span className="notice-banner__message">{notice.message}</span>
          )}
        </div>
      </div>
      {notice.actionLabel && notice.actionUrl && (
        <button
          type="button"
          className="notice-banner__action"
          onClick={handleAction}
        >
          {notice.actionLabel}
          <Icon icon="heroicons:chevron-right" />
        </button>
      )}
    </div>
  );
}

export default NoticeBanner;
