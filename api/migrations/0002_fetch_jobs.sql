CREATE TABLE fetch_jobs (
  slot INTEGER PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL,
  last_error TEXT
);
