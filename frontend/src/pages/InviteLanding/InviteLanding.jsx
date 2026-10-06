import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import apiRequest from '../../utils/postRequest';
import justGoWordmark from '../../assets/pivot/just-go-wordmark.svg';
import './InviteLanding.scss';

const JUSTGO_IOS_STORE_URL =
  'https://apps.apple.com/us/app/just-go-weekly-curated-events/id6801364892';
const JUSTGO_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=app.justgo';
const INVITE_THEME_STORAGE_KEY = 'meridian.invite.theme';
const PERSONAL_INVITE_CODE = /^[a-z0-9]{6,16}$/;

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

function normalizePersonalCode(raw) {
  const code = (raw || '').trim().toLowerCase();
  return PERSONAL_INVITE_CODE.test(code) ? code : '';
}

function normalizeLegacyCode(raw) {
  return (raw || '').trim().toUpperCase();
}

function buildLegacyDeepLink(code, referredByUserId) {
  const params = new URLSearchParams();
  params.set('code', code);
  const ref = (referredByUserId || '').trim();
  if (ref) params.set('ref', ref);
  return `justgo://invite?${params.toString()}`;
}

/**
 * Which link brought someone here. Every kind ends in the same place — get the
 * app, open it — so a dead or unknown link never strands the person.
 *
 * - personal: `/invite/{code}` — a friend's own link (shows who invited you)
 * - crew:     `/pivot/crew/join?token=…` — someone's circle invite
 * - legacy:   `/invite?code=…` — admin cohort code from the pilot
 */
function useInviteSource() {
  const { code: pathCode } = useParams();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    if (pathCode !== undefined) {
      const code = normalizePersonalCode(pathCode);
      return {
        kind: 'personal',
        code,
        deepLink: code ? `justgo://invite/${code}` : 'justgo://',
      };
    }
    if (pathname.startsWith('/pivot/crew/join')) {
      const token = (searchParams.get('token') || '').trim();
      return {
        kind: 'crew',
        deepLink: token
          ? `justgo://pivot/crew/join?token=${encodeURIComponent(token)}`
          : 'justgo://',
      };
    }
    const code = normalizeLegacyCode(searchParams.get('code'));
    return {
      kind: 'legacy',
      code,
      deepLink: code
        ? buildLegacyDeepLink(code, searchParams.get('ref'))
        : 'justgo://',
    };
  }, [pathCode, pathname, searchParams]);
}

/** `{ inviterName, inviterPicture, cityDisplayName }`, or null while loading. */
function useInvitePreview(source) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);

    const settle = (next) => {
      if (!cancelled) setPreview(next);
    };
    const empty = { inviterName: null, inviterPicture: null, cityDisplayName: null };

    if (source.kind === 'personal' && source.code) {
      apiRequest(`/pivot/invites/${source.code}/preview`, null, { method: 'GET' })
        .then((res) => {
          const data = res?.success && res.data?.valid ? res.data : null;
          settle({
            inviterName: data?.inviter?.name || null,
            inviterPicture: data?.inviter?.picture || null,
            cityDisplayName: data?.city?.cityDisplayName || null,
          });
        })
        .catch(() => settle(empty));
    } else if (source.kind === 'legacy' && source.code) {
      apiRequest('/pivot/referral/preview', null, {
        method: 'GET',
        params: { code: source.code },
      })
        .then((res) => {
          const data = res?.success && res.data?.valid ? res.data : null;
          settle({ ...empty, cityDisplayName: data?.cityDisplayName || null });
        })
        .catch(() => settle(empty));
    } else {
      settle(empty);
    }

    return () => {
      cancelled = true;
    };
  }, [source.kind, source.code]);

  return preview;
}

function InviterAvatar({ name, picture }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="invite-landing__avatar" aria-hidden="true">
      {picture && !failed ? (
        <img src={picture} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

function InviteHeadline({ source, preview }) {
  const city = preview.cityDisplayName ? (
    <>
      {' '}
      in <span className="invite-landing__city">{preview.cityDisplayName.toLowerCase()}</span>
    </>
  ) : null;

  if (preview.inviterName) {
    return (
      <>
        <div className="invite-landing__inviter">
          <InviterAvatar name={preview.inviterName} picture={preview.inviterPicture} />
          <p className="invite-landing__eyebrow">you&apos;re invited</p>
        </div>
        <h1 className="invite-landing__title">
          {preview.inviterName} invited you to just go{city}
        </h1>
        <p className="invite-landing__body">
          join and you&apos;re friends with {preview.inviterName} from the start. see
          what they&apos;re picking this week and make plans together.
        </p>
      </>
    );
  }

  if (source.kind === 'crew') {
    return (
      <>
        <p className="invite-landing__eyebrow">you&apos;re invited</p>
        <h1 className="invite-landing__title">join a friend&apos;s circle on just go</h1>
        <p className="invite-landing__body">
          a circle picks plans together each week. get the app and you&apos;ll land
          right in it.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="invite-landing__eyebrow">just go</p>
      <h1 className="invite-landing__title">
        {city ? <>join just go{city}</> : 'what are you doing this week?'}
      </h1>
      <p className="invite-landing__body">
        a short list of what&apos;s worth doing near you, every week. get the app and
        pick your city.
      </p>
    </>
  );
}

function InviteLanding() {
  const source = useInviteSource();
  const preview = useInvitePreview(source);
  const { isAndroid } = useDeviceDetection();
  const { theme, toggleTheme, isNight } = useInviteTheme();

  useEffect(() => {
    document.title = preview?.inviterName
      ? `${preview.inviterName} invited you to just go`
      : 'just go — invite';

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
  }, [isNight, preview?.inviterName]);

  const storeBadge = isAndroid ? (
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
        </header>

        {preview === null ? (
          <div className="invite-landing__card" aria-busy="true">
            <div className="invite-landing__loading">
              <Icon icon="mdi:loading" className="invite-landing__spinner" />
              <p>opening your invite…</p>
            </div>
          </div>
        ) : (
          <div className="invite-landing__card">
            <InviteHeadline source={source} preview={preview} />

            <ol className="invite-landing__steps">
              <li className="invite-landing__step">
                <span className="invite-landing__step-num">1</span>
                <div className="invite-landing__step-body">
                  <h2>get just go</h2>
                  <p>free on the app store and google play.</p>
                  <div className="invite-landing__store-badges">{storeBadge}</div>
                </div>
              </li>

              <li className="invite-landing__step">
                <span className="invite-landing__step-num">2</span>
                <div className="invite-landing__step-body">
                  <h2>open it from here</h2>
                  <p>
                    once it&apos;s installed, tap below so just go knows who invited
                    you.
                  </p>
                  <a className="invite-landing__cta" href={source.deepLink}>
                    open in just go
                  </a>
                </div>
              </li>
            </ol>
          </div>
        )}
        <p className="invite-landing__note">contact <a href="mailto:raven@meridian.study">raven@meridian.study</a> to leave feedback or feature requests.</p>
      </div>
    </div>
  );
}

export default InviteLanding;
