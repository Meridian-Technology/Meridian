import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GradientHeader from '../../../assets/Gradients/ApprovalGrad.png';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import OnboardingBuilder from '../../../components/OnboardingBuilder/OnboardingBuilder';
import './TenantOnboarding.scss';

function TenantOnboarding() {
  const [mutationError, setMutationError] = useState(null);
  const [saveState, setSaveState] = useState({ saving: false, savedAt: null });
  const [tenantSteps, setTenantSteps] = useState([]);

  const {
    data: tenantOnboardingResponse,
    loading: tenantOnboardingLoading,
    error: tenantOnboardingFetchError,
    refetch: refetchTenantOnboardingConfig,
  } = useFetch('/admin/tenant-onboarding-config');

  useEffect(() => {
    const incoming = tenantOnboardingResponse?.success ? (tenantOnboardingResponse.data?.config?.steps || []) : [];
    setTenantSteps(Array.isArray(incoming) ? incoming : []);
  }, [tenantOnboardingResponse]);

  const templateLibrary = useMemo(
    () => (tenantOnboardingResponse?.success ? (tenantOnboardingResponse.data?.templateLibrary || []) : []),
    [tenantOnboardingResponse]
  );

  const saveTenantConfig = useCallback(async () => {
    setSaveState((prev) => ({ ...prev, saving: true }));
    setMutationError(null);

    const { data, error } = await authenticatedRequest('/admin/tenant-onboarding-config', {
      method: 'PUT',
      data: { config: { steps: tenantSteps } },
      headers: { 'Content-Type': 'application/json' },
    });

    setSaveState((prev) => ({ ...prev, saving: false }));

    if (error) {
      setMutationError(data?.message || error);
      return;
    }

    if (data?.success) {
      const nextSteps = data?.data?.config?.steps || [];
      setTenantSteps(Array.isArray(nextSteps) ? nextSteps : []);
      setSaveState({ saving: false, savedAt: new Date().toISOString() });
      refetchTenantOnboardingConfig();
    } else {
      setMutationError(data?.message || 'Failed to save tenant onboarding config.');
    }
  }, [refetchTenantOnboardingConfig, tenantSteps]);

  const error = tenantOnboardingFetchError || mutationError;

  return (
    <div className="tenant-onboarding-page general">
      <img src={GradientHeader} alt="" className="grad" />
      <div className="simple-header">
        <h1>Tenant Onboarding</h1>
        <p className="sub">Configure onboarding fields specific to this tenant from the root dashboard.</p>
      </div>

      <div className="general-content">
        {error && <div className="tenant-onboarding-error">{error}</div>}
        {tenantOnboardingLoading ? (
          <p>Loading tenant onboarding configuration...</p>
        ) : (
          <OnboardingBuilder
            value={tenantSteps}
            onChange={setTenantSteps}
            context="tenant"
            templateLibrary={templateLibrary}
          />
        )}

        <div className="tenant-onboarding-actions">
          <button type="button" onClick={saveTenantConfig} disabled={saveState.saving || tenantOnboardingLoading}>
            {saveState.saving ? 'Saving tenant onboarding...' : 'Save tenant onboarding configuration'}
          </button>
          {saveState.savedAt && <p>Saved at {new Date(saveState.savedAt).toLocaleTimeString()}.</p>}
        </div>
      </div>
    </div>
  );
}

export default TenantOnboarding;
