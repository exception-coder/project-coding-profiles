const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { normalizeChanges } = require('../change-input');
const fixturePath = path.join(__dirname, 'fixtures', 'write-events.v1.json');

test('versioned Golden Fixtures define the write-event contract', async (t) => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(fixture.contractVersion, 1);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'write-contract-'));
  try {
    for (const contractCase of fixture.cases) {
      await t.test(contractCase.name, () => {
        const payload = expand(contractCase.payload, temporaryRoot);
        const expected = expand(contractCase.expected, temporaryRoot);
        assert.deepEqual(normalizeChanges(payload), expected);
      });
    }
  } finally {
    const resolved = path.resolve(temporaryRoot);
    assert.ok(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

function expand(value, cwd) {
  if (typeof value === 'string') {
    const replaced = value.replaceAll('${CWD}', cwd.replaceAll('\\', '/'));
    return replaced.includes('/src/') ? path.normalize(replaced) : replaced;
  }
  if (Array.isArray(value)) return value.map((item) => expand(item, cwd));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, cwd)]));
}
