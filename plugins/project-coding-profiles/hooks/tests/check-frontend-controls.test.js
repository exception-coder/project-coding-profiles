const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.resolve(__dirname, '..', 'check-frontend-controls.js');

function runHook(payload, env = {}) {
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: result.status, stderr: result.stderr || '' };
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcp-frontend-'));
  fs.mkdirSync(path.join(root, 'WebRoot', 'crm'), { recursive: true });
  fs.writeFileSync(path.join(root, '.coding-profile.json'), JSON.stringify({
    name: 'fixture',
    displayName: 'Fixture',
    frontendControls: {
      banNativeDialogs: true,
      replacements: { alert: 'layer.msg' },
    },
  }));
  return root;
}

test('Claude Edit detects a native dialog', () => {
  const root = makeProject();
  try {
    const filePath = path.join(root, 'WebRoot', 'crm', 'page.js');
    const result = runHook({
      tool_name: 'Edit', cwd: root,
      tool_input: { file_path: filePath, old_string: 'safe()', new_string: 'alert("x")' },
    }, { PCP_FRONTEND_HOOK: 'block' });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /alert\(\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('Codex apply_patch checks every file in a multi-file patch', () => {
  const root = makeProject();
  try {
    const result = runHook({
      tool_name: 'apply_patch', cwd: root,
      tool_input: { command: [
        '*** Begin Patch',
        '*** Update File: WebRoot/crm/clean.js',
        '@@',
        '+layer.msg("ok")',
        '*** Update File: WebRoot/crm/risky.js',
        '@@',
        '+alert("blocked")',
        '*** End Patch',
      ].join('\n') },
    }, { PCP_FRONTEND_HOOK: 'block' });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /risky\.js/);
    assert.match(result.stderr, /alert\(\)/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
