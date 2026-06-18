// =============================================================
// hook 命中事件本地登记（best-effort，绝不阻断 hook 主流程）
//
// warn 档 hook 命中规则时调用，把一行 JSON 追加到本地
//   ~/.kai-toolbox/hook-events.jsonl
// 供后续统计「规则命中频率 / 是否升 block / 谁常踩」。
//
// 设计红线（与 team-standards/hooks/event-log.js 一致）：
//   - 只写本地，绝不在 hook 里做网络/SMB IO（热路径）。
//   - 全程 try/catch 吞异常：登记失败绝不能影响放行/拦截判定。
//   - 同步到 \\IT01 共享、聚合统计都在 yoooni-daily-plugin，本文件不感知。
// =============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

function logHookEvent(ev) {
  try {
    const dir = path.join(os.homedir(), '.kai-toolbox');
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      ts: new Date().toISOString(),
      user: os.userInfo().username,
      host: os.hostname(),
      ...ev,
    };
    fs.appendFileSync(path.join(dir, 'hook-events.jsonl'), JSON.stringify(record) + '\n');
  } catch (_) {
    // 静默：登记是附带能力，任何失败都不得影响 hook 主流程
  }
}

module.exports = { logHookEvent };
