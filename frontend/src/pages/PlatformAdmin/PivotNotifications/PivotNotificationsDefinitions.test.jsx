import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotNotificationDefinitionEditor from './PivotNotificationDefinitionEditor';
import {
  parseTriggerConfigJson,
  validateThirtyMinuteCron,
  cronFromScheduleParts,
  isSingleClockSchedule,
} from './notificationDefinitionCron';

const mockUseFetch = jest.fn();
const mockAuthenticatedRequest = jest.fn();
const mockAddNotification = jest.fn();

jest.mock('../../../hooks/useFetch', () => ({
  useFetch: (...args) => mockUseFetch(...args),
  authenticatedRequest: (...args) => mockAuthenticatedRequest(...args),
}));

jest.mock('../../../NotificationContext', () => ({
  useNotification: () => ({ addNotification: mockAddNotification }),
}));

jest.mock('../../../components/PivotOps', () => ({
  PivotOpsSection: ({ title, description, children }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

const handlers = {
  success: true,
  data: [
    { handlerKey: 'weekly_drop', category: 'notification' },
    { handlerKey: 'ritual_crew_scan', category: 'notification' },
  ],
};

const fleetDefinition = {
  id: 'def-1',
  definitionKey: 'ritual_crew_scan',
  handlerKey: 'ritual_crew_scan',
  tenantKey: null,
  enabled: true,
  scheduleCron: '0,30 * * * *',
  copyTitleKey: 'notifications.ritual.title',
  copyBodyKey: 'notifications.ritual.body',
  triggerConfig: { lookbackHours: 6 },
};

const tenants = [
  { tenantKey: 'sf', location: 'San Francisco' },
  { tenantKey: 'nyc', location: 'New York' },
];

function stubFetches({ merged, catalog = null, layers = null } = {}) {
  mockUseFetch.mockImplementation((url) => {
    const path = String(url || '');
    if (path.includes('/admin/meridian/jobs/handlers')) {
      return {
        data: handlers,
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (path.includes('/admin/meridian/jobs/notification-rule-catalog')) {
      const crew = path.includes('ritual_crew_scan');
      return {
        data: {
          success: true,
          data: {
            handlerKey: crew ? 'ritual_crew_scan' : 'weekly_drop',
            attributes: crew
              ? [{ key: 'quorumMet', label: 'Quorum met', type: 'boolean' }]
              : [],
            operators: {
              boolean: [{ key: 'is', label: 'is' }],
              number: [{ key: 'is', label: 'is' }],
              enum: [{ key: 'is', label: 'is' }],
            },
            outcomes: crew ? ['unfinished_swipe', 'consensus'] : ['send'],
            defaultRules: crew
              ? [{
                outcome: 'unfinished_swipe',
                conditions: [{ attribute: 'quorumMet', operator: 'is', value: false }],
              }]
              : [],
          },
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (path.includes('/admin/pivot/copy/catalog')) {
      return {
        data: catalog,
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (path.includes('/admin/pivot/copy')) {
      return {
        data: layers,
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    if (path.includes('/admin/meridian/jobs/definitions/')) {
      return {
        data: merged || { success: true, data: fleetDefinition },
        loading: false,
        error: null,
        refetch: jest.fn(),
      };
    }
    return { data: null, loading: false, error: null, refetch: jest.fn() };
  });
}

describe('notificationDefinitionCron', () => {
  it('rejects cron minutes that are not 0 or 30 and accepts 30-minute schedules', () => {
    expect(validateThirtyMinuteCron('15 * * * *').error).toMatch(/minute must be 0 or 30/);
    expect(validateThirtyMinuteCron('* * * * *').error).toMatch(/minute must be 0 or 30/);
    expect(validateThirtyMinuteCron('0,30 * * * *').ok).toBe(true);
    expect(validateThirtyMinuteCron('*/30 * * * *').ok).toBe(true);
    expect(cronFromScheduleParts({
      minute: '0',
      hour: '18',
      dayOfMonth: '*',
      month: '*',
      weekday: '5',
    })).toBe('0 18 * * 5');
    expect(isSingleClockSchedule({
      minute: '0',
      hour: '18',
      dayOfMonth: '*',
      month: '*',
      weekday: '4',
    })).toBe(true);
    expect(isSingleClockSchedule({
      minute: '0,30',
      hour: '8-21',
      dayOfMonth: '*',
      month: '*',
      weekday: '*',
    })).toBe(false);
  });

  it('surfaces triggerConfig JSON validation errors', () => {
    expect(parseTriggerConfigJson('{').error).toMatch(/not valid JSON/);
    expect(parseTriggerConfigJson('[1]').error).toMatch(/JSON object/);
    expect(parseTriggerConfigJson('{"lookbackHours":6}').value).toEqual({ lookbackHours: 6 });
  });
});

describe('PivotNotificationDefinitionEditor', () => {
  let view;

  afterEach(() => {
    view?.unmount();
    view = undefined;
    jest.clearAllMocks();
  });

  it('creates a fleet definition with copy keys and triggerConfig', async () => {
    stubFetches();
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: { ...fleetDefinition, definitionKey: 'crew_ping' } },
    });
    const onSaved = jest.fn();

    view = render(
      <PivotNotificationDefinitionEditor
        definition={null}
        tenants={tenants}
        onCancel={jest.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText('Definition key'), {
      target: { value: 'crew_ping' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Definition handler')).toHaveValue('ritual_crew_scan');
    });
    fireEvent.change(screen.getByLabelText('Definition handler'), {
      target: { value: 'weekly_drop' },
    });
    fireEvent.change(screen.getByLabelText('Definition minute'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Definition hour'), {
      target: { value: '18' },
    });
    fireEvent.change(screen.getByLabelText('Definition weekday'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/meridian/jobs/definitions',
        expect.objectContaining({
          method: 'POST',
          data: expect.objectContaining({
            definitionKey: 'crew_ping',
            handlerKey: 'weekly_drop',
            tenantKey: null,
            enabled: true,
            scheduleCron: '0 18 * * 5',
            copyTitleKey: 'notifications.weeklyDrop.title',
            copyBodyKey: 'notifications.weeklyDrop.body',
            copyTitleFallback: null,
            copyBodyFallback: null,
            triggerConfig: { quietHours: { startHour: 22, endHour: 8 } },
            rules: [],
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('edits a single send time as a day and a clock', async () => {
    stubFetches();
    const weekly = {
      id: 'def-week',
      definitionKey: 'weekly_drop',
      handlerKey: 'weekly_drop',
      tenantKey: null,
      enabled: true,
      scheduleCron: '0 18 * * 4',
      copyTitleKey: 'notifications.weeklyDrop.title',
      copyBodyKey: 'notifications.weeklyDrop.body',
      rules: [],
    };
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: weekly },
    });

    view = render(
      <PivotNotificationDefinitionEditor
        definition={weekly}
        tenants={tenants}
        startCondensed
        onCancel={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(await screen.findByText('Thursdays at 6:00 PM')).toBeInTheDocument();
    expect(screen.getByLabelText('Definition time')).toHaveValue('18:00');
    expect(screen.getByRole('button', { name: 'Thursday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Definition hour')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
    fireEvent.change(screen.getByLabelText('Definition time'), { target: { value: '19:30' } });
    expect(screen.getByText('Fridays at 7:30 PM')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/meridian/jobs/definitions/def-week',
        expect.objectContaining({
          method: 'PATCH',
          data: expect.objectContaining({ scheduleCron: '30 19 * * 5' }),
        }),
      );
    });
  });

  it('writes edited title and body into the platform voice pack', async () => {
    stubFetches({
      catalog: {
        success: true,
        data: {
          keys: [
            {
              path: 'notifications.ritual.title',
              kind: 'string',
              params: [],
              shipped: 'just go*',
            },
            {
              path: 'notifications.ritual.body',
              kind: 'string',
              params: [],
              shipped: 'your {group.singular} is waiting on swipes',
              usesTokens: true,
            },
          ],
          tokens: [{ name: 'group.singular', shipped: 'crew' }],
        },
      },
      layers: {
        success: true,
        data: { entries: {}, tokens: {}, revision: 1 },
      },
    });
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: fleetDefinition },
    });

    view = render(
      <PivotNotificationDefinitionEditor
        definition={fleetDefinition}
        tenants={tenants}
        onCancel={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    const title = await screen.findByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('just go*');
    expect(screen.getByRole('textbox', { name: 'Body' })).toHaveValue(
      'your {group.singular} is waiting on swipes',
    );
    fireEvent.change(title, { target: { value: 'heads up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/pivot/copy',
        expect.objectContaining({
          method: 'PATCH',
          data: {
            entries: { 'notifications.ritual.title': 'heads up' },
          },
        }),
      );
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/meridian/jobs/definitions/def-1',
        expect.objectContaining({
          method: 'PATCH',
          data: expect.objectContaining({
            copyTitleKey: 'notifications.ritual.title',
            copyBodyKey: 'notifications.ritual.body',
          }),
        }),
      );
    });
  });

  it('shows a validation error for a quiet hour outside 0 to 23 and does not POST', async () => {
    stubFetches();
    view = render(
      <PivotNotificationDefinitionEditor
        definition={null}
        tenants={tenants}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Definition key'), {
      target: { value: 'crew_ping' },
    });
    fireEvent.change(screen.getByLabelText('Quiet hours start'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quiet hours start must be an hour from 0 to 23',
    );
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('rejects advanced cron minutes that are not 0 or 30', async () => {
    stubFetches();
    view = render(
      <PivotNotificationDefinitionEditor
        definition={null}
        tenants={tenants}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Definition key'), {
      target: { value: 'crew_ping' },
    });
    fireEvent.click(screen.getByLabelText('Definition advanced cron'));
    fireEvent.change(screen.getByLabelText('Definition cron'), {
      target: { value: '15 * * * *' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('scheduleCron minute must be 0 or 30');
    expect(mockAuthenticatedRequest).not.toHaveBeenCalled();
  });

  it('saves a tenant enabled override for a fleet template', async () => {
    stubFetches({
      merged: {
        success: true,
        data: {
          ...fleetDefinition,
          enabled: true,
          overrideApplied: false,
          overriddenFields: [],
        },
      },
    });
    mockAuthenticatedRequest.mockResolvedValue({
      data: { success: true, data: [{ definitionKey: 'ritual_crew_scan', enabled: false }] },
    });

    view = render(
      <PivotNotificationDefinitionEditor
        definition={fleetDefinition}
        tenants={tenants}
        onCancel={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Override tenant'), {
      target: { value: 'nyc' },
    });
    fireEvent.click(screen.getByLabelText('Override enabled'));
    fireEvent.click(screen.getByLabelText('Override enabled value'));
    fireEvent.click(screen.getByRole('button', { name: 'Save city override' }));

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/admin/platform/tenants/nyc/meridian/jobs/definitions/ritual_crew_scan/override',
        expect.objectContaining({
          method: 'PUT',
          data: {
            definitionKey: 'ritual_crew_scan',
            enabled: false,
          },
        }),
      );
    });
    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Tenant override saved' }),
      );
    });
  });
});
