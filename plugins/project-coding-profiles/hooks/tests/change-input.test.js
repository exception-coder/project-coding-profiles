const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { normalizeChanges } = require('../change-input');

const cwd = path.resolve('fixture-root');

test('normalizes Claude and Codex writes', () => {
  const claude = normalizeChanges({
    tool_name: 'Edit', cwd,
    tool_input: { file_path: 'WebRoot/crm/a.js', old_string: 'a', new_string: 'alert(1)' },
  });
  assert.equal(claude[0].filePath, path.resolve(cwd, 'WebRoot/crm/a.js'));
  assert.equal(claude[0].addedText, 'alert(1)');

  const codex = normalizeChanges({
    tool_name: 'apply_patch', cwd,
    tool_input: { command: [
      '*** Begin Patch',
      '*** Update File: WebRoot/crm/a.js',
      '@@',
      '-confirm("old")',
      '+confirm("new")',
      '*** Add File: src/New.java',
      '+class New {}',
      '*** End Patch',
    ].join('\n') },
  });
  assert.equal(codex.length, 2);
  assert.equal(codex[0].addedText, 'confirm("new")');
  assert.equal(codex[0].removedText, 'confirm("old")');
  assert.equal(codex[1].operation, 'add');
});
test('malformed payloads safely produce no changes', () => {
  assert.deepEqual(normalizeChanges({ tool_name: 'apply_patch', tool_input: {} }), []);
  assert.deepEqual(normalizeChanges({ tool_name: 'Read', tool_input: {} }), []);
});
