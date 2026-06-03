import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    mu INTEGER NOT NULL,
    sigma REAL NOT NULL,
    generaciones INTEGER NOT NULL,
    solucion REAL NOT NULL,
    fitness REAL NOT NULL,
    alias TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_fitness
    ON submissions (fitness ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_submissions_email_created
    ON submissions (email, created_at DESC);
"""


def _connect() -> sqlite3.Connection:
    path = Path(settings.database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(submissions)")}
    if "alias" not in columns:
        conn.execute("ALTER TABLE submissions ADD COLUMN alias TEXT NOT NULL DEFAULT ''")


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def seconds_since(ts: str) -> float:
    then = parse_iso(ts)
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    return (now - then).total_seconds()


def get_last_submission_time(conn: sqlite3.Connection, email: str) -> str | None:
    row = conn.execute(
        "SELECT created_at FROM submissions WHERE email = ? ORDER BY created_at DESC LIMIT 1",
        (email.strip().lower(),),
    ).fetchone()
    return row["created_at"] if row else None


def insert_submission(
    conn: sqlite3.Connection,
    *,
    email: str,
    mu: int,
    sigma: float,
    generaciones: int,
    solucion: float,
    fitness: float,
    alias: str,
) -> int:
    created_at = utc_now_iso()
    cursor = conn.execute(
        """
        INSERT INTO submissions (email, mu, sigma, generaciones, solucion, fitness, alias, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (email.strip().lower(), mu, sigma, generaciones, solucion, fitness, alias.strip(), created_at),
    )
    return int(cursor.lastrowid)


def get_best_fitness(conn: sqlite3.Connection, email: str) -> float | None:
    row = conn.execute(
        "SELECT MIN(fitness) AS best FROM submissions WHERE email = ?",
        (email.strip().lower(),),
    ).fetchone()
    if not row or row["best"] is None:
        return None
    return float(row["best"])


def fetch_leaderboard(conn: sqlite3.Connection, limit: int) -> list[sqlite3.Row]:
    """One row per email: lowest fitness; ties by earliest created_at."""
    return conn.execute(
        """
        SELECT email, alias, mu, sigma, generaciones, solucion, fitness, created_at
        FROM (
            SELECT
                email,
                alias,
                mu,
                sigma,
                generaciones,
                solucion,
                fitness,
                created_at,
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY email
                    ORDER BY fitness ASC, created_at ASC, id ASC
                ) AS rn
            FROM submissions
        )
        WHERE rn = 1
        ORDER BY fitness ASC, created_at ASC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
