from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.algorithm import AlgorithmServiceError, run_algorithm
from app.config import settings
from app.email_rules import normalize_unal_email  # noqa: F401 (also used in search endpoint)
from app.db import (
    add_to_whitelist,
    clear_submissions,
    fetch_leaderboard,
    get_best_fitness,
    get_db,
    get_last_submission_time,
    init_db,
    insert_submission,
    is_email_whitelisted,
    is_whitelist_enabled,
    list_whitelist,
    parse_iso,
    seconds_since,
    set_whitelist_enabled,
)
from app.schemas import (
    AddEmailRequest,
    ConfigResponse,
    CooldownResponse,
    LeaderboardAdminEntry,
    LeaderboardAdminResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    SubmitRequest,
    SubmitResponse,
    ToggleWhitelistRequest,
    WhitelistEntry,
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
    if not settings.admin_key:
        raise HTTPException(
            status_code=503,
            detail="Admin key not configured. Set ADMIN_KEY in .env",
        )
    if key != settings.admin_key:
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


@app.get("/admin/config", response_model=ConfigResponse, include_in_schema=False)
def admin_get_config(key: str | None = Query(None, max_length=128)) -> ConfigResponse:
    """Retorna el estado de la lista blanca y el total de correos (sin exponerlos)."""
    _check_admin_key(key)
    with get_db() as conn:
        enabled = is_whitelist_enabled(conn)
        rows = list_whitelist(conn)
    return ConfigResponse(
        whitelist_enabled=enabled,
        whitelist_count=len(rows),
    )


@app.post("/admin/leaderboard/clear", include_in_schema=False)
def admin_clear_leaderboard(key: str | None = Query(None, max_length=128)) -> dict:
    """Elimina todos los envíos del leaderboard. Acción irreversible."""
    _check_admin_key(key)
    with get_db() as conn:
        deleted = clear_submissions(conn)
    return {"ok": True, "deleted": deleted}


@app.get("/admin/config/emails", include_in_schema=False)
def admin_list_emails(key: str | None = Query(None, max_length=128)) -> dict:
    """Retorna la lista completa de correos. Solo para uso en /admin/emails."""
    _check_admin_key(key)
    with get_db() as conn:
        rows = list_whitelist(conn)
    return {"emails": [{"email": r["email"], "added_at": r["added_at"]} for r in rows]}


@app.get("/admin/config/search", include_in_schema=False)
def admin_search_email(
    email: str = Query(..., min_length=3, max_length=254),
    key: str | None = Query(None, max_length=128),
) -> dict:
    """Verifica si un correo específico está en la lista blanca."""
    _check_admin_key(key)
    try:
        normalized = normalize_unal_email(email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with get_db() as conn:
        found = is_email_whitelisted(conn, normalized)
    return {"email": normalized, "in_whitelist": found}


@app.post("/admin/config/whitelist", include_in_schema=False)
def admin_add_email(
    body: AddEmailRequest,
    key: str | None = Query(None, max_length=128),
) -> dict:
    """Agrega un correo a la lista blanca."""
    _check_admin_key(key)
    with get_db() as conn:
        added = add_to_whitelist(conn, body.email)
    if not added:
        raise HTTPException(status_code=409, detail="El correo ya está en la lista.")
    return {"ok": True, "email": body.email}


@app.post("/admin/config/toggle", include_in_schema=False)
def admin_toggle_whitelist(
    body: ToggleWhitelistRequest,
    key: str | None = Query(None, max_length=128),
) -> dict:
    """Activa o desactiva la verificación de lista blanca."""
    _check_admin_key(key)
    with get_db() as conn:
        set_whitelist_enabled(conn, body.enabled)
    return {"ok": True, "whitelist_enabled": body.enabled}


@app.get("/resultados/ocultos", include_in_schema=False)
def pagina_resultados_ocultos() -> FileResponse:
    path = _frontend / "resultados" / "ocultos.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Admin page not found")
    return FileResponse(path)


@app.get("/admin/emails", include_in_schema=False)
def pagina_admin_emails() -> FileResponse:
    path = _frontend / "admin" / "emails.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path)


@app.get("/admin", include_in_schema=False)
def pagina_admin_config() -> FileResponse:
    path = _frontend / "admin" / "index.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Admin config page not found")
    return FileResponse(path)


@app.post("/api/submit", response_model=SubmitResponse)
async def submit(body: SubmitRequest) -> SubmitResponse:
    email = body.email

    # Verificar lista blanca (si está habilitada)
    with get_db() as conn:
        if is_whitelist_enabled(conn) and not is_email_whitelisted(conn, email):
            raise HTTPException(
                status_code=403,
                detail="Este correo no está habilitado para participar en el reto.",
            )

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
