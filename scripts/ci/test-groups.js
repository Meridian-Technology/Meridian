#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const testFilePattern = /\.(?:spec|test)\.(?:js|jsx|ts|tsx)$/;

const groups = {
  backend: {
    'discovery-catalog': [
      /\/unit\/(?:clusterPivotHostNames|eventPivotIndexes|pivotBatch|pivotCatalog|pivotCuration|pivotDiscovery|pivotEnrichment|pivotEventSimilarity|pivotExtraction|pivotFieldParsing|pivotHost|pivotIngest|pivotLocation|pivotMovie|pivotOffloaded|pivotOrganizer|pivotRichData|pivotSite|pivotSource|pivotTag)/,
    ],
    'compute-admin': [
      /\/unit\/(?:pivotAdmin|pivotCompute|pivotFleet|pivotLab|pivotTenantInsights|pivotTenantJourney|pivotTenantOps)/,
      /\/route-outcomes\/(?:pivotAdmin|pivotComputeWorker)/,
    ],
    'consumer-experience': [
      /\/unit\/(?:ensureJustGo|eventRichLocation|justGo|publicEvent|pivotAcquisition|pivotContact|pivotEntry|pivotExplore|pivotFeed|pivotFeedback|pivotFriend|pivotIntent|pivotInteraction|pivotLanding|pivotProfile|pivotReferral|pivotRetention|pivotSafety|pivotTimeSlots)/,
      /\/route-outcomes\/pivotRoutes/,
    ],
    'crews-weekly-drop': [
      /\/unit\/(?:pivotCrew|pivotCrossCrew|pivotDropSchedule|pivotRitual|pivotWeek)/,
      /\/route-outcomes\/pivotCrewRoutes/,
    ],
    'jobs-notifications': [
      /\/unit\/(?:expoPushDelivery|meridian|notificationService)/,
      /\/route-outcomes\/meridianJobRoutes/,
    ],
    'creator-editorial': [
      /\/unit\/(?:pivotCarousel|pivotCopy|pivotCover|pivotCreator|pivotDeck|pivotEditorial|zine)/,
      /\/route-outcomes\/pivotCreator/,
    ],
    'platform-core': [
      /\/integration\//,
      /\/unit\/(?:adminTenant|appVersion|atlasPolicy|budgetService|cookieUtils|corsOrigins|googleLocation|mobileAssociation|orgPermission|pivotConfig|pivotIsoWeek|pivotLogger|pivotMobileConfig|platformAdmin|requireMinAppVersion|requirePivotCreator|reservationMetrics|resourceReservation|richLocationMigration|rootOperator|semesterHelpers|tenantKeyRename|tenantLandingMode|timeBlockHelper|workflowUtilities|wwwPathAllowlist)/,
      /\/route-outcomes\/(?:adminPlatformAdmins|analyticsDashboardRoutes|authRoutes|orgBudgetRoutes|orgRoleRoutes|userRoutes)/,
    ],
  },
  frontend: {
    'admin-operations': [/^frontend\/src\/pages\/PlatformAdmin\//],
    'product-experience': [/^frontend\/src\/(?!pages\/PlatformAdmin\/)/],
  },
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function discover(project) {
  const directory = project === 'backend'
    ? path.join(root, 'backend/tests')
    : path.join(root, 'frontend/src');

  return walk(directory)
    .filter((file) => testFilePattern.test(file))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .sort();
}

function assignments(project, file) {
  return Object.entries(groups[project])
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(file)))
    .map(([name]) => name);
}

function validate(project) {
  const problems = [];
  const counts = Object.fromEntries(Object.keys(groups[project]).map((name) => [name, 0]));

  for (const file of discover(project)) {
    const matches = assignments(project, file);
    if (matches.length !== 1) {
      problems.push(`${file}: ${matches.length ? `matches ${matches.join(', ')}` : 'is unassigned'}`);
      continue;
    }
    counts[matches[0]] += 1;
  }

  if (problems.length) {
    throw new Error(`Invalid ${project} test-group assignments:\n${problems.join('\n')}`);
  }

  for (const [name, count] of Object.entries(counts)) {
    if (count === 0) throw new Error(`${project}/${name} contains no tests`);
    console.log(`${project}/${name}: ${count} suites`);
  }
}

function run(project, group, extraArgs) {
  if (!groups[project] || !groups[project][group]) {
    throw new Error(`Unknown test group: ${project}/${group}`);
  }
  validate(project);

  const files = discover(project)
    .filter((file) => assignments(project, file)[0] === group)
    .map((file) => file.replace(`${project}/`, ''));

  const commandArgs = project === 'backend'
    ? [path.join(root, 'backend/node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath', ...files, ...extraArgs]
    : [path.join(root, 'frontend/scripts/test.js'), '--watch=false', '--runInBand', '--runTestsByPath', ...files, ...extraArgs];

  const result = spawnSync(process.execPath, commandArgs, {
    cwd: path.join(root, project),
    env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
}

function main() {
  const [command, project, group, ...extraArgs] = process.argv.slice(2);
  if (command === 'validate') {
    if (project === 'all') {
      validate('backend');
      validate('frontend');
    } else if (groups[project]) {
      validate(project);
    } else {
      throw new Error('Usage: test-groups.js validate <backend|frontend|all>');
    }
    return;
  }
  if (command === 'run') {
    run(project, group, extraArgs);
    return;
  }
  throw new Error('Usage: test-groups.js <validate|run> ...');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
