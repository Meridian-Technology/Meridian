import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { JustGoClipFallback } from './justGoHostRoutes';

jest.mock('./JustGoLanding', () => () => null);

function Landed() {
  const location = useLocation();
  return <p data-testid="landed">{`${location.pathname}${location.search}`}</p>;
}

function renderClip(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clip/:tenantKey/*" element={<JustGoClipFallback />} />
        <Route path="*" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JustGoClipFallback', () => {
  it('sends App Clip links to the city page and keeps the invite ref', () => {
    renderClip('/clip/sf/booth-1?ref=ABC123');
    expect(screen.getByTestId('landed')).toHaveTextContent('/sf?ref=ABC123');
  });

  it('falls back to the home page for reserved or empty slugs', () => {
    renderClip('/clip/qr');
    expect(screen.getByTestId('landed')).toHaveTextContent(/^\/$/);
  });
});
