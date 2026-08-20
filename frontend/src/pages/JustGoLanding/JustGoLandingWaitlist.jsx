import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatWaitlistFriendsJoined,
  resolveWaitlistShareUrl,
  useJustGoLandingCopy,
} from './justGoLandingCopy';
import { cityChipLabel } from './justGoLandingUtils';
import { submitLandingWaitlist } from './justGoLandingTracking';
import JustGoLandingCityPicker from './JustGoLandingCityPicker';

function waitlistMessage(copy, errorCode) {
  if (errorCode === 'CITY_REQUIRED') return copy.waitlistCityRequired;
  if (errorCode === 'INVALID_PHONE') return copy.waitlistPhoneRequired;
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

function WaitlistSharePanel({ copy, shareUrl, friendsJoined }) {
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
    <div className="justgo-landing__waitlist" id="waitlist">
      <p className="justgo-landing__waitlist-kicker">{copy.waitlistSuccessTitle}</p>
      <p className="justgo-landing__waitlist-body">{copy.waitlistSuccessBody}</p>
      <p className="justgo-landing__waitlist-friends">{friendsLabel}</p>
      {shareUrl ? (
        <div className="justgo-landing__waitlist-actions">
          <button
            type="button"
            className="justgo-landing__cta justgo-landing__cta--waitlist"
            onClick={onCopyLink}
          >
            {copied ? copy.waitlistCopied : copy.waitlistCopyLink}
          </button>
          {canShare ? (
            <button
              type="button"
              className="justgo-landing__cta justgo-landing__cta--waitlist justgo-landing__cta--waitlist-share"
              onClick={onShare}
            >
              {copy.waitlistShare}
            </button>
          ) : null}
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
}) {
  const copy = useJustGoLandingCopy();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [success, setSuccess] = useState(null);

  const cityLabel = cityChipLabel(
    cities.find((city) => city.tenantKey === selectedTenantKey),
  );

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
      phone,
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
      />
    );
  }

  return (
    <form className="justgo-landing__waitlist" id="waitlist" onSubmit={onSubmit}>
      {cityLocked ? (
        cityLabel ? (
          <p className="justgo-landing__waitlist-kicker">{cityLabel}</p>
        ) : null
      ) : (
        <JustGoLandingCityPicker
          cities={cities}
          selectedTenantKey={selectedTenantKey}
          onChange={onCityChange}
          className="justgo-landing-deck__cities justgo-landing__waitlist-cities"
        />
      )}
      <label className="justgo-landing__waitlist-field">
        <span className="justgo-landing__waitlist-label">{copy.waitlistPhoneLabel}</span>
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          inputMode="tel"
          placeholder={copy.waitlistPhonePlaceholder}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          aria-invalid={errorCode === 'INVALID_PHONE' ? 'true' : undefined}
        />
      </label>
      {errorCode ? (
        <p className="justgo-landing__waitlist-error" role="alert">
          {waitlistMessage(copy, errorCode)}
        </p>
      ) : null}
      <button
        type="submit"
        className="justgo-landing__cta justgo-landing__cta--waitlist"
        disabled={submitting || !selectedTenantKey}
      >
        {submitting ? copy.waitlistSubmitting : copy.waitlistSubmit}
      </button>
      <p className="justgo-landing__waitlist-consent">
        {copy.waitlistConsent}{' '}
        <Link to="/privacy-policy">{copy.footerPrivacy}</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/terms-of-service">{copy.footerTerms}</Link>
      </p>
    </form>
  );
}
