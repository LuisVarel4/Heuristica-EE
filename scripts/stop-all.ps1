# Stop Cloud Function (:8081) and FastAPI API (:8000) started by start-all.ps1
$ErrorActionPreference = "SilentlyContinue"

function Stop-PortListener {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $pid = $conn.OwningProcess
        if ($pid -and $pid -gt 0) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Stop-Process -Id $pid -Force
                Write-Host "Stopped $($proc.ProcessName) on port $Port (pid $pid)"
            }
        }
    }
}

Write-Host "Stopping services..."
Stop-PortListener -Port 8081
Stop-PortListener -Port 8000
Start-Sleep -Seconds 1

$still = @(8000, 8081) | Where-Object {
    Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue
}
if ($still.Count -gt 0) {
    Write-Host "Warning: still listening on port(s): $($still -join ', ')"
    Write-Host "Close any remaining minimized Python/uvicorn windows manually."
} else {
    Write-Host "All services stopped."
}
