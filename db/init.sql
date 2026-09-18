-- Only runs on an empty data volume.
-- One database per service.

CREATE DATABASE links;
CREATE DATABASE analytics;

\connect links
CREATE TABLE links (
    code        TEXT PRIMARY KEY,
    target_url  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

\connect analytics
CREATE TABLE clicks (
    id          BIGSERIAL PRIMARY KEY,
    code        TEXT NOT NULL,
    clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clicks_code_idx ON clicks (code);
