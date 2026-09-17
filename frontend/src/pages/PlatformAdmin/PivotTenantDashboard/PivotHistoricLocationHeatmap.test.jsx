import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PivotHistoricLocationHeatmap, { overlayFromFields } from './PivotHistoricLocationHeatmap';

const HEATMAP = {
  cols: 40,
  rows: 32,
  bounds: { north: 41, south: 40, east: -73, west: -75 },
  cityBounds: { north: 40.9, south: 40.1, east: -73.2, west: -74.8 },
  cells: [
    { x: 20, y: 16, count: 12 },
    { x: 21, y: 16, count: 3 },
  ],
  maxCount: 12,
  pointCount: 15,
  outsideCount: 2,
  unresolvedCount: 8,
  truncated: false,
};

function installGoogleMapsMock() {
  const maps = {
    Map: jest.fn(function Map() {
      this.fitBounds = jest.fn();
    }),
    Rectangle: jest.fn(function Rectangle() {
      this.setMap = jest.fn();
    }),
    Circle: jest.fn(function Circle() {
      this.setMap = jest.fn();
    }),
    LatLngBounds: jest.fn(function LatLngBounds() {}),
  };
  window.google = { maps };
  return maps;
}

describe('PivotHistoricLocationHeatmap', () => {
  beforeEach(() => {
    delete window.google;
  });

  it('reads a draft bounding box from the city-boundary form', () => {
    expect(overlayFromFields({
      mode: 'bounds',
      north: '40.9',
      south: '40.1',
      east: '-73.2',
      west: '-74.8',
    })).toEqual({
      bounds: { north: 40.9, south: 40.1, east: -73.2, west: -74.8 },
    });
    expect(overlayFromFields({ mode: 'bounds', north: '', south: '', east: '', west: '' }))
      .toBeNull();
  });

  it('draws historic density on a Google Map', async () => {
    const maps = installGoogleMapsMock();
    render(<PivotHistoricLocationHeatmap data={HEATMAP} />);

    expect(screen.getByRole('application', {
      name: /historic event location heatmap across every batch week/i,
    })).toBeInTheDocument();
    await waitFor(() => expect(maps.Map).toHaveBeenCalled());
    expect(maps.Map.mock.instances[0].fitBounds).toHaveBeenCalled();
    expect(maps.Rectangle).toHaveBeenCalled();
    expect(document.querySelector('img[src*="basemaps.cartocdn.com"]')).toBeNull();
    expect(screen.getByText(/resolved locations across every batch week/)).toBeInTheDocument();
  });
});
