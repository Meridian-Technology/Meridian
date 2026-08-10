import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import justGoWordmarkLight from '../../assets/pivot/just-go-wordmark.svg';
import { getCurrentTenantDisplayName } from '../../config/tenantRedirect';
import { generalIcons } from '../../Icons';
import useAuth from '../../hooks/useAuth';
import justGoCreatorCopy from './justGoCreatorCopy';
import { JUSTGO_CREATOR_ROUTES } from './justGoCreatorRoutes';
import './JustGoCreatorLogin.scss';

const copy = justGoCreatorCopy.login;

/**
 * Only same-origin absolute paths are honoured as a return destination. `?redirect=` is
 * attacker-controllable, and `//evil.example` is a valid URL that a naive `startsWith('/')` check
 * would wave through.
 */
export function safeReturnPath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return candidate;
}

/**
 * Just Go Creator sign-in — flare register, and the only full-bleed surface in the console.
 *
 * Ported from the mobile `PivotAuthScreen` rather than from Meridian's `/login`: ticker bar, hero
 * photo under the lo-fi wash, cream card tilted off-axis with an accent stripe, underline fields,
 * orange pill CTA, lowercase throughout. This is the creator's first impression of Just Go, so it
 * speaks consumer voice — the docket austerity starts once they're inside.
 *
 * Email/password is handled here. Two flows deliberately hand off to Meridian's `/login`, which
 * already implements them: admin MFA (passkey / TOTP), and the Google code exchange, whose
 * `redirect_uri` is registered against that path.
 */
function JustGoCreatorLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isAuthenticating, login } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const city = getCurrentTenantDisplayName();
  const cityLabel = city && city !== 'Institution' ? city : null;

  const returnTo = useMemo(
    () =>
      safeReturnPath(location.state?.from?.pathname) ||
      safeReturnPath(searchParams.get('redirect')) ||
      JUSTGO_CREATOR_ROUTES.home,
    [location.state, searchParams],
  );

  // Survives the OAuth round trip, which loses React Router state and the query string.
  useEffect(() => {
    sessionStorage.setItem('login_redirect', returnTo);
  }, [returnTo]);

  // Same handling as the invite landing: this is a Just Go page, not a Meridian one.
  useEffect(() => {
    document.title = 'just go — creator sign in';
    return () => {
      document.title = 'Meridian';
    };
  }, []);

  const google = useGoogleLogin({
    flow: 'auth-code',
    ux_mode: 'redirect',
    redirect_uri: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
    onError: () => setError(copy.errorGeneric),
  });

  if (!isAuthenticating && isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;

    if (!form.email.trim() || !form.password) {
      setError(copy.errorEmpty);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await login({
        email: form.email.trim(),
        password: form.password,
      });
      if (result?.requiresMfa) {
        setError(copy.mfaHandoff);
        navigate('/login?mfa=required', { replace: true });
        return;
      }
      sessionStorage.removeItem('login_redirect');
      navigate(returnTo, { replace: true });
    } catch (requestError) {
      // `POST /login` answers 500 for a wrong password as readily as for a real fault, so status
      // can't tell them apart. If the server answered at all, treat it as a rejected credential —
      // the same call Meridian's own form makes; only a dead connection gets the vaguer message.
      setError(requestError?.response ? copy.errorInvalid : copy.errorGeneric);
      setBusy(false);
    }
  };

  return (
    <div className="justgo-creator justgo-login">
      <div className="justgo-login__ticker">
        <p className="justgo-login__ticker-track" aria-hidden="true">
          {/* Three passes so the loop has something to scroll into on wide viewports. */}
          {[0, 1, 2].map((pass) => (
            <span className="justgo-login__ticker-segment" key={pass}>
              {copy.ticker}
            </span>
          ))}
        </p>
        <span className="justgo-login__ticker-label">{copy.ticker}</span>
      </div>

      <main className="justgo-login__body">
        <span className="justgo-login__grain" aria-hidden="true" />

        <div className="justgo-login__stack">
          <div className="justgo-login__hero">
            <img
              className="justgo-login__hero-wordmark"
              src={justGoWordmarkLight}
              alt={justGoCreatorCopy.wordmarkAlt}
              draggable={false}
            />
            <p className="justgo-login__hero-tagline">{copy.heroTagline}</p>
            <p className="justgo-login__hero-caption">{copy.heroCaption}</p>
          </div>

          <form className="justgo-login__card" onSubmit={handleSubmit} noValidate>
            <span className="justgo-login__card-stripe" aria-hidden="true" />

            <h1 className="justgo-login__title">
              {cityLabel ? copy.titleWithCity(cityLabel.toLowerCase()) : copy.title}
            </h1>
            <p className="justgo-login__subtitle">{copy.subtitle}</p>

            {error ? (
              <p className="justgo-login__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="justgo-login__field">
              <p className="justgo-login__label">
                <label htmlFor="justgo-login-email">{copy.emailLabel}</label>
              </p>
              <input
                id="justgo-login-email"
                className="justgo-login__input"
                type="email"
                name="email"
                autoComplete="email"
                placeholder={copy.emailPlaceholder}
                value={form.email}
                onChange={handleChange}
              />
            </div>

            <div className="justgo-login__field">
              {/* The reveal is a sibling of the label, not inside it: a control nested in a label
                    steals the label's click target and muddies the input's accessible name. */}
              <p className="justgo-login__label">
                <label htmlFor="justgo-login-password">{copy.passwordLabel}</label>
                <button
                  type="button"
                  className="justgo-login__reveal"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? copy.hidePassword : copy.showPassword}
                </button>
              </p>
              <input
                id="justgo-login-password"
                className="justgo-login__input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder={copy.passwordPlaceholder}
                value={form.password}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="justgo-login__submit" disabled={busy}>
              {busy ? copy.submitBusy : copy.submit}
            </button>

            <p className="justgo-login__or">
              <span>{copy.or}</span>
            </p>

            <button type="button" className="justgo-login__oauth" onClick={() => google()}>
              <img src={generalIcons.google} alt="" aria-hidden="true" />
              {copy.continueGoogle}
            </button>

            <Link className="justgo-login__forgot" to="/forgot-password">
              {copy.forgotPassword}
            </Link>
          </form>

          <div className="justgo-login__footer">
            <p className="justgo-login__invite">{copy.inviteOnly}</p>
            <Link className="justgo-login__escape" to="/login">
              {copy.backToMeridian}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default JustGoCreatorLogin;
