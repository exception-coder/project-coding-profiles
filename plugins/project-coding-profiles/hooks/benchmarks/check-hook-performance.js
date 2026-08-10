#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');

const hookRoot = path.resolve(__dirname, '..');
const dispatcher = path.join(hookRoot, 'write-guard-dispatcher.js');
const guards = [
  'check-file-encoding.js',
  'check-frontend-controls.js',
  'check-cross-module-coupling.js',
];
const rounds = readRounds();
const input = JSON.stringify({ tool_name: 'noop', tool_input: {}, cwd: hookRoot });

measureDispatcher();
measureSequential();
const dispatcherSamples = [];
const sequentialSamples = [];
for (let index = 0; index < rounds; index += 1) {
  dispatcherSamples.push(measureDispatcher());
  sequentialSamples.push(measureSequential());
}

const dispatcherMedian = median(dispatcherSamples);
const sequentialMedian = median(sequentialSamples);
const ratio = dispatcherMedian / sequentialMedian;
console.log(JSON.stringify({ rounds, dispatcherMedian, sequentialMedian, ratio }, null, 2));
assert.ok(ratio <= 0.95, `dispatcher regression: ratio ${ratio.toFixed(3)} exceeds 0.95`);

function measureDispatcher() {
  return timed(() => run(dispatcher));
}

function measureSequential() {
  return timed(() => guards.forEach((guard) => run(path.join(hookRoot, guard))));
}

function timed(action) {
  const start = performance.now();
  action();
  return performance.now() - start;
}

function run(script) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', input });
  assert.equal(result.status, 0, `${path.basename(script)} failed: ${result.stderr}`);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function readRounds() {
  const value = Number.parseInt(process.env.HOOK_PERF_ROUNDS || '5', 10);
  return Number.isInteger(value) && value >= 3 && value <= 20 ? value : 5;
}
