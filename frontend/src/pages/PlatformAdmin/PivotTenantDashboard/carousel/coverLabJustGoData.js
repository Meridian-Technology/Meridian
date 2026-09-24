import { EDITORIAL_STORIES } from './coverLabEditorialData';

export const JUSTGO_DIRECTIONS = [
  {
    id: 'g', name: 'No indoor voice', descriptor: 'The group chat made a magazine.',
    description: 'Unruly Les Flos lettering, close crops, and a headline that takes up space. One or two words change scale or direction. The photo stays alive underneath. Feels like something a friend found and immediately sent you.',
    rule: 'Keep the cream lettering and hand-cut issue tab. Compose around each image. One disruptive word per cover.',
  },
  {
    id: 'h', name: 'Go club', descriptor: 'Give the Just Go burst a bigger job.',
    description: 'The house burst becomes a giant window into the event. Loud color fields, irregular type, and a little printed-dot grit make a recognizable visual signature without locking every issue into one arrangement.',
    rule: 'Use the burst once, at an unapologetic scale. Rotate orange, blue, and yellow; let the headline jump around it.',
  },
  {
    id: 'i', name: 'Cut & run', descriptor: 'A little badly behaved. Very well picked.',
    description: 'Photos, scraps of color, and chunky hand-cut headlines assembled like a flyer worth taking home. Some issues are crowded; others leave paper showing. Shared ink, texture, and lettering hold the whole stack together.',
    rule: 'Change the crop and paper arrangement. Keep one dominant headline, one photograph, and only a few purposeful scraps.',
  },
];
export const JUSTGO_COVERS = EDITORIAL_STORIES.slice(0, 3).flatMap((story, index) =>
  JUSTGO_DIRECTIONS.map((direction) => ({ id: `${direction.id}${index + 1}`, direction: direction.id, story, name: story.label })),
);
export const JUSTGO_GRID_ORDER = ['g1', 'h2', 'i3', 'i2', 'g3', 'h1', 'h3', 'i1', 'g2'];
