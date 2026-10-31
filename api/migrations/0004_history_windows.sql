CREATE TABLE ingestion_ranges_next (
  start INTEGER PRIMARY KEY,
  end INTEGER NOT NULL CHECK(end>=start AND end-start<8192),
  object_key TEXT,
  hash TEXT,
  complete INTEGER NOT NULL DEFAULT 0,
  applied INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
INSERT INTO ingestion_ranges_next SELECT * FROM ingestion_ranges;
DROP TABLE ingestion_ranges;
ALTER TABLE ingestion_ranges_next RENAME TO ingestion_ranges;
