const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const fixtureRoot = path.join(__dirname, 'fixtures');
const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'contract-integrity.json'), 'utf8'));

test('adapter and Golden Fixtures match contract v1 integrity hashes', () => {
  assert.equal(expected.contractVersion, 1);
  assert.equal(sha256(path.join(__dirname, '..', 'change-input.js')), expected.changeInputSha256);
  assert.equal(sha256(path.join(fixtureRoot, 'write-events.v1.json')), expected.writeEventsSha256);
});

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
