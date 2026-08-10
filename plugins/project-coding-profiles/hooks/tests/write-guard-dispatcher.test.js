const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DISPATCHER = path.resolve(__dirname, '..', 'write-guard-dispatcher.js');

test('dispatcher preserves frontend block decisions for Codex patches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-dispatcher-'));
  try {
    fs.mkdirSync(path.join(root, 'WebRoot', 'crm'), { recursive: true });
    fs.writeFileSync(path.join(root, '.coding-profile.json'), JSON.stringify({
      name: 'fixture',
      frontendControls: { banNativeDialogs: true },
    }));
    const result = spawnSync('node', [DISPATCHER], {
      input: JSON.stringify({
        tool_name: 'apply_patch', cwd: root,
        tool_input: { command: [
          '*** Begin Patch',
          '*** Update File: WebRoot/crm/a.js',
          '@@',
          '+alert("blocked")',
          '*** End Patch',
        ].join('\n') },
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PCP_ENCODING_HOOK: 'off',
        PCP_FRONTEND_HOOK: 'block',
        PCP_CROSSMODULE_HOOK: 'off',
      },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /alert\(\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
