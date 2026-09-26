#!/usr/bin/env node
/**
 * Render a "sorry u missed it" carousel to PNGs.
 *
 * Drives the Chrome already installed on this machine through playwright-core,
 * so the pixels come from the same engine that drew the editor — blend modes,
 * mask-composite, the Les Flos @font-face and the film grain are rendered
 * rather than approximated. playwright-core downloads no browser of its own;
 * `channel: 'chrome'` uses the one you already have.
 *
 *   node scripts/export-carousel.js <deckId> <token> <slides> [baseUrl]
 *
 * The Export button in the Carousel tab prints this line with the arguments
 * filled in. The token is deck-scoped and expires in ten minutes.
 *
 * The point of using a driver rather than `chrome --screenshot` is the wait:
 * the frame view sets data-ready="1" once its fonts and photographs have
 * settled, and this waits for that rather than for a fixed number of seconds.
 * A capture that beats the font silently ships a cover set in the fallback.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright-core');

const WIDTH = 1080;
const HEIGHT = 1350;
const READY_TIMEOUT_MS = 20000;
const MAX_SLIDES = 20;

function parseSlideSpec(spec) {
  const text = String(spec || '').trim();
  const withinDeck = (slide) => Number.isInteger(slide) && slide >= 1 && slide <= MAX_SLIDES;
  if (/^\d+-\d+$/.test(text)) {
    const [start, end] = text.split('-').map(Number);
    if (!withinDeck(start) || !withinDeck(end) || end < start) return null;
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  if (/^\d+(,\d+)+$/.test(text)) {
    const slides = text.split(',').map(Number);
    if (slides.some((slide) => !withinDeck(slide)) || new Set(slides).size !== slides.length) return null;
    return [...slides].sort((left, right) => left - right);
  }
  if (/^\d+$/.test(text)) {
    const count = Number(text);
    if (!withinDeck(count)) return null;
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  return null;
}

function usage(message) {
  if (message) console.error(`\n${message}`);
  console.error(`
Usage: node scripts/export-carousel.js <deckId> <token> <slides> [baseUrl]

  deckId      the deck to render
  token       export token, from the Export button (valid ten minutes)
  slides      a count (3 = slides 1–3), a range (2-2, 2-4), or a list (2,4)
  baseUrl     defaults to http://localhost:3000

Environment:
  CHROME_CHANNEL   chrome | chrome-beta | msedge   (default: chrome)
  OUT_DIR          where to write                  (default: out/carousel-<deckId>)
`);
  process.exit(1);
}

async function main() {
  const [deckId, token, countArg, baseUrl = 'http://localhost:3000'] = process.argv.slice(2);
  if (!deckId || !token || !countArg) usage('Missing an argument.');

  const slides = parseSlideSpec(countArg);
  if (!slides) usage(`Not a slide selection: ${countArg}`);

  const outDir = process.env.OUT_DIR || path.join('out', `carousel-${deckId}`);
  await fs.mkdir(outDir, { recursive: true });

  let browser;
  try {
    // One browser for the whole deck rather than one per slide: ten cold
    // starts was most of what the old script spent its time on.
    browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' });
  } catch (error) {
    console.error('\nCould not start Chrome.');
    console.error(error.message);
    console.error('\nSet CHROME_CHANNEL if you use a different build (chrome-beta, msedge).');
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log(`Rendering ${slides.length} slide${slides.length === 1 ? '' : 's'} at ${WIDTH}x${HEIGHT} -> ${outDir}`);

  const written = [];
  let failed = 0;

  for (const i of slides) {
    const url = `${baseUrl}/carousel-export/${deckId}/${i}?token=${encodeURIComponent(token)}`;
    const file = path.join(outDir, `slide-${String(i).padStart(2, '0')}.png`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-ready="1"]', { timeout: READY_TIMEOUT_MS });

      // The frame view renders its own error state ready, so a bad token or a
      // missing template reports itself instead of shipping a picture of it.
      const failure = await page.$('.jgz-export--error');
      if (failure) {
        console.error(`  slide ${i}: ${(await failure.innerText()).trim()}`);
        failed += 1;
        continue;
      }

      const frame = await page.$('.jgz-export');
      await frame.screenshot({ path: file });
      written.push(file);
      console.log(`  slide ${i} -> ${file}`);
    } catch (error) {
      const reason = error.name === 'TimeoutError'
        ? 'never became ready (fonts or photographs did not settle)'
        : error.message;
      console.error(`  slide ${i}: ${reason}`);
      failed += 1;
    }
  }

  await browser.close();

  console.log();
  if (failed) {
    console.error(`${written.length} rendered, ${failed} failed.`);
    process.exit(1);
  }
  console.log(`Done. ${written.length} files in ${outDir}, in carousel order.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
