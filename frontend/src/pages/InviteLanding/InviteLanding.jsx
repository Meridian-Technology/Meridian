import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import apiRequest from '../../utils/postRequest';
import justGoWordmark from '../../assets/pivot/just-go-wordmark.svg';
import './InviteLanding.scss';

const JUSTGO_IOS_STORE_URL =
  'https://apps.apple.com/us/app/just-go-weekly-curated-events/id6801364892';
const JUSTGO_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.justgo';
const INVITE_THEME_STORAGE_KEY = 'meridian.invite.theme';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'day';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(INVITE_THEME_STORAGE_KEY);
    if (stored === 'day' || stored === 'night') return stored;
  } catch {
    // ignore storage errors
  }
  return getSystemTheme();
}

function useInviteTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'night' ? 'day' : 'night';
      try {
        localStorage.setItem(INVITE_THEME_STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme, isNight: theme === 'night' };
}

function useDeviceDetection() {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return { isAndroid: false };
    }
    const ua = navigator.userAgent || navigator.vendor || '';
    const isAndroid = /android/i.test(ua);
    return { isAndroid };
  }, []);
}

function normalizeInviteCode(raw) {
  return (raw || '').trim().toUpperCase();
}

function buildInviteQuery(code, referredByUserId) {
  const params = new URLSearchParams();
  params.set('code', normalizeInviteCode(code));
  const ref = (referredByUserId || '').trim();
  if (ref) {
    params.set('ref', ref);
  }
  return params.toString();
}

function buildDeepLinks(code, referredByUserId) {
  const query = buildInviteQuery(code, referredByUserId);
  return {
    justgo: `justgo://invite?${query}`,
    meridian: `meridian://invite?${query}`,
  };
}

