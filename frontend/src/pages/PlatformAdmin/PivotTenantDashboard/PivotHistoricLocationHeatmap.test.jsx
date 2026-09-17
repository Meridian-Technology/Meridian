import React from 'react';
import { render, screen } from '@testing-library/react';
import PivotHistoricLocationHeatmap, {
  overlayFromFields,
  projectBoundsRect,
  projectLngLat,
} from './PivotHistoricLocationHeatmap';

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

describe('PivotHistoricLocationHeatmap', () => {
  it('projects longitude east and latitude south into SVG space', () => {
    expect(projectLngLat(
      { latitude: 41, longitude: -75 },
      HEATMAP.bounds,
      40,
      32,
    )).toEqual({ x: 0, y: 0 });
    expect(projectLngLat(
      { latitude: 40, longitude: -73 },
      HEATMAP.bounds,
      40,
      32,
    )).toEqual({ x: 40, y: 32 });
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

  it('renders historic density without tying it to a batch week', () => {
    render(<PivotHistoricLocationHeatmap data={HEATMAP} />);

    expect(screen.getByRole('img', {
      name: /historic event location heatmap across every batch week/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/resolved locations across every batch week/)).toBeInTheDocument();
    expect(screen.getByText(/outside the current city boundary/)).toBeInTheDocument();
    expect(screen.getByText(/still without coordinates/)).toBeInTheDocument();
    expect(projectBoundsRect(HEATMAP.cityBounds, HEATMAP.bounds, 40, 32).width)
      .toBeGreaterThan(0);
  });
});
