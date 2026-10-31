CREATE TABLE ingestion_ranges (
  start INTEGER PRIMARY KEY,
  end INTEGER NOT NULL CHECK(end>=start AND end-start<512),
  object_key TEXT,
  hash TEXT,
  complete INTEGER NOT NULL DEFAULT 0,
  applied INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
