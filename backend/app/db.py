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

CREATE TABLE IF NOT EXISTS whitelist (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

# Correos habilitados para el reto. Se insertan solo si la tabla está vacía.
_INITIAL_WHITELIST: set[str] = {
    "maalvarezmu@unal.edu.co",
    "alariaso@unal.edu.co",
    "jbautistat@unal.edu.co",
    "mbuilesd@unal.edu.co",
    "scastanomi@unal.edu.co",
    "viduquev@unal.edu.co",
    "saescobara@unal.edu.co",
    "igomezca@unal.edu.co",
    "jegomeza@unal.edu.co",
    "nguaranguay@unal.edu.co",
    "aguaring@unal.edu.co",
    "mhenao@unal.edu.co",
    "shernadezdu@unal.edu.co",
    "ihernandezs@unal.edu.co",
    "whuertas@unal.edu.co",
    "matlopezca@unal.edu.co",
    "jlopezmor@unal.edu.co",
    "llotero0@unal.edu.co",
    "jmarquezco@unal.edu.co",
    "emmejiaa@unal.edu.co",
    "saamejiaga@unal.edu.co",
    "lmejiar@unal.edu.co",
    "smolinav@unal.edu.co",
    "jmontielv@unal.edu.co",
    "almontoyav@unal.edu.co",
    "cplazaso@unal.edu.co",
    "kpuentesb@unal.edu.co",
    "jhramirezhe@unal.edu.co",
    "jramirezta@unal.edu.co",
    "juarodriquezs@unal.edu.co",
    "ssaldarriagam@unal.edu.co",
    "ssuarezlo@unal.edu.co",
    "jsucerquia@unal.edu.co",
    "btoro@unal.edu.co",
    "slvallejoco@unal.edu.co",
    "luvarelao@unal.edu.co",
    "mmvillarragaf@unal.edu.co",
}


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
        _seed_whitelist(conn)
        _seed_settings(conn)


def _seed_whitelist(conn: sqlite3.Connection) -> None:
    """Inserta la lista inicial de correos solo si la tabla está vacía."""
    count = conn.execute("SELECT COUNT(*) FROM whitelist").fetchone()[0]
    if count == 0:
        now = utc_now_iso()
        conn.executemany(
            "INSERT OR IGNORE INTO whitelist (email, added_at) VALUES (?, ?)",
            [(e.lower(), now) for e in _INITIAL_WHITELIST],
        )


def _seed_settings(conn: sqlite3.Connection) -> None:
    """Inicializa el toggle de whitelist si aún no existe."""
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('whitelist_enabled', '1')"
    )


# ── Whitelist helpers ────────────────────────────────────────────────────


def is_whitelist_enabled(conn: sqlite3.Connection) -> bool:
    """Retorna True si la lista blanca está activa."""
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key = 'whitelist_enabled'"
    ).fetchone()
    return row is not None and row["value"] == "1"


def set_whitelist_enabled(conn: sqlite3.Connection, enabled: bool) -> None:
    """Activa o desactiva la lista blanca."""
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('whitelist_enabled', ?)",
        ("1" if enabled else "0",),
    )


def is_email_whitelisted(conn: sqlite3.Connection, email: str) -> bool:
    """Retorna True si el correo está en la lista blanca."""
    row = conn.execute(
        "SELECT 1 FROM whitelist WHERE email = ?",
        (email.strip().lower(),),
    ).fetchone()
    return row is not None


def add_to_whitelist(conn: sqlite3.Connection, email: str) -> bool:
    """Agrega un correo a la lista blanca. Retorna False si ya existía."""
    try:
        conn.execute(
            "INSERT INTO whitelist (email, added_at) VALUES (?, ?)",
            (email.strip().lower(), utc_now_iso()),
        )
        return True
    except sqlite3.IntegrityError:
        return False


def list_whitelist(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Retorna todos los correos de la lista blanca ordenados alfabéticamente."""
    return conn.execute(
        "SELECT email, added_at FROM whitelist ORDER BY email ASC"
    ).fetchall()


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
