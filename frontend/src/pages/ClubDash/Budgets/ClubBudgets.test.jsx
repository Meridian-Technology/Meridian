import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ClubBudgets from './ClubBudgets';

jest.mock('../../../hooks/useFetch', () => ({
    useFetch: jest.fn(),
    authenticatedRequest: jest.fn()
}));

const { useFetch, authenticatedRequest } = require('../../../hooks/useFetch');

describe('ClubBudgets', () => {
    test('renders budgets and workflow history surfaces', async () => {
        authenticatedRequest.mockResolvedValue({ data: { success: true } });
        useFetch.mockImplementation((url) => {
            if (url && url.includes('/history')) {
                return {
                    data: {
                        data: {
                            workflowEvents: [{ _id: 'event-1', fromState: 'draft', toState: 'submitted', createdAt: new Date().toISOString() }],
                            reviews: [{ _id: 'review-1', action: 'approve', comment: 'Looks good' }]
                        }
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            if (url && url.includes('/revision-summary')) {
                return {
                    data: {
                        data: [
                            {
                                id: 'revision-1',
                                requestedDelta: 100,
                                approvedDelta: 50,
                                previousLineItemCount: 2,
                                newLineItemCount: 3
                            }
                        ]
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            if (url && url.includes('/workflow-context')) {
                return {
                    data: {
                        data: {
                            allowedNextStates: ['submitted', 'changes_requested'],
                            reviewActions: ['comment', 'approve'],
                            capabilities: { canApprove: true }
                        }
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            if (url && url.includes('/templates')) {
                return {
                    data: { data: [{ _id: 'template-1', name: 'General Template' }] },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            if (url && url.includes('/policy')) {
                return {
                    data: {
                        data: {
                            editableStates: ['draft', 'changes_requested'],
                            reviewActions: ['comment', 'approve'],
                            capabilities: { canApprove: true }
                        }
                    },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            if (url && url.includes('/review-queue')) {
                return {
                    data: { data: [{ _id: 'budget-1' }] },
                    loading: false,
                    refetch: jest.fn()
                };
            }
            return {
                data: {
                    data: [
                        { _id: 'budget-1', name: 'FY Budget', fiscalYear: '2026', state: 'draft', totalRequested: 1000, totalApproved: 500 }
                    ]
                },
                loading: false,
                refetch: jest.fn()
            };
        });

        render(<ClubBudgets orgId="org-1" />);
        expect(screen.getByText('Budgets')).toBeInTheDocument();
        expect(screen.getByText('FY Budget')).toBeInTheDocument();
        fireEvent.click(screen.getByText('FY Budget'));
        expect(screen.getByText('Workflow events')).toBeInTheDocument();
        expect(screen.getAllByText('Reviewer actions').length).toBeGreaterThan(0);
        expect(screen.getByText('Revision diff summaries')).toBeInTheDocument();
    });
});
