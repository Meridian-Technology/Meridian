#!/usr/bin/env node
/**
 * Send the Just Go weekly report email now. For a recurring send, create an
 * `admin_weekly_report` notification schedule instead.
 *
 * Usage (from backend/):
 *   npm run report:weekly -- --dry-run                 # build it, list recipients, send nothing
 *   npm run report:weekly -- --dry-run --out=report.html
 *   npm run report:weekly -- --to=you@example.com      # send only to these addresses
 *   npm run report:weekly                              # send to every platform admin
 *   Optional: --now=2026-10-04T15:00:00Z to report as of another time.
 *
 * Uses the same env as the server (global DB, each city's DB, RESEND_API_KEY).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const { sendWeeklyReport } = require('../services/pivotWeeklyReportService');

function parseArgs(argv) {
  const args = { dryRun: false, to: null, now: null, out: null };
  argv.forEach((arg) => {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--to=')) args.to = arg.slice(5).split(',').map((email) => email.trim()).filter(Boolean);
    else if (arg.startsWith('--now=')) args.now = new Date(arg.slice(6));
    else if (arg.startsWith('--out=')) args.out = arg.slice(6);
    else throw new Error(`Unknown argument: ${arg}`);
  });
  if (args.now && Number.isNaN(args.now.getTime())) throw new Error('--now must be a date.');
  if (args.out && !args.dryRun) throw new Error('--out only applies with --dry-run.');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const globalDb = await connectToGlobalDatabase();
  const result = await sendWeeklyReport(
    { globalDb },
    { now: args.now || new Date(), to: args.to, dryRun: args.dryRun },
  );
  if (result.error) {
    console.error(`Weekly report not sent: ${result.error} (${result.code || 'error'})`);
    return 1;
  }

  const { data } = result;
  console.log(data.subject);
  console.log(`Recipients (${data.recipients.length}): ${data.recipients.join(', ')}`);
  if (data.sent) {
    console.log(`Sent. Email id: ${data.emailId || 'unknown'}`);
    return 0;
  }
  console.log('\nDry run — nothing sent.\n');
  console.log(data.text);
  if (args.out) {
    const file = path.resolve(args.out);
    fs.writeFileSync(file, data.html);
    console.log(`\nHTML written to ${file}`);
  }
  return 0;
}

main()
  .then(async (code) => {
    await mongoose.disconnect().catch(() => {});
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
