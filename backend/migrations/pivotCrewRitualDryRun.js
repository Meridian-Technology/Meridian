#!/usr/bin/env node
/**
 * Crew Week ritual dry run — validates phase matrix before store submit.
 *
 * Usage (from Meridian/backend):
 *   npm run dry-run:pivot-crew-ritual
 *   node migrations/pivotCrewRitualDryRun.js --checklist
 *
 * `--checklist` prints the manual staging gate (no tests).
 */
require('./ensureBackendNodeModules');

const { spawnSync } = require('child_process');
const path = require('path');

const STAGING_CHECKLIST = [
  'Build staging binary with X-App-Version header (store version 2.0.0+).',
  'Point staging app at gated ritual API (GET /pivot/week-ritual, GET /pivot/crews/week/judgements).',
  'Verify ForceUpdateGate is OFF in staging (config.mobile.minAppVersion below live binary).',
  'Run automated dry run: npm run dry-run:pivot-crew-ritual',
  'Manual pass: solo user → drop dashboard → deck → recap.',
  'Manual pass: 1 crew join lands on Week dashboard with highlight.',
  'Manual pass: 3 crews → decide pager → confirm/split → recap.',
  'Manual pass: invited-only crew row visible, quorum excludes invited.',
  'Submit store build only after staging passes.',
  'After store build is searchable: bump config.mobile.minAppVersion + forceUpdate.',
  'Rollback: revert minAppVersion first; binary rollback is last resort.',
];

function printChecklist() {
  console.log('\n[pivot-crew-ritual-dry-run] staging ship checklist\n');
  STAGING_CHECKLIST.forEach((line, index) => {
    console.log(`${index + 1}. ${line}`);
  });
  console.log('');
}

function runJestDryRun() {
  const jestBin = path.join(__dirname, '..', 'node_modules', '.bin', 'jest');
  const result = spawnSync(
    jestBin,
    [
      'tests/unit/pivotCrewRitualDryRun.test.js',
      '--runInBand',
      '--verbose',
    ],
    {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log('\n[pivot-crew-ritual-dry-run] all automated scenarios passed.\n');
  printChecklist();
}

function main() {
  if (process.argv.includes('--checklist')) {
    printChecklist();
    return;
  }

  runJestDryRun();
}

main();
