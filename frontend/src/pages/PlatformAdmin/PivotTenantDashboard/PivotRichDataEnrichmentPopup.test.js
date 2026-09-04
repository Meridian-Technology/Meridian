jest.mock('../../../components/Popup/Popup', () => () => null);
jest.mock('../PivotLab/PivotImportThumb', () => () => null);

import { missingFields } from './PivotRichDataEnrichmentPopup';

describe('PivotRichDataEnrichmentPopup', () => {
  it('reports only description and image gaps', () => {
    expect(missingFields({})).toEqual(['description', 'image']);
    expect(missingFields({ description: 'Details', image: null })).toEqual(['image']);
    expect(missingFields({ description: '', image: 'https://example.com/a.jpg' })).toEqual([
      'description',
    ]);
    expect(missingFields({ missingRichData: [] })).toEqual([]);
  });
});
