# Start Cloud Function emulator + FastAPI (Windows / local dev)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$cfDir = Join-Path $Root "cloud-function"
$beDir = Join-Path $Root "backend"

if (-not (Test-Path (Join-Path $cfDir ".venv"))) {
  Push-Location $cfDir
  python -m venv .venv
  .\.venv\Scripts\pip install -q -r requirements.txt
  Pop-Location
}

if (-not (Test-Path (Join-Path $beDir ".venv"))) {
  Push-Location $beDir
  python -m venv .venv
  .\.venv\Scripts\pip install -q -r requirements.txt
  Pop-Location
}

$envFile = Join-Path $beDir ".env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $beDir ".env.example") $envFile
}
(Get-Content $envFile) -replace '^CLOUD_FUNCTION_URL=.*', 'CLOUD_FUNCTION_URL=http://127.0.0.1:8081' |
  Set-Content $envFile

Write-Host "Starting Cloud Function on :8081 ..."
Start-Process -FilePath (Join-Path $cfDir ".venv\Scripts\functions-framework.exe") `
  -ArgumentList "--target=run_evolution", "--port=8081" `
  -WorkingDirectory $cfDir `
  -WindowStyle Minimized

Start-Sleep -Seconds 2

Write-Host "Starting API on :8000 ..."
Start-Process -FilePath (Join-Path $beDir ".venv\Scripts\uvicorn.exe") `
  -ArgumentList "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" `
  -WorkingDirectory $beDir `
  -WindowStyle Minimized

Write-Host ""
Write-Host "Open http://localhost:8000"
Write-Host "Stop: .\scripts\stop-all.ps1"
