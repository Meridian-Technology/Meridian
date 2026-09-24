/** Concept copy only. Photography is illustrative, not documentation of the sample issues. */
export const EDITORIAL_DIRECTIONS = [
  {
    id: 'd', name: 'Double take', descriptor: 'A little elegance. A little audacity.',
    description: 'A thin, expressive serif interrupts heavy, tightly set sans. Photography fills the page; headlines behave like conversation. Just Go becomes the publisher’s signature, leaving the story to do the talking.',
    rule: 'Keep the type pairing and warm white. Let each issue choose its crop, line breaks, and one unexpected color.',
  },
  {
    id: 'e', name: 'Full volume', descriptor: 'Big enough to hear from the grid.',
    description: 'Compressed poster type, acidic yellow, and photos sliced by oversized words. More record sleeve than lifestyle post. The same loud grammar handles an invitation or a dispatch from a night you missed.',
    rule: 'One headline, one image, two inks. Change the proportions, not the visual vocabulary.',
  },
  {
    id: 'f', name: 'Second pressing', descriptor: 'Something you’d keep from a night out.',
    description: 'A narrow publisher’s spine, monochrome photography, and outsized italic type. Part independent culture magazine, part photocopied club flyer. The roughness comes from contrast and composition, not a pile of stickers.',
    rule: 'Keep the spine and italic voice. Alternate warm paper, orange, and pale blue; let the image break the margins.',
  },
];

export const EDITORIAL_STORIES = [
  {
    id: 'moon', number: '01', kind: 'city', label: 'Mid-autumn / San Francisco',
    series: 'the city edit', location: 'san francisco', theme: 'the mid-autumn issue',
    detail: 'lantern walks, mooncakes & nights under the same moon.',
    photo: '/justgo/cover-lab/lanterns.jpg', credit: 'Paul Pastourmatzis',
    source: 'https://unsplash.com/photos/red-japanese-hanging-lanterns-J0-DwclQQs8',
    alt: 'Red lanterns hanging over London Chinatown, used as thematic imagery',
  },
  {
    id: 'dance', number: '02', kind: 'missed', label: 'Sorry you missed it / After dark',
    series: 'sorry you missed it', location: 'around the world', theme: 'the after-dark issue',
    detail: 'a barbershop with a very different night shift.',
    photo: '/justgo/cover-lab/dancefloor.jpg', credit: 'foto DIAL',
    source: 'https://unsplash.com/photos/crowd-dancing-in-a-dimly-lit-nightclub-ucOj9HnuSM4',
    alt: 'A crowded, red-lit night at a barbershop in Seoul',
  },
  {
    id: 'jazz', number: '03', kind: 'city', label: 'Jazz after dark / New York',
    series: 'the city edit', location: 'new york', theme: 'the jazz-after-dark issue',
    detail: 'small rooms, late sets & a very loose definition of bedtime.',
    photo: '/justgo/cover-lab/jazz.jpg', credit: 'benjamin lehman',
    source: 'https://unsplash.com/photos/brass-saxophone-in-black-background-0h2F-Ib2Zdo',
    alt: 'Close-up of a saxophone under warm stage lighting',
  },
  {
    id: 'encore', number: '04', kind: 'missed', label: 'Sorry you missed it / The encore',
    series: 'sorry you missed it', location: 'around the world', theme: 'the live-music issue',
    detail: 'for everyone who said “one more” and meant it.',
    photo: '/justgo/cover-lab/jazz.jpg', credit: 'benjamin lehman',
    source: 'https://unsplash.com/photos/brass-saxophone-in-black-background-0h2F-Ib2Zdo',
    alt: 'A warmly lit saxophone, illustrating a live-music retrospective',
  },
];

// Read across to compare directions; down to see how each system changes by issue.
export const EDITORIAL_COVERS = EDITORIAL_STORIES.flatMap((story, index) =>
  EDITORIAL_DIRECTIONS.map((direction) => ({
    id: `${direction.id}${index + 1}`, direction: direction.id, story, name: story.label,
  })),
);
export const EDITORIAL_GRID_ORDER = ['d1', 'e2', 'f3', 'f2', 'd3', 'e1', 'e4', 'f1', 'd2', 'd4', 'e3', 'f4'];
