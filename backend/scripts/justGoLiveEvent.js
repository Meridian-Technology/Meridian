#!/usr/bin/env node
/**
 * Loads a Just Go Live night's card (see docs/just-go-live.md).
 *
 *   node scripts/justGoLiveEvent.js check card.json
 *   node scripts/justGoLiveEvent.js load card.json --pin=4821 --ack-write
 *   node scripts/justGoLiveEvent.js load card.json --reset --ack-write
 *
 * `check` reads nothing but the file. `load` writes the card to the global
 * database; the spotter's calls and the fans' picks stay, so a fixed typo
 * mid-night is safe (press "reload card" on the spotter page after). `--pin`
 * sets the spotter PIN. `--reset` also clears the spotter's calls and every
 * fan: for before doors only, then restart the dyno so memory starts fresh.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parseLiveEventDefinition } = require('../services/justGoLive/liveEventDefinition');

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!['check', 'load'].includes(mode) || !file) {
    throw new Error('usage: justGoLiveEvent.js check|load card.json [--pin=1234] [--reset] --ack-write');
  }
  const card = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const { definition, errors } = parseLiveEventDefinition(card);
  if (errors) {
    console.error('The card has problems:');
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`${definition.eventId}: "${definition.title}", ${definition.matches.length} matches`);
  definition.matches.forEach((match, index) => {
    console.log(`  ${index + 1}. ${match.title} (${match.sides.map((side) => side.name).join(' / ')})`);
  });
  if (mode === 'check') return;

  const pin = arg('pin');
  const reset = process.argv.includes('--reset');
  if (pin !== undefined && !/^\d{4,8}$/.test(pin)) throw new Error('--pin must be 4 to 8 digits');
  if (!process.argv.includes('--ack-write')) {
    throw new Error('Loading writes to the global database. Re-run with --ack-write.');
  }
  const { connectToGlobalDatabase } = require('../connectionsManager');
  const { upsertLiveEvent } = require('../services/justGoLive/liveStore');
  const db = await connectToGlobalDatabase();
  await upsertLiveEvent(db, definition, { pin, reset });
  console.log(`loaded${pin ? ', PIN set' : ''}${reset ? ', calls and fans cleared' : ''}.`);
  console.log(`spotter: https://www.meridian.study/pivot/live/${definition.eventId}/spot`);
  console.log(`fans:    https://justgo.lol/clip/ic?live=${definition.eventId}`);
  await db.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
