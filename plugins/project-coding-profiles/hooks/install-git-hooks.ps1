# =============================================================
# install-git-hooks.ps1
#   Plant the project-coding-profiles encoding guard into a target
#   project's git pre-commit hook. A git hook MUST live in the target
#   repo's .git/hooks/ (git only runs it from there; that dir is not
#   version-controlled), so this installer wires a thin shim that calls
#   back into this plugin's pre-commit-encoding.js.
#
#   This file is ASCII-only on purpose (repo convention for .ps1, so
#   Windows PowerShell 5.1 never mis-reads it).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File hooks\install-git-hooks.ps1 -ProjectRoot "D:\path\to\yoooni" -Mode block
#   (omit -ProjectRoot to use the current directory; -Mode defaults to block)
# =============================================================

[CmdletBinding()]
param(
  [string]$ProjectRoot = (Get-Location).Path,
  [ValidateSet('warn', 'block', 'off')]
  [string]$Mode = 'block'
)

$ErrorActionPreference = 'Stop'

# This plugin's pre-commit script (sibling of this installer), forward-slashed for sh.
$nodeScript = (Join-Path $PSScriptRoot 'pre-commit-encoding.js')
if (-not (Test-Path $nodeScript)) {
  Write-Error "pre-commit-encoding.js not found next to installer: $nodeScript"
}
$nodeScriptSh = ($nodeScript -replace '\\', '/')

# Resolve the target repo's git dir (handles worktrees via --absolute-git-dir).
try {
  $gitDir = (& git -C $ProjectRoot rev-parse --absolute-git-dir).Trim()
} catch {
  Write-Error "Not a git repository (or git not on PATH): $ProjectRoot"
}
if ([string]::IsNullOrWhiteSpace($gitDir)) {
  Write-Error "Could not resolve .git dir for: $ProjectRoot"
}

$hooksDir = Join-Path $gitDir 'hooks'
if (-not (Test-Path $hooksDir)) { New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null }
$hookFile = Join-Path $hooksDir 'pre-commit'

$marker = 'PCP-ENCODING-GUARD'

# Back up a pre-existing, non-ours hook so we never silently clobber it.
if (Test-Path $hookFile) {
  $existing = [System.IO.File]::ReadAllText($hookFile)
  if ($existing -notmatch $marker) {
    $backup = "$hookFile.pre-pcp.bak"
    Copy-Item $hookFile $backup -Force
    Write-Warning "An existing pre-commit hook was found and backed up to:"
    Write-Warning "  $backup"
    Write-Warning "It will be REPLACED. If you need both, merge the backup into the new hook manually."
  }
}

# Build the shim with LF line endings (git's sh chokes on CRLF).
$lines = @(
  '#!/bin/sh',
  "# project-coding-profiles encoding guard (auto-installed) [$marker]",
  '# Re-install / update: run hooks/install-git-hooks.ps1 in the project-coding-profiles repo.',
  "# Source script: $nodeScriptSh",
  ": `"`${PCP_ENCODING_HOOK:=$Mode}`"",
  'export PCP_ENCODING_HOOK',
  "exec node `"$nodeScriptSh`" `"`$@`""
)
$content = ($lines -join "`n") + "`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($hookFile, $content, $utf8NoBom)

# Best-effort exec bit (matters on Unix; harmless/no-op on Windows).
try { & git -C $ProjectRoot update-index --chmod=+x ':(literal)' 2>$null } catch {}

Write-Host "Installed encoding-guard pre-commit hook:"
Write-Host "  hook : $hookFile"
Write-Host "  mode : $Mode  (PCP_ENCODING_HOOK; override per-shell with `$env:PCP_ENCODING_HOOK)"
Write-Host "  calls: node `"$nodeScriptSh`""
Write-Host ""
Write-Host "Now any 'git commit' in this project runs the encoding check regardless of editor (Cursor included)."
Write-Host "Bypass once with: git commit --no-verify"
