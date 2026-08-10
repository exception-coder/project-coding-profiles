const fs = require('fs');
const path = require('path');

/**
 * Convert Claude Code and Codex write-hook payloads into one stable contract.
 * Unknown or malformed payloads intentionally produce no changes so a hook
 * compatibility issue never corrupts the editor operation itself.
 */
function normalizeChanges(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const tool = payload.tool_name;
  const input = payload.tool_input && typeof payload.tool_input === 'object'
    ? payload.tool_input
    : {};
  const cwd = typeof payload.cwd === 'string' && payload.cwd
    ? payload.cwd
    : process.cwd();

  if (tool === 'apply_patch') {
    return typeof input.command === 'string' ? parseApplyPatch(input.command, cwd) : [];
  }

  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') return [];
  if (typeof input.file_path !== 'string' || !input.file_path) return [];

  const filePath = resolvePath(input.file_path, cwd);
  if (!filePath) return [];

  if (tool === 'Write') {
    return [{
      operation: safeExists(filePath) ? 'update' : 'add',
      filePath,
      addedText: stringOrEmpty(input.content),
      removedText: '',
    }];
  }

  if (tool === 'Edit') {
    return [{
      operation: 'update',
      filePath,
      addedText: stringOrEmpty(input.new_string),
      removedText: stringOrEmpty(input.old_string),
    }];
  }

  const edits = Array.isArray(input.edits) ? input.edits : [];
  return [{
    operation: 'update',
    filePath,
    addedText: edits.map((edit) => stringOrEmpty(edit && edit.new_string)).join('\n'),
    removedText: edits.map((edit) => stringOrEmpty(edit && edit.old_string)).join('\n'),
  }];
}

function parseApplyPatch(command, cwd) {
  const lines = command.split(/\r?\n/);
  const changes = [];
  let current = null;

  const finish = () => {
    if (!current) return;
    const sourcePath = resolvePath(current.rawPath, cwd);
    const destinationPath = current.moveTo
      ? resolvePath(current.moveTo, cwd)
      : sourcePath;
    if (destinationPath) {
      changes.push({
        operation: current.moveTo ? 'move' : current.operation,
        filePath: destinationPath,
        ...(current.moveTo && sourcePath ? { previousFilePath: sourcePath } : {}),
        addedText: current.added.join('\n'),
        removedText: current.removed.join('\n'),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) {
      finish();
      current = {
        operation: header[1].toLowerCase(),
        rawPath: header[2].trim(),
        moveTo: '',
        added: [],
        removed: [],
      };
      continue;
    }
    if (!current) continue;

    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (move) {
      current.moveTo = move[1].trim();
      continue;
    }
    if (line === '*** End Patch') {
      finish();
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.added.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.removed.push(line.slice(1));
    }
  }
  finish();
  return changes;
}

function resolvePath(filePath, cwd) {
  if (typeof filePath !== 'string' || !filePath.trim()) return '';
  const value = filePath.trim();
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function safeExists(filePath) {
  try { return fs.existsSync(filePath); } catch (_) { return false; }
}

module.exports = { normalizeChanges, parseApplyPatch };
