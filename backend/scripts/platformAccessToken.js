#!/usr/bin/env node
/**
 * Mint, list, and revoke platform-admin personal access tokens.
 *
 *   node scripts/platformAccessToken.js mint --global-user-id <id> --label <label> --ack-write
 *   node scripts/platformAccessToken.js list
 *   node scripts/platformAccessToken.js revoke --id <id> --ack-write
 *
 * mint prints the secret once on stdout. list and revoke never print it.
 * A token expires one year after minting and works only on the carousel MCP route.
 */
require('dotenv').config();

const {
  mintPlatformAccessToken,
  listPlatformAccessTokens,
  revokePlatformAccessToken,
} = require('../services/platformAccessTokenService');

const USAGE = 'usage: platformAccessToken.js mint --global-user-id <id> --label <label> --ack-write'
  + ' | list | revoke --id <id> --ack-write';

function readOption(argv, name) {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return '';
  return value;
}

function formatWhen(value) {
  if (!value) return '-';
  return new Date(value).toISOString();
}

async function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  if (!['mint', 'list', 'revoke'].includes(command)) {
    throw new Error(USAGE);
  }
  const acknowledged = argv.includes('--ack-write');
  if (command !== 'list' && !acknowledged) {
    throw new Error(`${command} writes to the global database. Re-run with --ack-write.`);
  }
  if (command === 'mint') {
    const globalUserId = readOption(argv, 'global-user-id');
    const label = readOption(argv, 'label');
    if (!globalUserId) throw new Error('mint requires --global-user-id.');
    if (!label) throw new Error('mint requires --label.');
  }
  if (command === 'revoke' && !readOption(argv, 'id')) {
    throw new Error('revoke requires --id.');
  }

  const { connectToGlobalDatabase } = require('../connectionsManager');
  const db = await connectToGlobalDatabase();
  try {
    const req = { globalDb: db };
    if (command === 'list') {
      const result = await listPlatformAccessTokens(req);
      if (result.data.length === 0) {
        console.log('No platform access tokens.');
        return;
      }
      result.data.forEach((token) => {
        console.log([
          token.id,
          token.displayPrefix,
          token.label,
          token.globalUserId,
          `expires ${formatWhen(token.expiresAt)}`,
          `lastUsed ${formatWhen(token.lastUsedAt)}`,
          token.revokedAt ? `revoked ${formatWhen(token.revokedAt)}` : 'active',
        ].join('  '));
      });
      return;
    }

    if (command === 'revoke') {
      const result = await revokePlatformAccessToken(req, readOption(argv, 'id'));
      if (result.error) throw new Error(result.error);
      console.log(`revoked ${result.data.id} (${result.data.displayPrefix})`);
      return;
    }

    const result = await mintPlatformAccessToken(req, {
      globalUserId: readOption(argv, 'global-user-id'),
      label: readOption(argv, 'label'),
    });
    if (result.error) throw new Error(result.error);
    console.log(result.data.secret);
    console.error(`id ${result.data.id}`);
    console.error(`prefix ${result.data.displayPrefix}`);
    console.error(`expires ${formatWhen(result.data.expiresAt)}`);
    console.error('Save this token now. It is shown only this once.');
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
