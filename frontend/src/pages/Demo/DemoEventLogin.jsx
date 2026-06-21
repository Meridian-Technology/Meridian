import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './demo.scss';

function DemoEventLogin({ onLogin, error, onClearError }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [localError, setLocalError] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLocalError('');
        onClearError?.();
        setSubmitting(true);
        const result = await onLogin(email.trim(), password);
        if (!result?.success) {
            setLocalError(result?.message || 'Login failed');
        }
        setSubmitting(false);
    };

    const displayError = localError || error;

    return (
        <div className="demo-events">
            <div className="demo-events__login-card">
                <div className="demo-events__brand">
                    <span className="demo-events__eyebrow">Meridian demo</span>
                    <h1>Explore the org event workspace</h1>
                    <p>
                        Sign in with the credentials shared with you to preview planning,
                        day-of, and post-event workflows with realistic sample data.
                    </p>
                </div>

                <form className="demo-events__form" onSubmit={handleSubmit}>
                    <label htmlFor="demo-email">Email</label>
                    <input
                        id="demo-email"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        required
                    />

                    <label htmlFor="demo-password">Password</label>
                    <input
                        id="demo-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {displayError ? (
                        <div className="demo-events__error" role="alert">
                            <Icon icon="mdi:alert-circle-outline" />
                            <span>{displayError}</span>
                        </div>
                    ) : null}

                    <button type="submit" className="demo-events__submit" disabled={submitting}>
                        {submitting ? 'Signing in…' : 'Enter demo'}
                    </button>
                </form>

                <p className="demo-events__footer-note">
                    Read-only experience · <Link to="https://meridian.study" target="_blank" rel="noreferrer">meridian.study</Link>
                </p>
            </div>
        </div>
    );
}

export default DemoEventLogin;
