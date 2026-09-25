import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PivotCarouselFrame from './PivotCarouselFrame';

test('a pinned studio revision renders at export size without editor controls', async () => {
  const payload = {
    success: true,
    data: {
      deck: {
        schemaVersion: 2,
        document: {
          schemaVersion: 2,
          width: 1080,
          height: 1350,
          slides: [{
            id: 's',
            width: 1080,
            height: 1350,
            elements: [{ id: 't', kind: 'text', text: 'queued copy', frame: { x: 40, y: 40, width: 400, height: 80 } }],
          }],
        },
      },
    },
  };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => payload }));
  render(
    <MemoryRouter initialEntries={['/carousel-export/507f1f77bcf86cd799439011/1?token=pin']}>
      <Routes>
        <Route path="/carousel-export/:deckId/:index" element={<PivotCarouselFrame />} />
      </Routes>
    </MemoryRouter>,
  );
  const root = await screen.findByText('queued copy');
  await waitFor(() => expect(document.querySelector('[data-schema-version="2"]')).toHaveAttribute('data-ready', '1'));
  expect(root.closest('[data-export-root]')).toHaveAttribute('data-slide-width', '1080');
  expect(document.querySelector('[data-handle]')).not.toBeInTheDocument();
});
