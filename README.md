# Heuristica-EE

Class activity: students submit evolutionary algorithm parameters (`μ`, `σ`, `generaciones`; must be non-negative) and their email. The Cloud Function caps work to **μ × generaciones ≤ 10 000** (adjusting generations if needed). The backend runs a **multimodal** objective (lower fitness is better) and stores results in **SQLite**.

A **30-second cooldown per email** is enforced on the server (survives page reload). The UI also disables the button locally using `localStorage` for immediate feedback.

## Architecture

```text
Browser (VM: nginx → static + proxy)
    → FastAPI backend (VM)
        → HTTP POST → Google Cloud Function (ejecutar)
        → SQLite (submissions)
```

Expected load (~30 students, up to ~600 requests / 10 min): SQLite on a single VM and GCF `max-instances=30` are sufficient.

## Project layout

| Path | Role |
|------|------|
| `frontend/` | HTML form + leaderboard |
| `backend/` | FastAPI API, DB, calls GCF |
| `cloud-function/` | `run_evolution` HTTP function |
| `deploy/` | nginx + systemd examples |

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/submit` | Run algorithm, save row, return result + `next_submit_at` |
| `GET` | `/api/cooldown?email=` | Remaining cooldown (used after reload) |
| `GET` | `/api/leaderboard` | Top submissions by fitness (alias only, no emails) |
| `GET` | `/api/leaderboard/admin?key=` | Full leaderboard with emails (hidden; requires `ADMIN_KEY`) |
| `GET` | `/api/health` | Health check |

## Local development

**1. Cloud Function (port 8081)**

```powershell
cd cloud-function
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
functions-framework --target=run_evolution --port=8081
```

**2. Backend (port 8000)**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Set CLOUD_FUNCTION_URL=http://127.0.0.1:8081 in .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000** (the API serves the frontend).

**Both services at once (GCP VM / Linux):**

```bash
chmod +x scripts/start-all.sh scripts/stop-all.sh
./scripts/start-all.sh
```

Windows: `.\scripts\start-all.ps1` — see `HowToRun.txt`.

## Deploy Google Cloud Function

```bash
cd cloud-function
export PROJECT=your-gcp-project
export REGION=us-central1
chmod +x deploy.sh
./deploy.sh
```

Copy the HTTPS URL into `backend/.env` as `CLOUD_FUNCTION_URL`.

For production, prefer **authenticated** invocations (remove `--allow-unauthenticated`, use a service account on the VM with `roles/cloudfunctions.invoker`).

## Deploy on VM (backend + frontend)

1. Clone repo to e.g. `/opt/heuristica-ee`
2. Create venv, install `backend/requirements.txt`, copy `.env` with GCF URL
3. Install `deploy/heuristica-api.service` (adjust paths)
4. Point nginx (`deploy/nginx-heuristica.conf`) to `127.0.0.1:8000`
5. Ensure `backend/data/` is writable for SQLite

```bash
sudo systemctl enable --now heuristica-api
sudo nginx -t && sudo systemctl reload nginx
```

## Cooldown behavior

- After each successful submit, the server records `created_at` per email.
- New submits within **30s** receive HTTP **429** with `next_submit_at`.
- `GET /api/cooldown` lets the UI restore the disabled button after reload.
- `localStorage` key `heuristica_cooldown` mirrors the server window for UX only; **the server is authoritative**.

## Database

SQLite file: `backend/data/heuristica.db` (configurable via `DATABASE_PATH`).

Table `submissions`: `email`, parameters, `solucion`, `fitness`, `created_at`. All attempts are stored; the leaderboard shows **one row per email** (best fitness only), sorted by `fitness ASC`.
