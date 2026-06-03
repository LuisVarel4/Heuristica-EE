-- SQLite schema (created automatically on startup)
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
