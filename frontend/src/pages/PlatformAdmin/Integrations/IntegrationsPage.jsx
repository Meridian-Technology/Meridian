import React, { useCallback } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import GrokbotConnectorCard from './GrokbotConnectorCard';
import GrokbotWebhookCard from './GrokbotWebhookCard';
import '../TenantManagement/TenantManagementPage.scss';
import './IntegrationsPage.scss';

const NO_CACHE = { enabled: false };

function IntegrationsPage() {
  const { addNotification } = useNotification();
  const { data, loading, error, refetch } = useFetch('/admin/platform/integrations/grokbot', {
    cache: NO_CACHE,
  });
  const settings = data?.success ? data.data : null;

  const copy = useCallback(
    async (text, what) => {
      try {
        await navigator.clipboard.writeText(text);
        addNotification({ title: 'Copied', message: `${what} copied to clipboard.`, type: 'success' });
      } catch {
        addNotification({ title: 'Copy failed', message: `Could not copy the ${what.toLowerCase()}.`, type: 'error' });
      }
    },
    [addNotification],
  );

  return (
    <div className="platform-admin-integrations linear-admin">
      <header className="platform-admin-integrations__header">
        <h1 className="platform-admin-integrations__title">Integrations</h1>
        <p className="platform-admin-integrations__lede">
          Grokbot reads and queues carousel drafts through its connector, and Meridian tells it when a
          job finishes through its webhook. Changes here need a session that passed admin MFA.
        </p>
      </header>

      {error ? (
        <p className="platform-admin-integrations__error" role="alert">
          {typeof error === 'string' ? error : 'Unable to load integration settings.'}
        </p>
      ) : null}

      <GrokbotConnectorCard serverUrl={settings?.mcpServerUrl || ''} onCopy={copy} />
      <GrokbotWebhookCard settings={settings} loading={loading} onChanged={refetch} />
    </div>
  );
}

export default IntegrationsPage;
