import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AdminBudgetPermissions from './AdminBudgetPermissions';

jest.mock('../../../../hooks/useFetch', () => ({
    useFetch: jest.fn(),
    authenticatedRequest: jest.fn()
}));

const { useFetch, authenticatedRequest } = require('../../../../hooks/useFetch');

describe('AdminBudgetPermissions', () => {
    test('renders admin list and permission controls', async () => {
        authenticatedRequest.mockResolvedValue({
            data: {
                data: {
                    permissions: ['review_budget']
                }
            }
        });
        useFetch.mockImplementation((url) => {
            if (url === '/admin/platform-admins') {
                return {
                    data: {
                        data: [{ globalUserId: 'global-1', name: 'Admin User', email: 'admin@example.com' }]
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            if (url === '/admin/permission-catalog') {
                return {
                    data: {
                        data: {
                            permissions: ['review_budget', 'approve_budget']
                        }
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            return { data: {}, loading: false, refetch: jest.fn() };
        });

        render(<AdminBudgetPermissions />);
        await act(async () => {
            fireEvent.change(screen.getByLabelText('Admin user'), { target: { value: 'global-1' } });
        });
        expect(await screen.findByRole('heading', { name: 'Admin User' })).toBeInTheDocument();
        expect(screen.getByText('review_budget')).toBeInTheDocument();
    });
});
