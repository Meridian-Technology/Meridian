const SIGNUP_OPTIONS = ['all', 'email', 'google', 'apple', 'saml'];

const ONBOARDING_STEP_TYPES = [
  'short_text',
  'long_text',
  'number',
  'single_select',
  'multi_select',
  'picture_upload',
  'template_follow_orgs',
  'template_add_friends',
];

const TENANT_TEMPLATE_LIBRARY = [
  {
    id: 'template_follow_orgs',
    label: 'Follow Organizations',
    description: 'Let users pick campus organizations to follow right away.',
    step: {
      id: 'follow-orgs',
      key: 'follow_orgs',
      type: 'template_follow_orgs',
      title: 'Follow organizations you care about',
      description: 'Select organizations to personalize your feed.',
      required: false,
    },
  },
  {
    id: 'template_add_friends',
    label: 'Add Friends',
    description: 'Prompt users to send a few initial friend requests.',
    step: {
      id: 'add-friends',
      key: 'add_friends',
      type: 'template_add_friends',
      title: 'Connect with friends',
      description: 'Search for classmates and send friend requests.',
      required: false,
    },
  },
];

const DEFAULT_PLATFORM_ONBOARDING = {
  defaults: [
    {
      id: 'name',
      key: 'name',
      type: 'short_text',
      title: 'What should we call you?',
      description: 'This name is shown to other users across Meridian.',
      placeholder: 'Your display name',
      required: true,
    },
    {
      id: 'picture',
      key: 'picture',
      type: 'picture_upload',
      title: 'Add a profile picture',
      description: 'Optional, but helps others recognize you.',
      required: false,
    },
  ],
  bySignupOption: {
    all: [],
    email: [],
    google: [],
    apple: [],
    saml: [],
  },
};

function toSlug(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function toStepId(rawId, fallback) {
  const cleaned = String(rawId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

function normalizeOptions(rawOptions) {
  const values = Array.isArray(rawOptions) ? rawOptions : [];
  const normalized = values
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'string') {
        const label = entry.trim();
        if (!label) return null;
        return { value: toSlug(label, `option_${Date.now()}`), label };
      }
      const label = String(entry.label || entry.value || '').trim();
      if (!label) return null;
      const value = toSlug(entry.value || label, `option_${Date.now()}`);
      return { value, label };
    })
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  normalized.forEach((option) => {
    if (seen.has(option.value)) return;
    seen.add(option.value);
    deduped.push(option);
  });
  return deduped.slice(0, 50);
}

function sanitizeStep(rawStep = {}, options = {}) {
  const { allowTemplates = true } = options;
  const fallback = `step_${Date.now().toString(36)}`;
  const type = ONBOARDING_STEP_TYPES.includes(rawStep.type) ? rawStep.type : 'short_text';
  const isTemplateType = type === 'template_follow_orgs' || type === 'template_add_friends';

  if (isTemplateType && !allowTemplates) {
    return null;
  }

  const key = toSlug(rawStep.key || rawStep.id || rawStep.title, fallback);
  const title = String(rawStep.title || rawStep.key || 'Untitled step').trim().slice(0, 120);
  const step = {
    id: toStepId(rawStep.id, key),
    key,
    type,
    title,
    description: String(rawStep.description || '').trim().slice(0, 300),
    placeholder: String(rawStep.placeholder || '').trim().slice(0, 180),
    required: Boolean(rawStep.required),
  };

  if (type === 'single_select' || type === 'multi_select') {
    step.options = normalizeOptions(rawStep.options);
    if (step.options.length === 0) {
      return null;
    }
    if (type === 'multi_select') {
      const maxSelections = Number(rawStep.maxSelections);
      if (Number.isFinite(maxSelections) && maxSelections > 0) {
        step.maxSelections = Math.min(Math.floor(maxSelections), 20);
      }
    }
  }

  if (isTemplateType) {
    step.templateKey = type === 'template_follow_orgs' ? 'follow_orgs' : 'add_friends';
  }

  return step;
}

function ensureUniqueStepIds(steps = []) {
  const used = new Set();
  return steps.map((step) => {
    let candidate = step.id || step.key || `step_${Date.now().toString(36)}`;
    let counter = 1;
    while (used.has(candidate)) {
      candidate = `${step.id || step.key}-${counter++}`;
    }
    used.add(candidate);
    return { ...step, id: candidate };
  });
}

function sanitizePlatformOnboardingConfig(rawConfig = null) {
  const defaultsRaw = Array.isArray(rawConfig?.defaults) ? rawConfig.defaults : [];
  const defaults = ensureUniqueStepIds(
    defaultsRaw
      .map((step) => sanitizeStep(step, { allowTemplates: false }))
      .filter(Boolean)
  );

  const bySignupOption = {};
  SIGNUP_OPTIONS.forEach((option) => {
    const rawSteps = Array.isArray(rawConfig?.bySignupOption?.[option]) ? rawConfig.bySignupOption[option] : [];
    bySignupOption[option] = ensureUniqueStepIds(
      rawSteps
        .map((step) => sanitizeStep(step, { allowTemplates: false }))
        .filter(Boolean)
    );
  });

  return { defaults, bySignupOption };
}

function getPlatformOnboardingConfig(rawConfig = null) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return DEFAULT_PLATFORM_ONBOARDING;
  }
  const sanitized = sanitizePlatformOnboardingConfig(rawConfig);
  const hasAnyConfiguredStep =
    sanitized.defaults.length > 0 ||
    SIGNUP_OPTIONS.some((option) => (sanitized.bySignupOption[option] || []).length > 0);
  if (!hasAnyConfiguredStep) {
    return DEFAULT_PLATFORM_ONBOARDING;
  }
  return sanitized;
}

function sanitizeTenantOnboardingConfig(rawConfig = null) {
  const stepsRaw = Array.isArray(rawConfig?.steps) ? rawConfig.steps : [];
  const steps = ensureUniqueStepIds(
    stepsRaw
      .map((step) => sanitizeStep(step, { allowTemplates: true }))
      .filter(Boolean)
  );
  return { steps };
}

function detectSignupOption(user) {
  if (!user) return 'email';
  if (user.googleId) return 'google';
  if (user.appleId) return 'apple';
  if (user.samlId || user.samlProvider) return 'saml';
  return 'email';
}

function resolveOnboardingSteps(platformConfig, tenantConfig, signupOption = 'email') {
  const normalizedPlatform = getPlatformOnboardingConfig(platformConfig);
  const normalizedTenant = sanitizeTenantOnboardingConfig(tenantConfig);
  const signupKey = SIGNUP_OPTIONS.includes(signupOption) ? signupOption : 'email';

  const merged = [
    ...(normalizedPlatform.defaults || []),
    ...(normalizedPlatform.bySignupOption?.all || []),
    ...(normalizedPlatform.bySignupOption?.[signupKey] || []),
    ...(normalizedTenant.steps || []),
  ];

  return ensureUniqueStepIds(merged);
}

module.exports = {
  SIGNUP_OPTIONS,
  ONBOARDING_STEP_TYPES,
  TENANT_TEMPLATE_LIBRARY,
  DEFAULT_PLATFORM_ONBOARDING,
  sanitizeStep,
  sanitizePlatformOnboardingConfig,
  getPlatformOnboardingConfig,
  sanitizeTenantOnboardingConfig,
  detectSignupOption,
  resolveOnboardingSteps,
};
