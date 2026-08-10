const fs = require('fs');
const os = require('os');
const path = require('path');

function recordHookMetric(options) {
  if (!options || options.enabled !== true) return;
  try {
    const directory = options.directory || path.join(os.homedir(), '.kai-toolbox');
    const record = {
      ts: new Date().toISOString(),
      plugin: String(options.plugin),
      guard: path.basename(String(options.guard)),
      durationMs: Math.max(0, Math.round(Number(options.durationMs) || 0)),
      code: Number.isInteger(options.code) ? options.code : 1,
    };
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(path.join(directory, `${record.plugin}-hook-metrics.jsonl`), `${JSON.stringify(record)}\n`, 'utf8');
  } catch (_) {
    // Metrics are best-effort and must never change a guard decision.
  }
}

module.exports = { recordHookMetric };
