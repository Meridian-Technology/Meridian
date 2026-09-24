import { EDITORIAL_STORIES } from './coverLabEditorialData';

// Fictional editorial samples. Dates, venues, prices, and copy are layout examples.
export const EVENT_TREATMENTS = [
  { id: 'note', name: 'Photo note', description: 'A square photograph, a close-set headline, and a clear information block. Cream space gives a busy carousel a quieter page.' },
  { id: 'bill', name: 'On the bill', description: 'Orange ink and a large title above a tipped portrait photograph, with the recommendation alongside it. A cream strip holds the practical details together.' },
  { id: 'scene', name: 'In the room', description: 'Full-bleed photography with a compact paper panel. The picture sets the atmosphere; the title, recommendation, and logistics remain easy to read.' },
];
export const EVENT_SAMPLES = [
  { id: 'moon', story: EDITORIAL_STORIES[0], title: 'lanterns on grant.', lines: ['lanterns', 'on grant.'], label: 'A city pick / night market', when: 'Fri, Sep 25 · 6–10pm', where: 'Grant Avenue · Chinatown', city: 'San Francisco', access: 'Free entry', note: 'Come hungry. Mooncakes, late-night bites, and a lantern-lit wander with no particular plan.', photoPosition: '60% center' },
  { id: 'dance', story: EDITORIAL_STORIES[1], title: 'the barbershop afterparty.', lines: ['the barbershop', 'afterparty.'], label: 'A global recap / after dark', when: 'Sat, Sep 19 · after hours', where: 'A neighbourhood barbershop', city: 'Seoul', access: 'Past event', note: 'The clippers clocked out. The decks clocked in. A very different kind of Saturday appointment.', photoPosition: '54% center', recap: true },
  { id: 'jazz', story: EDITORIAL_STORIES[2], title: 'one more set.', lines: ['one more', 'set.'], label: 'A city pick / live music', when: 'Fri, Sep 25 · 9pm–late', where: 'The Back Room · Lower East Side', city: 'New York', access: '$15 at the door', note: 'A small room, a loose set list, and a very good reason to miss your usual bedtime.', photoPosition: '35% center' },
];
