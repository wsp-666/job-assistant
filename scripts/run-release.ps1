# Run release build (API + static Web)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting API..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; if (-not (Test-Path .venv)) { python -m venv .venv; .\.venv\Scripts\pip install -r api\requirements.txt }; cd api; ..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

Start-Sleep -Seconds 2

Write-Host "Starting Web preview..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\web'; npx --yes serve -l 5173"

Write-Host "Web UI: http://127.0.0.1:5173"
Write-Host "API:    http://127.0.0.1:8000"
