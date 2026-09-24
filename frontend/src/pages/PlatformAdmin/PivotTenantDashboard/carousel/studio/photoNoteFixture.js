/**
 * Round 06 Photo note, lanterns sample, as a schema v2 document.
 * Numbers match EventSlideStudy.scss `.jgv-slide--note` (1cqw = 10.8px).
 * Copy and photography stay the lab fixture; they are not an issue.
 */

import { CQW, cqw, reflowCard } from './studioDocument';

function frame(xCqw, yCqw, wCqw, hCqw) {
  return { x: cqw(xCqw), y: cqw(yCqw), width: cqw(wCqw), height: cqw(hCqw) };
}

export function createPhotoNoteDocument() {
  const card = {
    id: 'card',
    kind: 'card',
    name: 'Detail card',
    layout: 'free',
    sizing: 'fixed',
    gap: cqw(2),
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    frame: {
      x: cqw(8),
      y: cqw(73),
      width: cqw(84),
      height: cqw(125 - 73 - 6),
    },
    rotation: 0,
    children: [
      {
        id: 'title',
        kind: 'text',
        name: 'Title',
        layout: 'flow',
        presence: 'custom',
        role: 'title',
        text: 'lanterns\non grant.',
        frame: frame(0, 0, 84, 16),
        rotation: 0,
      },
      {
        id: 'description',
        kind: 'text',
        name: 'Description',
        layout: 'flow',
        presence: 'custom',
        role: 'description',
        text: 'Come hungry. Mooncakes, late-night bites, and a lantern-lit wander with no particular plan.',
        frame: frame(0, 0, 76, 12),
        rotation: 0,
      },
      {
        id: 'logistics',
        kind: 'text',
        name: 'Logistics',
        layout: 'flow',
        pin: 'end',
        presence: 'custom',
        role: 'logistics',
        text: 'Fri, Sep 25 · 6–10pm\nGrant Avenue · Chinatown\nSan Francisco\nFree entry',
        frame: frame(0, 0, 84, 22),
        rotation: 0,
      },
    ],
  };
  reflowCard(card);

  return {
    schemaVersion: 2,
    preset: { id: 'event.note', round: '06', name: 'Photo note' },
    width: 1080,
    height: 1350,
    background: { kind: 'fill', color: '#faf6ef' },
    elements: [
      {
        id: 'photo',
        kind: 'image',
        name: 'Photograph',
        layout: 'free',
        frame: frame(19, 6, 62, 62),
        rotation: 2,
        crop: { focalX: 0.6, focalY: 0.5, scale: 1 },
        asset: {
          src: '/justgo/cover-lab/lanterns.jpg',
          alt: 'Red lanterns hanging over a street, used as thematic imagery',
          credit: 'Paul Pastourmatzis',
        },
        style: { rim: true },
      },
      card,
      {
        id: 'sticker',
        kind: 'sticker',
        name: 'Just Go sticker',
        layout: 'free',
        frame: {
          x: cqw(100 - 14 - 21),
          y: cqw(56),
          width: cqw(21),
          height: cqw(21),
        },
        rotation: 8,
        crop: { focalX: 0.5, focalY: 0.5, scale: 1 },
        asset: { alt: 'Just Go' },
      },
    ],
  };
}

export { CQW };
