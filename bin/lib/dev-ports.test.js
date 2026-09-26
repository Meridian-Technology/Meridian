const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readDevPorts, writeDevPorts, clearDevPorts } = require('./dev-ports');

function tempMeridian() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-ports-'));
  fs.mkdirSync(path.join(root, 'frontend'));
  return root;
}

test('writes a development env file and does not touch production env names', () => {
  const root = tempMeridian();
  const result = writeDevPorts(root, { apiPort: '19202', webPort: '19201' });
  const text = fs.readFileSync(result.file, 'utf8');
  assert.equal(path.basename(result.file), '.env.development.local');
  assert.match(text, /^MERIDIAN_API_PORT=19202$/m);
  assert.match(text, /^REACT_APP_API_URL=http:\/\/127\.0\.0\.1:19202$/m);
  assert.match(text, /^PORT=19201$/m);
  assert.equal(fs.existsSync(path.join(root, 'frontend', '.env')), false);
  assert.equal(fs.existsSync(path.join(root, 'frontend', '.env.production')), false);
  assert.equal(fs.existsSync(path.join(root, 'frontend', '.env.local')), false);
  assert.deepEqual(readDevPorts(root), { apiPort: 19202, webPort: 19201, file: result.file });
});

test('omits the web port when only the API port is given', () => {
  const root = tempMeridian();
  writeDevPorts(root, { apiPort: 5001 });
  const text = fs.readFileSync(path.join(root, 'frontend', '.env.development.local'), 'utf8');
  assert.equal(/^PORT=/m.test(text), false);
  assert.equal(readDevPorts(root).webPort, null);
});

test('clear removes the development file', () => {
  const root = tempMeridian();
  writeDevPorts(root, { apiPort: 5002 });
  clearDevPorts(root);
  assert.equal(readDevPorts(root).apiPort, null);
});

test('rejects a non-numeric port', () => {
  const root = tempMeridian();
  assert.throws(() => writeDevPorts(root, { apiPort: 'abc' }), /API port/);
});

test('refuses to write when NODE_ENV is production', () => {
  const root = tempMeridian();
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => writeDevPorts(root, { apiPort: 19202 }), /production/);
    assert.equal(fs.existsSync(path.join(root, 'frontend', '.env.development.local')), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
