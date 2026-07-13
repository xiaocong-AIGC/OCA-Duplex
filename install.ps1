$ErrorActionPreference = "Stop"

function Require-Command([string]$Name, [string]$Help) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { throw "未找到 $Name。$Help" }
  return $command
}

Write-Host "OCA-Duplex 安装程序"
Require-Command "node" "请先安装 Node.js 20 或更高版本。" | Out-Null
Require-Command "npm" "请确认 Node.js 安装包含 npm。" | Out-Null
Require-Command "codex" "请先安装并登录 OpenAI Codex CLI。" | Out-Null

$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { throw "Node.js 版本过低，需要 20 或更高版本。" }

Write-Host "正在安装 OCA-Duplex..."
& npm install --global $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw "npm 全局安装失败。" }

Write-Host ""
Write-Host "安装完成。请进入你的 Obsidian Vault，然后运行："
Write-Host "  oca-duplex init"
Write-Host "  oca-duplex doctor"

