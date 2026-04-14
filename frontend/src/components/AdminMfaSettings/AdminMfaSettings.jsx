import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { startRegistration } from '@simplewebauthn/browser';
import './AdminMfaSettings.scss';

function AdminMfaSettings() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState({
        configured: false,
        methods: [],
        passkeyCount: 0,
        passkeys: [],
        totpEnabled: false,
    });
    const [totpSetup, setTotpSetup] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [disableTotpCode, setDisableTotpCode] = useState('');
    const [passkeyName, setPasskeyName] = useState('');

    const loadStatus = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.get('/mfa/admin/status', { withCredentials: true });
            setStatus(response.data.data || {});
        } catch (err) {
            setError(err?.response?.data?.message || 'Could not load admin MFA settings.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    const handleStartTotp = async () => {
        setError('');
        try {
            const response = await axios.post('/mfa/admin/totp/setup', {}, { withCredentials: true });
            setTotpSetup(response.data.data);
            setTotpCode('');
        } catch (err) {
            setError(err?.response?.data?.message || 'Could not start authenticator setup.');
        }
    };

    const handleEnableTotp = async (event) => {
        event.preventDefault();
        setError('');
        try {
            await axios.post('/mfa/admin/totp/enable', { code: totpCode }, { withCredentials: true });
            setTotpSetup(null);
            setTotpCode('');
            await loadStatus();
        } catch (err) {
            setError(err?.response?.data?.message || 'Could not enable authenticator app.');
        }
    };

    const handleDisableTotp = async (event) => {
        event.preventDefault();
        setError('');
        try {
            await axios.delete('/mfa/admin/totp', {
                withCredentials: true,
                data: { code: disableTotpCode },
            });
            setDisableTotpCode('');
            await loadStatus();
        } catch (err) {
            setError(err?.response?.data?.message || 'Could not disable authenticator app.');
        }
    };

    const handleAddPasskey = async () => {
        setError('');
        try {
            const optionsResponse = await axios.post('/mfa/admin/passkey/registration-options', {}, { withCredentials: true });
            const options = optionsResponse?.data?.data?.options;
            const credential = await startRegistration({ optionsJSON: options });
            await axios.post('/mfa/admin/passkey/register', {
                credential,
                nickname: passkeyName || null,
            }, {
                withCredentials: true,
            });
            setPasskeyName('');
            await loadStatus();
        } catch (err) {
            setError(err?.response?.data?.message || 'Could not register passkey.');
        }
    };

    const handleDeletePasskey = async (credentialId) => {
        setError('');
        try {
            await axios.delete(`/mfa/admin/passkeys/${encodeURIComponent(credentialId)}`, { withCredentials: true });
            await loadStatus();
        } catch (err) {
            setError(err?.response?.data?.message || 'Could not remove passkey.');
        }
    };

    if (loading) {
        return <div className="admin-mfa-settings">Loading admin security settings...</div>;
    }

    return (
        <div className="admin-mfa-settings">
            <h2>Admin Security (2FA)</h2>
            <p>
                MFA is scoped to your current tenant and is required for admin routes once enabled.
            </p>

            {error ? <p className="error">{error}</p> : null}

            <div className="section">
                <h3>Authenticator App</h3>
                <p>{status.totpEnabled ? 'Enabled' : 'Not enabled'}</p>
                {!status.totpEnabled && (
                    <button type="button" className="button active" onClick={handleStartTotp}>
                        Start setup
                    </button>
                )}
                {totpSetup && (
                    <div className="totp-setup">
                        <img src={totpSetup.qrCodeDataUrl} alt="Authenticator QR code" />
                        <form onSubmit={handleEnableTotp}>
                            <label htmlFor="totpCode">Enter 6-digit code</label>
                            <input
                                id="totpCode"
                                value={totpCode}
                                onChange={(event) => setTotpCode(event.target.value)}
                                placeholder="123456"
                                required
                            />
                            <button type="submit" className="button active">Enable authenticator app</button>
                        </form>
                    </div>
                )}
                {status.totpEnabled && (
                    <form onSubmit={handleDisableTotp}>
                        <label htmlFor="disableTotpCode">Code to disable authenticator app</label>
                        <input
                            id="disableTotpCode"
                            value={disableTotpCode}
                            onChange={(event) => setDisableTotpCode(event.target.value)}
                            placeholder="123456"
                            required
                        />
                        <button type="submit" className="button">Disable authenticator app</button>
                    </form>
                )}
            </div>

            <div className="section">
                <h3>Passkeys</h3>
                <p>{status.passkeyCount || 0} passkey(s) enrolled.</p>
                <div className="passkey-add">
                    <input
                        type="text"
                        value={passkeyName}
                        placeholder="Optional nickname (e.g., Work MacBook)"
                        onChange={(event) => setPasskeyName(event.target.value)}
                    />
                    <button type="button" className="button active" onClick={handleAddPasskey}>
                        Add passkey
                    </button>
                </div>
                <ul>
                    {(status.passkeys || []).map((passkey) => (
                        <li key={passkey.id}>
                            <div>
                                <strong>{passkey.nickname || 'Unnamed passkey'}</strong>
                                <span>{passkey.deviceType || 'unknown device'} · backed up: {String(passkey.backedUp)}</span>
                            </div>
                            <button type="button" className="button" onClick={() => handleDeletePasskey(passkey.id)}>
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default AdminMfaSettings;
