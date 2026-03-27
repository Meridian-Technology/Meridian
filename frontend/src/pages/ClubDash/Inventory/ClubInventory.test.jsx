import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ClubInventory from './ClubInventory';

jest.mock('../../../hooks/useFetch', () => ({
    useFetch: jest.fn(),
    authenticatedRequest: jest.fn(() => Promise.resolve({ data: { success: true } }))
}));

const { useFetch } = require('../../../hooks/useFetch');

describe('ClubInventory', () => {
    test('renders inventory list and item lifecycle section', () => {
        useFetch.mockImplementation((url) => {
            if (url && url.includes('/items')) {
                return {
                    data: {
                        data: [
                            {
                                _id: 'item-1',
                                name: 'Speaker',
                                description: 'PA speaker',
                                quantity: 2,
                                checkedOutQuantity: 1,
                                condition: 'good',
                                lifecycleStatus: 'active'
                            }
                        ]
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            return {
                data: {
                    data: [{ _id: 'inventory-1', name: 'A/V', description: 'Audio Visual' }]
                },
                loading: false,
                refetch: jest.fn()
            };
        });

        render(<ClubInventory orgId="org-1" />);
        fireEvent.click(screen.getByText('A/V'));
        expect(screen.getByText('Item lifecycle')).toBeInTheDocument();
        expect(screen.getByText('Speaker')).toBeInTheDocument();
    });
});