function InviteLanding() {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get('code');
  const referredByUserId = searchParams.get('ref')?.trim() || null;
  const code = normalizeInviteCode(rawCode);
  const { isAndroid } = useDeviceDetection();
  const { theme, toggleTheme, isNight } = useInviteTheme();

  const [state, setState] = useState('loading'); // loading | valid | invalid | missing
  const [cityDisplayName, setCityDisplayName] = useState(null);
  const [copyStatus, setCopyStatus] = useState('idle'); // idle | copied | error

  useEffect(() => {
    document.title = 'just go — invite';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isNight ? '#1E1A16' : '#FAF6EF');
    }

    return () => {
      document.title = 'Meridian';
      if (meta) {
        meta.setAttribute('content', '#000000');
      }
    };
  }, [isNight]);

  useEffect(() => {
    if (!code) {
      setState('missing');
      return;
    }

    let cancelled = false;
    setState('loading');

    apiRequest('/pivot/referral/preview', null, {
      method: 'GET',
      params: { code },
    })
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res?.data?.valid) {
          setCityDisplayName(res.data.cityDisplayName || null);
          setState('valid');
          return;
        }
        setState('invalid');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleCopyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    }
  }, [code]);

  const deepLinks = code ? buildDeepLinks(code, referredByUserId) : null;

  const renderStoreBadges = () => (
    <div className="invite-landing__store-badges">
      {isAndroid ? (
        <a
          className="invite-landing__store-badge"
          href={JUSTGO_PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get it on Google Play"
        >
          Get it on Google Play
        </a>
      ) : (
        <a
          className="invite-landing__store-badge invite-landing__store-badge--solo"
          href={JUSTGO_IOS_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download on the App Store"
        >
          <img
            src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
            alt="Download on the App Store"
            height="40"
          />
        </a>
      )}
    </div>
  );

  const renderError = (title, body) => (
    <div className="invite-landing__card invite-landing__card--error">
      <div className="invite-landing__burst" aria-hidden="true">
        <Icon icon="mdi:close-thick" />
      </div>
      <h1 className="invite-landing__title">{title}</h1>
      <p className="invite-landing__body">{body}</p>
      {code ? (
        <p className="invite-landing__code-hint">
          code tried: <strong>{code}</strong>
        </p>
      ) : null}
    </div>
  );

  return (
    <div className={`invite-landing invite-landing--${theme}`}>
      <button
        type="button"
        className="invite-landing__theme-toggle"
        onClick={toggleTheme}
        aria-label={isNight ? 'switch to day mode' : 'switch to night mode'}
        title={isNight ? 'day mode' : 'night mode'}
      >
        <Icon icon={isNight ? 'mdi:white-balance-sunny' : 'mdi:moon-waning-crescent'} />
        <span>{isNight ? 'day' : 'night'}</span>
      </button>
      <div className="invite-landing__frame">
        <header className="invite-landing__header">
          <div className="invite-landing__wordmark-panel">
            <img
              className="invite-landing__wordmark"
              src={justGoWordmark}
              alt="just go"
            />
          </div>
          <p className="invite-landing__tagline">don't overthink, just go!</p>
          <p className="invite-landing__experiment">
            <strong>just go</strong> is its own app now. download it, pick your city,
            and your invite code is optional credit — not a gate.
          </p>
        </header>

        {state === 'loading' ? (
          <div className="invite-landing__card" aria-busy="true">
            <div className="invite-landing__loading">
              <Icon icon="mdi:loading" className="invite-landing__spinner" />
              <p>checking your invite…</p>
            </div>
          </div>
        ) : null}

        {state === 'missing'
          ? renderError(
              "that code didn't work",
              'this link is missing an invite code. ask your friend to resend the full link.',
            )
          : null}

        {state === 'invalid'
          ? renderError(
              "that code didn't work",
              'double-check the code or ask for a fresh invite. codes can expire or hit their limit.',
            )
          : null}

        {state === 'valid' ? (
          <div className="invite-landing__card">
            <p className="invite-landing__eyebrow">you&apos;re invited</p>
            <h1 className="invite-landing__title">
              join just go
              {cityDisplayName ? (
                <>
                  {' '}
                  in <span className="invite-landing__city">{cityDisplayName}</span>
                </>
              ) : null}
            </h1>

            <div className="invite-landing__code-box">
              <span className="invite-landing__code-label">invite code</span>
              <span className="invite-landing__code-value">{code}</span>
              <button
                type="button"
                className="invite-landing__copy-btn"
                onClick={handleCopyCode}
              >
                {copyStatus === 'copied'
                  ? 'copied!'
                  : copyStatus === 'error'
                    ? 'copy failed'
                    : 'copy code'}
              </button>
            </div>

            <ol className="invite-landing__steps">
              <li className="invite-landing__step">
                <span className="invite-landing__step-num">1</span>
                <div className="invite-landing__step-body">
                  <h2>download just go</h2>
                  <p>
                    grab just go from the store. your invite code is optional — pick a
                    city to start, or paste the code for credit.
                  </p>
                  {renderStoreBadges()}
                </div>
              </li>

              <li className="invite-landing__step">
                <span className="invite-landing__step-num">2</span>
                <div className="invite-landing__step-body">
                  <h2>come back and tap open</h2>
                  <p>
                    after installing, click the button below to open just go.
                  </p>
                  {deepLinks ? (
                    <a className="invite-landing__cta" href={deepLinks.justgo}>
                      open in just go
                    </a>
                  ) : null}
                </div>
              </li>
            </ol>

            <div className="invite-landing__fallback">
              <h3>or enter the code manually</h3>
              <p>
                open just go → pick your city, or tap{' '}
                <strong>have an invite code?</strong> and paste{' '}
                <strong>{code}</strong>.
              </p>
              {deepLinks ? (
                <p>
                  still on Meridian Go from the pilot?{' '}
                  <a className="invite-landing__cta-inline" href={deepLinks.meridian}>
                    open with meridian://
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <p className="invite-landing__note">contact <a href="mailto:raven@meridian.study">raven@meridian.study</a> to leave feedback or feature requests.</p>
      </div>
    </div>
  );
}

export default InviteLanding;
