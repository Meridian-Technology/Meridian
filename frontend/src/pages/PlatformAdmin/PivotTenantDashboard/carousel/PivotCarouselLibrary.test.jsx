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

describe('carousel grid', () => {
  test('empty city only offers New', () => {
    const onCreate = jest.fn();
    render(<PivotCarouselLibrary issues={[]} onOpen={() => {}} onCreate={onCreate} />);

    expect(screen.getByText('No carousels yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New carousel' }));
    expect(onCreate).toHaveBeenCalled();
  });

  test('fans every event image and can archive or delete a carousel', () => {
    const onOpen = jest.fn();
    const onArchive = jest.fn();
    const onDelete = jest.fn();
    const issues = [
      {
        ...ISSUES[1],
        previewImages: ['https://cdn.example/jazz.jpg', 'https://cdn.example/room.jpg', 'https://cdn.example/street.jpg'],
      },
      ISSUES[0],
    ];
    render(<PivotCarouselLibrary issues={issues} onOpen={onOpen} onCreate={() => {}} onArchive={onArchive} onDelete={onDelete} />);

    const jazz = screen.getByRole('button', { name: /jazz night/i });
    expect(jazz.querySelectorAll('img')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /lanterns/i }).querySelectorAll('img')).toHaveLength(1);
    fireEvent.click(jazz);
    expect(onOpen).toHaveBeenCalledWith('new');
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' })[0]);
    expect(onArchive).toHaveBeenCalledWith(issues[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);
    expect(onDelete).toHaveBeenCalledWith(issues[1]);
  });
});
