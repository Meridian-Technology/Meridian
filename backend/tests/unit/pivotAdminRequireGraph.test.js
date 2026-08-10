const fs = require('fs');
const path = require('path');

/**
 * Guards the require cycle that broke GET /admin/pivot/tenants/:key/ops at runtime:
 * pivotAdminOverviewService -> pivotCreatorAdminNotifyService ->
 * pivotTenantInsightsService -> pivotAdminOverviewService.
 *
 * When the notify service loaded first, overview destructured a still-empty
 * module.exports and captured isLiveCreatorBatchWeek /
 * buildCreatorListingCurationHref as undefined. The service-level suites cannot
 * catch this because they mock each other, so assert on the require graph.
 */

const SERVICES = path.join(__dirname, '..', '..', 'services');
const UTILITIES = path.join(__dirname, '..', '..', 'utilities');

const CLUSTER = [
  'services/pivotAdminOverviewService.js',
  'services/pivotCreatorAdminNotifyService.js',
  'services/pivotTenantInsightsService.js',
  'services/pivotCreatorListingService.js',
];

function relativeId(absPath) {
  return path
    .relative(path.join(__dirname, '..', '..'), absPath)
    .split(path.sep)
    .join('/');
}

function buildRequireGraph() {
  const graph = new Map();
  for (const dir of [SERVICES, UTILITIES]) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.js')) continue;
      const absPath = path.join(dir, file);
      const source = fs.readFileSync(absPath, 'utf8');
      const deps = new Set();
      for (const match of source.matchAll(
        /require\(\s*['"](\.[^'"]+)['"]\s*\)/g,
      )) {
        let dep = path.resolve(path.dirname(absPath), match[1]);
        if (!dep.endsWith('.js')) dep += '.js';
        if (fs.existsSync(dep)) deps.add(relativeId(dep));
      }
      graph.set(relativeId(absPath), [...deps]);
    }
  }
  return graph;
}

function findCyclesThrough(graph, entry) {
  const cycles = [];
  const visiting = new Set();

  function walk(node, trail) {
    visiting.add(node);
    trail.push(node);
    for (const dep of graph.get(node) || []) {
      if (dep === entry) {
        cycles.push([...trail, dep].join(' -> '));
      } else if (!visiting.has(dep)) {
        walk(dep, trail);
      }
    }
    trail.pop();
    visiting.delete(node);
  }

  walk(entry, []);
  return cycles;
}

describe('pivot admin/creator require graph', () => {
  const graph = buildRequireGraph();

  it.each(CLUSTER)('%s is not part of a require cycle', (moduleId) => {
    expect(graph.has(moduleId)).toBe(true);
    expect(findCyclesThrough(graph, moduleId)).toEqual([]);
  });

  it('keeps the shared href builders dependency-free', () => {
    expect(graph.get('utilities/pivotAdminHrefs.js')).toEqual([]);
  });

  it('routes the notify service to the shared href builders, not the insights service', () => {
    expect(graph.get('services/pivotCreatorAdminNotifyService.js')).toContain(
      'utilities/pivotAdminHrefs.js',
    );
    expect(
      graph.get('services/pivotCreatorAdminNotifyService.js'),
    ).not.toContain('services/pivotTenantInsightsService.js');
  });
});
