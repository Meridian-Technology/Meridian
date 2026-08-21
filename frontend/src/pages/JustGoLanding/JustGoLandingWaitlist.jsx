import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatWaitlistFriendsJoined,
  resolveWaitlistShareUrl,
  useJustGoLandingCopy,
} from './justGoLandingCopy';
import { submitLandingWaitlist } from './justGoLandingTracking';
import JustGoLandingCityPicker from './JustGoLandingCityPicker';
import { isJustGoHost } from '../../config/tenantRedirect';
import { justGoLegalPath } from './justGoLandingUtils';

function waitlistMessage(copy, errorCode) {
  if (errorCode === 'CITY_REQUIRED') return copy.waitlistCityRequired;
  if (errorCode === 'INVALID_EMAIL') return copy.waitlistEmailRequired;
  if (errorCode === 'WAITLIST_DUPLICATE') return copy.waitlistDuplicate;
  return copy.waitlistError;
}

function canUseWebShare() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  } catch {
    return false;
  }
}

function WaitlistCloseButton({ onClose }) {
  if (!onClose) return null;
  return (
    <button
      type="button"
      className="justgo-landing__waitlist-close"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      aria-label="close"
    >
      ×
    </button>
  );
}

function WaitlistSharePanel({ copy, shareUrl, friendsJoined, onClose }) {
  const [copied, setCopied] = useState(false);
  const canShare = canUseWebShare();
  const friendsLabel = formatWaitlistFriendsJoined(copy, friendsJoined);

  async function onCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function onShare() {
    if (!shareUrl || !canShare) return;
    try {
      await navigator.share({
        title: copy.productName,
        text: copy.waitlistShareText,
        url: shareUrl,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  return (
    <div className="justgo-landing__waitlist justgo-landing__waitlist--success">
      <WaitlistCloseButton onClose={onClose} />
      <h2 className="justgo-landing__waitlist-title">
        <span>{copy.waitlistSuccessTitle}</span>
      </h2>
      <p className="justgo-landing__waitlist-body">{copy.waitlistSuccessBody}</p>
      <p className="justgo-landing__waitlist-friends">{friendsLabel}</p>
      {shareUrl ? (
        <div className="justgo-landing__waitlist-actions">
          {canShare ? (
            <button
              type="button"
              className="justgo-landing__cta justgo-landing__cta--waitlist"
              onClick={onShare}
            >
              {copy.waitlistShare}
            </button>
          ) : null}
          <button
            type="button"
            className={`justgo-landing__cta justgo-landing__cta--waitlist${
              canShare ? ' justgo-landing__cta--waitlist-secondary' : ''
            }`}
            onClick={onCopyLink}
          >
            {copied ? copy.waitlistCopied : copy.waitlistCopyLink}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function JustGoLandingWaitlist({
  cities = [],
  selectedTenantKey = '',
  cityLocked = false,
  onCityChange,
  onClose,
}) {
  const copy = useJustGoLandingCopy();
  const emailRef = useRef(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [success, setSuccess] = useState(null);

  useLayoutEffect(() => {
    emailRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const node = emailRef.current;
    if (!node) return undefined;
    const focus = () => node.focus({ preventScroll: true });
    const frame = requestAnimationFrame(focus);
    const timer = window.setTimeout(focus, 50);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!selectedTenantKey) {
      setErrorCode('CITY_REQUIRED');
      return;
    }
    setSubmitting(true);
    setErrorCode('');
    const result = await submitLandingWaitlist({
      email,
      tenantKey: selectedTenantKey,
    });
    setSubmitting(false);
    if (result.error) {
      setErrorCode(result.errorCode || 'WAITLIST_ERROR');
      return;
    }
    setSuccess({
      shareUrl: resolveWaitlistShareUrl(result.data),
      friendsJoined: Number(result.data?.friendsJoined) || 0,
    });
  }

  if (success) {
    return (
      <WaitlistSharePanel
        copy={copy}
        shareUrl={success.shareUrl}
        friendsJoined={success.friendsJoined}
        onClose={onClose}
      />
    );
  }

  return (
    <form className="justgo-landing__waitlist" onSubmit={onSubmit}>
      <WaitlistCloseButton onClose={onClose} />
      {!cityLocked ? (
        <JustGoLandingCityPicker
          cities={cities}
          selectedTenantKey={selectedTenantKey}
          onChange={onCityChange}
          className="justgo-landing-deck__cities justgo-landing__waitlist-cities"
        />
      ) : null}
      <label className="justgo-landing__waitlist-field">
        <span className="justgo-landing__waitlist-label">{copy.waitlistEmailLabel}</span>
        <input
          ref={emailRef}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          placeholder={copy.waitlistEmailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={errorCode === 'INVALID_EMAIL' ? 'true' : undefined}
        />
      </label>
      {errorCode ? (
        <p className="justgo-landing__waitlist-error" role="alert">
          {waitlistMessage(copy, errorCode)}
        </p>
      ) : null}
      <p className="justgo-landing__waitlist-consent">
        {copy.waitlistConsent}{' '}
        <Link to={justGoLegalPath('privacy', isJustGoHost())}>{copy.footerPrivacy}</Link>
        <span aria-hidden="true"> · </span>
        <Link to={justGoLegalPath('terms', isJustGoHost())}>{copy.footerTerms}</Link>
      </p>
      <button
        type="submit"
        className="justgo-landing__cta justgo-landing__cta--waitlist"
        disabled={submitting || !selectedTenantKey}
      >
        {submitting ? copy.waitlistSubmitting : copy.waitlistSubmit}
      </button>
    </form>
  );
}
