import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PivotCarouselLibrary from './PivotCarouselLibrary';

const ISSUES = [
  {
    _id: 'old',
    name: 'Lanterns',
    coverImage: 'https://cdn.example/lanterns.jpg',
    updatedAt: '2026-09-01T00:00:00.000Z',
    status: 'active',
  },
  {
    _id: 'new',
    name: 'Jazz night',
    coverImage: 'https://cdn.example/jazz.jpg',
    updatedAt: '2026-09-20T00:00:00.000Z',
    status: 'active',
  },
];

describe('carousel issue list', () => {
  test('empty city only offers New', () => {
    const onCreate = jest.fn();
    render(<PivotCarouselLibrary issues={[]} onOpen={() => {}} onCreate={onCreate} />);

    expect(screen.getByText('No issues yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue previous/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onCreate).toHaveBeenCalled();
  });

  test('shows continue previous and the rest of the past issues', () => {
    const onOpen = jest.fn();
    const onCreate = jest.fn();
    render(<PivotCarouselLibrary issues={ISSUES} onOpen={onOpen} onCreate={onCreate} />);

    expect(screen.getByRole('button', { name: /continue previous/i })).toHaveTextContent('Jazz night');
    expect(screen.getByRole('button', { name: /lanterns/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Assign existing decks')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue previous/i }));
    expect(onOpen).toHaveBeenCalledWith('new');

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
