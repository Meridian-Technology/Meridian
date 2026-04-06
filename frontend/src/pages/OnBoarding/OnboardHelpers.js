import apiRequest from '../../utils/postRequest';

const getOnboardingConfig = async () => {
    return apiRequest('/onboarding-config', null, { method: 'GET' });
};

const searchOnboardingProfiles = async (type, query = '', limit = 12) => {
    return apiRequest('/onboarding-profile', null, {
        method: 'GET',
        params: { type, query, limit },
    });
};

// Backward-compatible alias for earlier imports.
const searchOnboardingEntities = searchOnboardingProfiles;

const submitOnboarding = async ({ responses, pictureFile }) => {
    const body = new FormData();
    body.append('responses', JSON.stringify(responses || {}));
    if (pictureFile) {
        body.append('picture', pictureFile);
    }
    return apiRequest('/submit-onboarding', body, { method: 'POST' });
};

export {
    getOnboardingConfig,
    searchOnboardingProfiles,
    searchOnboardingEntities,
    submitOnboarding,
};
