const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../scripts/reportWordReadingGapPlan');

test('parseArgs supports gap-plan level, limit, deferred, and json options', () => {
  assert.deepEqual(parseArgs([
    '--level=4',
    '--limit=25',
    '--include-deferred',
    '--json',
  ]), {
    json: true,
    includeDeferred: true,
    level: 4,
    limit: 25,
    unknownArgs: [],
  });
});

test('parseArgs keeps max-items as a compatibility alias for limit', () => {
  assert.equal(parseArgs(['--max-items=12']).limit, 12);
});
