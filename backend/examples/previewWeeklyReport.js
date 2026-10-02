#!/usr/bin/env node
/**
 * Render the weekly report email from a sample report and open it in a browser.
 * No database or env needed. Usage (from backend/):
 *   npm run preview:weekly-report                # pilot-scale numbers
 *   npm run preview:weekly-report -- growing     # bigger fleet, a failed city
 *   npm run preview:weekly-report -- first-week  # nothing finished yet
 *   npm run preview:weekly-report -- all         # write every scenario
 * Pass --no-open to only write the files.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { buildWeeklyReportHtml, buildWeeklyReportText } = require('../services/pivotWeeklyReportEmail');
const { scenarios } = require('./weeklyReportFixtures');

const args = process.argv.slice(2);
const shouldOpen = !args.includes('--no-open');
const name = args.find((arg) => !arg.startsWith('--')) || 'pilot';
const names = name === 'all' ? Object.keys(scenarios) : [name];

const unknown = names.filter((key) => !scenarios[key]);
if (unknown.length) {
  console.error(`Unknown scenario: ${unknown.join(', ')}. Try: ${Object.keys(scenarios).join(', ')}, all`);
  process.exit(1);
}

const dir = path.join(os.tmpdir(), 'justgo-weekly-report');
fs.mkdirSync(dir, { recursive: true });

names.forEach((key) => {
  const report = scenarios[key];
  const file = path.join(dir, `${key}.html`);
  fs.writeFileSync(file, buildWeeklyReportHtml(report));
  fs.writeFileSync(path.join(dir, `${key}.txt`), buildWeeklyReportText(report));
  console.log(`${report.subject}\n  ${file}`);
  if (shouldOpen) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    execFile(opener, [file], () => {});
  }
});
