import { EDITORIAL_STORIES } from './coverLabEditorialData';

export const CUTOUT_DIRECTIONS = [
  { id: 'j', name: 'Loose letters', descriptor: 'One headline. One breath.', description: 'A close-set headline sits at the centre of an edge-to-edge photograph. Cream lettering and rich photographic colour repeat across every issue. The letterforms stay playful; the reading order stays together.', rule: 'Full-colour photography + cream. Keep every headline in one central group; vary its scale and the photo crop.' },
  { id: 'k', name: 'Open invitation', descriptor: 'Different windows. The same JustGo orange.', description: 'A rough circle, doorway, or angled oval changes the silhouette. Vivid JustGo orange and cream headlines anchor every issue, while full-colour photography brings the scene to life. The whole title sits together over the middle of the cutout.', rule: 'JustGo orange + cream + full-colour photography. Change the aperture, not the palette. Keep supporting copy on one quiet line.' },
  { id: 'l', name: 'Kept somewhere', descriptor: 'One ink, a few scraps of paper.', description: 'Clean cream stock, bright orange lettering, and full-colour photo prints. A light grain keeps the tactile zine feel. A compact headline crosses the middle of the prints on paper strips. Different crops and arrangements give each issue character without changing its visual family.', rule: 'Cream + JustGo orange ink. Keep the title grouped at the centre; vary the physical arrangement of the prints.' },
];
export const CUTOUT_COVERS = EDITORIAL_STORIES.slice(0, 3).flatMap((story, index) =>
  CUTOUT_DIRECTIONS.map((direction) => ({ id: `${direction.id}${index + 1}`, direction: direction.id, story, name: story.label })),
);
export const CUTOUT_GRID_ORDER = ['j1', 'k2', 'l3', 'l2', 'j3', 'k1', 'k3', 'l1', 'j2'];
