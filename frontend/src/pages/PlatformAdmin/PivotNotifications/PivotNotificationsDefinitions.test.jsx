import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PivotNotificationDefinitionEditor from './PivotNotificationDefinitionEditor';
import {
  parseTriggerConfigJson,
  validateThirtyMinuteCron,
  cronFromScheduleParts,
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

function stubFetches({ merged } = {}) {
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
    fireEvent.change(screen.getByLabelText('Copy title key'), {
      target: { value: 'notifications.weekly.title' },
    });
    fireEvent.change(screen.getByLabelText('Copy body key'), {
      target: { value: 'notifications.weekly.body' },
    });
    fireEvent.change(screen.getByLabelText('triggerConfig JSON'), {
      target: { value: '{"lookbackHours":4}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create definition' }));

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
            copyTitleKey: 'notifications.weekly.title',
            copyBodyKey: 'notifications.weekly.body',
            triggerConfig: { lookbackHours: 4 },
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows a validation error for invalid triggerConfig JSON and does not POST', async () => {
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
    fireEvent.change(screen.getByLabelText('triggerConfig JSON'), {
      target: { value: '{not-json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create definition' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('triggerConfig is not valid JSON');
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
    fireEvent.click(screen.getByRole('button', { name: 'Create definition' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Save tenant override' }));

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
