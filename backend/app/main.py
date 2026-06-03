from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.algorithm import AlgorithmServiceError, run_algorithm
from app.config import settings
from app.db import (
    fetch_leaderboard,
    get_db,
    get_last_submission_time,
    init_db,
    insert_submission,
    parse_iso,
    seconds_since,
)
from app.schemas import (
    CooldownResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    SubmitRequest,
    SubmitResponse,
)

app = FastAPI(title="Heuristica EE", version="1.0.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def cooldown_state(email: str) -> tuple[bool, int, str | None]:
    normalized = email.strip().lower()
    with get_db() as conn:
        last_at = get_last_submission_time(conn, normalized)

    if not last_at:
        return True, 0, None

    elapsed = seconds_since(last_at)
    remaining = max(0, int(settings.cooldown_seconds - elapsed))
    if remaining > 0:
        next_dt = parse_iso(last_at) + timedelta(seconds=settings.cooldown_seconds)
        if next_dt.tzinfo is None:
            next_dt = next_dt.replace(tzinfo=timezone.utc)
        return False, remaining, next_dt.isoformat()

    return True, 0, None


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/cooldown", response_model=CooldownResponse)
def cooldown(email: str = Query(..., min_length=3, max_length=254)) -> CooldownResponse:
    can_submit, remaining, next_at = cooldown_state(email)
    return CooldownResponse(
        email=email.strip().lower(),
        can_submit=can_submit,
        remaining_seconds=remaining,
        next_submit_at=next_at,
    )


@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard(response: Response) -> LeaderboardResponse:
    response.headers["Cache-Control"] = "no-store"
    with get_db() as conn:
        rows = fetch_leaderboard(conn, settings.leaderboard_limit)

    entries = [
        LeaderboardEntry(
            rank=index + 1,
            email=row["email"],
            mu=row["mu"],
            sigma=row["sigma"],
            generaciones=row["generaciones"],
            solucion=row["solucion"],
            fitness=row["fitness"],
            created_at=row["created_at"],
        )
        for index, row in enumerate(rows)
    ]
    return LeaderboardResponse(entries=entries)


@app.post("/api/submit", response_model=SubmitResponse)
async def submit(body: SubmitRequest) -> SubmitResponse:
    email = body.email.strip().lower()
    can_submit, remaining, next_at = cooldown_state(email)
    if not can_submit:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Wait before submitting again",
                "remaining_seconds": remaining,
                "next_submit_at": next_at,
            },
        )

    try:
        result = await run_algorithm(body.mu, body.sigma, body.generaciones)
    except AlgorithmServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    with get_db() as conn:
        submission_id = insert_submission(
            conn,
            email=email,
            mu=body.mu,
            sigma=body.sigma,
            generaciones=body.generaciones,
            solucion=result["solucion"],
            fitness=result["fitness"],
        )
        row = conn.execute("SELECT created_at FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        created_at = row["created_at"] if row else ""

    next_submit = parse_iso(created_at) + timedelta(seconds=settings.cooldown_seconds)
    if next_submit.tzinfo is None:
        next_submit = next_submit.replace(tzinfo=timezone.utc)

    return SubmitResponse(
        id=submission_id,
        email=email,
        mu=body.mu,
        sigma=body.sigma,
        generaciones=body.generaciones,
        solucion=result["solucion"],
        fitness=result["fitness"],
        created_at=created_at,
        cooldown_seconds=settings.cooldown_seconds,
        next_submit_at=next_submit.isoformat(),
    )


# Serve frontend from ../frontend when running on the VM
import os
from pathlib import Path

_frontend = Path(__file__).resolve().parent.parent.parent / "frontend"
if _frontend.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="frontend")
