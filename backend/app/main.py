from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.algorithm import AlgorithmServiceError, run_algorithm
from app.config import settings
from app.email_rules import normalize_unal_email
from app.db import (
    fetch_leaderboard,
    get_best_fitness,
    get_db,
    get_last_submission_time,
    init_db,
    insert_submission,
    parse_iso,
    seconds_since,
)
from app.schemas import (
    CooldownResponse,
    LeaderboardAdminEntry,
    LeaderboardAdminResponse,
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

_frontend = Path(__file__).resolve().parent.parent.parent / "frontend"


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


def _mask_params_for_viewer(row_email: str, viewer_email: str | None) -> bool:
    if not viewer_email or not viewer_email.strip():
        return True
    return row_email.lower() != viewer_email.strip().lower()


def _display_alias(raw: str) -> str:
    cleaned = (raw or "").strip()
    return cleaned if cleaned else "—"


def _check_admin_key(key: str | None) -> None:
    if settings.admin_key and key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")


def _build_public_entries(rows, viewer_email: str | None) -> list[LeaderboardEntry]:
    entries = []
    for index, row in enumerate(rows):
        hide = _mask_params_for_viewer(row["email"], viewer_email)
        entries.append(
            LeaderboardEntry(
                rank=index + 1,
                alias=_display_alias(row["alias"]),
                mu=None if hide else row["mu"],
                sigma=None if hide else row["sigma"],
                generaciones=None if hide else row["generaciones"],
                solucion=row["solucion"],
                fitness=row["fitness"],
                created_at=row["created_at"],
            )
        )
    return entries


def _build_admin_entries(rows) -> list[LeaderboardAdminEntry]:
    return [
        LeaderboardAdminEntry(
            rank=index + 1,
            email=row["email"],
            alias=_display_alias(row["alias"]),
            mu=row["mu"],
            sigma=row["sigma"],
            generaciones=row["generaciones"],
            solucion=row["solucion"],
            fitness=row["fitness"],
            created_at=row["created_at"],
        )
        for index, row in enumerate(rows)
    ]


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/cooldown", response_model=CooldownResponse)
def cooldown(email: str = Query(..., min_length=3, max_length=254)) -> CooldownResponse:
    try:
        normalized = normalize_unal_email(email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    can_submit, remaining, next_at = cooldown_state(normalized)
    return CooldownResponse(
        email=normalized,
        can_submit=can_submit,
        remaining_seconds=remaining,
        next_submit_at=next_at,
    )


@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    response: Response,
    viewer_email: str | None = Query(None, max_length=254),
) -> LeaderboardResponse:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    normalized_viewer: str | None = None
    if viewer_email and viewer_email.strip():
        try:
            normalized_viewer = normalize_unal_email(viewer_email)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    with get_db() as conn:
        rows = fetch_leaderboard(conn, settings.leaderboard_limit)

    return LeaderboardResponse(entries=_build_public_entries(rows, normalized_viewer))


@app.get("/api/leaderboard/admin", response_model=LeaderboardAdminResponse, include_in_schema=False)
def leaderboard_admin(
    response: Response,
    key: str | None = Query(None, max_length=128),
) -> LeaderboardAdminResponse:
    _check_admin_key(key)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"

    with get_db() as conn:
        rows = fetch_leaderboard(conn, settings.leaderboard_limit)

    return LeaderboardAdminResponse(entries=_build_admin_entries(rows))


@app.get("/resultados/ocultos", include_in_schema=False)
def pagina_resultados_ocultos() -> FileResponse:
    path = _frontend / "resultados" / "ocultos.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Admin page not found")
    return FileResponse(path)


@app.post("/api/submit", response_model=SubmitResponse)
async def submit(body: SubmitRequest) -> SubmitResponse:
    email = body.email
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
        previous_best = get_best_fitness(conn, email)
        submission_id = insert_submission(
            conn,
            email=email,
            mu=result["mu"],
            sigma=result["sigma"],
            generaciones=result["generaciones"],
            solucion=result["solucion"],
            fitness=result["fitness"],
            alias=body.alias,
        )
        row = conn.execute("SELECT created_at FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        created_at = row["created_at"] if row else ""

    new_fitness = float(result["fitness"])
    is_new_best = previous_best is None or new_fitness < previous_best

    next_submit = parse_iso(created_at) + timedelta(seconds=settings.cooldown_seconds)
    if next_submit.tzinfo is None:
        next_submit = next_submit.replace(tzinfo=timezone.utc)

    return SubmitResponse(
        id=submission_id,
        email=email,
        alias=body.alias,
        mu=result["mu"],
        sigma=result["sigma"],
        generaciones=result["generaciones"],
        solucion=result["solucion"],
        fitness=result["fitness"],
        created_at=created_at,
        cooldown_seconds=settings.cooldown_seconds,
        next_submit_at=next_submit.isoformat(),
        mensaje=result.get("mensaje"),
        is_new_best=is_new_best,
    )


if _frontend.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend), html=True), name="frontend")
