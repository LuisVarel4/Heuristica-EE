# Run API + local Cloud Function emulator (two terminals recommended).
# Terminal 1 — function:
#   cd cloud-function
#   python -m venv .venv; .\.venv\Scripts\Activate.ps1
#   pip install -r requirements.txt
#   functions-framework --target=run_evolution --port=8081
#
# Terminal 2 — API:
#   cd backend
#   python -m venv .venv; .\.venv\Scripts\Activate.ps1
#   pip install -r requirements.txt
#   Copy-Item .env.example .env
#   # Edit .env: CLOUD_FUNCTION_URL=http://127.0.0.1:8081
#   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# If the leaderboard shows duplicate emails, stop the old API process and restart
# (the running server must reload after code changes).
#
# Open http://localhost:8000

Write-Host "See comments in this script for local setup steps."
