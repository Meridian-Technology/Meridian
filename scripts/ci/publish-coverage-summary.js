#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const project = process.argv[2];
if (!['backend', 'frontend'].includes(project)) {
  console.error('Usage: publish-coverage-summary.js <backend|frontend>');
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const root = path.resolve(__dirname, '../..');
const tests = readJson(path.join(root, project, 'coverage/test-results.json'));
const coverage = readJson(path.join(root, project, 'coverage/coverage-summary.json'));
const totals = coverage && coverage.total;
const label = project[0].toUpperCase() + project.slice(1);

const testRow = tests
  ? `| ${label} | ${tests.numTotalTests} | ${tests.numPassedTests} | ${tests.numFailedTests} | ${tests.numPendingTests} | ${tests.numTodoTests || 0} |`
  : `| ${label} | n/a | n/a | n/a | n/a | n/a |`;
const coverageRow = totals
  ? `| ${label} | ${totals.lines.pct}% | ${totals.statements.pct}% | ${totals.branches.pct}% | ${totals.functions.pct}% |`
  : `| ${label} | n/a | n/a | n/a | n/a |`;

const markdown = [
  `## ${label} test results`,
  '',
  '| Suite | Total | Passed | Failed | Skipped | Todo |',
  '|---|---:|---:|---:|---:|---:|',
  testRow,
  '',
  `## ${label} coverage`,
  '',
  '| Suite | Lines | Statements | Branches | Functions |',
  '|---|---:|---:|---:|---:|',
  coverageRow,
  '',
  'Detailed coverage and raw test results are attached to this run.',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
} else {
  process.stdout.write(markdown);
}
