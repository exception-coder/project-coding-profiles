# detect-encoding.ps1
# Detect a text file's encoding, or convert a file between encodings (GBK <-> UTF-8).
# ASCII-only on purpose: PowerShell 5.1 reads this script correctly with or without BOM.
#
# Usage:
#   Detect:   powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action detect  -Path "src\Foo.java"
#   Convert:  powershell -ExecutionPolicy Bypass -File detect-encoding.ps1 -Action convert -Path "src\Foo.java" -From gbk -To utf-8
#
# Supported encoding names: gbk | utf-8 | utf-8-bom | utf-16le (read-only)
#
# Recommended GBK edit loop (avoids corrupting Chinese):
#   1) convert -From gbk   -To utf-8      (now the AI tool reads/writes correct Chinese)
#   2) edit the file with Claude / Codex / Cursor
#   3) convert -From utf-8 -To gbk        (untouched lines round-trip to identical GBK bytes)
#   4) detect to confirm it is back to gbk; check `git diff` shows only real changes.

param(
  [Parameter(Mandatory = $true)][ValidateSet('detect', 'convert')][string]$Action,
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$From,
  [string]$To
)

$ErrorActionPreference = 'Stop'

function Normalize-Name([string]$e) {
  $s = ($e + '').ToLower()
  if ($s -match '^(gb2312|gb18030|gbk|cp936|ms936)$') { return 'gbk' }
  if ($s -match '^(utf8|utf-8)$') { return 'utf-8' }
  if ($s -match '^(utf-8-bom|utf8-bom)$') { return 'utf-8-bom' }
  return $s
}

function Detect-Encoding([byte[]]$b) {
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return 'utf-8-bom' }
  if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { return 'utf-16le' }
  if ($b.Length -ge 2 -and $b[0] -eq 0xFE -and $b[1] -eq 0xFF) { return 'utf-16be' }
  $i = 0; $n = $b.Length; $multi = $false
  while ($i -lt $n) {
    $c = $b[$i]
    if ($c -lt 0x80) { $i++; continue }
    if (($c -band 0xE0) -eq 0xC0) { $extra = 1 }
    elseif (($c -band 0xF0) -eq 0xE0) { $extra = 2 }
    elseif (($c -band 0xF8) -eq 0xF0) { $extra = 3 }
    else { return 'gbk' }
    if (($i + $extra) -ge $n) { return 'gbk' }
    for ($j = 1; $j -le $extra; $j++) {
      if (($b[$i + $j] -band 0xC0) -ne 0x80) { return 'gbk' }
    }
    $multi = $true
    $i += $extra + 1
  }
  if ($multi) { return 'utf-8' } else { return 'ascii' }
}

# Encoding object for READING (BOM auto-stripped by ReadAllText for UTF variants).
function Get-Decoder([string]$name) {
  switch ($name) {
    'gbk' { return [System.Text.Encoding]::GetEncoding(936) }
    'utf-8' { return (New-Object System.Text.UTF8Encoding($false)) }
    'utf-8-bom' { return (New-Object System.Text.UTF8Encoding($false)) }
    'utf-16le' { return [System.Text.Encoding]::Unicode }
    default { throw "Unsupported source encoding: $name (use gbk | utf-8 | utf-8-bom | utf-16le)" }
  }
}

# Encoding object for WRITING (preamble/BOM written when the encoding carries one).
function Get-Encoder([string]$name) {
  switch ($name) {
    'gbk' { return [System.Text.Encoding]::GetEncoding(936) }
    'utf-8' { return (New-Object System.Text.UTF8Encoding($false)) }
    'utf-8-bom' { return (New-Object System.Text.UTF8Encoding($true)) }
    default { throw "Unsupported target encoding: $name (use gbk | utf-8 | utf-8-bom)" }
  }
}

if (-not (Test-Path -LiteralPath $Path)) { throw "File not found: $Path" }

if ($Action -eq 'detect') {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  Write-Output (Detect-Encoding $bytes)
  return
}

# convert
if (-not $From -or -not $To) { throw "convert requires -From and -To (e.g. -From gbk -To utf-8)" }
$fromName = Normalize-Name $From
$toName = Normalize-Name $To
$text = [System.IO.File]::ReadAllText($Path, (Get-Decoder $fromName))
[System.IO.File]::WriteAllText($Path, $text, (Get-Encoder $toName))
Write-Output ("converted: {0} -> {1}  ({2})" -f $fromName, $toName, $Path)
