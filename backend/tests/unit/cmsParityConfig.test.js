const { validateParityConfig } = require('../../services/tenantConfigService');

describe('validateParityConfig', () => {
  const baseConfig = {
    profile: 'cmsParity',
    modules: {
      governance: true,
      finance: true,
      inventory: true,
      reporting: true
    },
    orgLifecycle: {
      allowedStatuses: ['pending', 'approved', 'active', 'archived'],
      defaultStatus: 'approved',
      transitions: {
        pending: ['approved'],
        approved: ['active'],
        active: ['archived'],
        archived: []
      }
    },
    governance: {
      documentLabel: 'Constitution',
      allowVersioning: true,
      requireApprovalForDocumentPublish: false,
      officerTermsEnabled: true,
      documentStatuses: ['draft', 'pending_review', 'published', 'archived']
    },
    finance: {
      workflowStates: ['draft', 'submitted', 'approved'],
      transitions: {
        draft: ['submitted'],
        submitted: ['approved'],
        approved: []
      },
      reviewActions: ['comment', 'approve'],
      accountingDimensions: [
        { key: 'fund', label: 'Fund', required: true }
      ]
    },
    inventory: {
      enabled: true,
      allowCheckout: true,
      requireConditionOnReturn: true,
      lifecycleStatuses: ['active', 'maintenance', 'archived'],
      conditions: ['new', 'good', 'fair']
    },
    reporting: {
      defaultExports: ['csv', 'json'],
      searchEntities: ['orgs', 'budgets'],
      adminSummaryCards: ['orgs', 'budgets']
    }
  };

  test('accepts valid parity config', () => {
    expect(() => validateParityConfig(baseConfig)).not.toThrow();
  });

  test('rejects finance dimensions missing required flag', () => {
    const invalid = JSON.parse(JSON.stringify(baseConfig));
    delete invalid.finance.accountingDimensions[0].required;
    expect(() => validateParityConfig(invalid)).toThrow(/required/);
  });
});
