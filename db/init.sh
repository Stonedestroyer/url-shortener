#!/bin/sh
# Only runs on an empty data volume.
# One database + login per service, the superuser is only used here.
# Passwords come from env vars, :'var' quotes them.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
     -v links_pw="$LINKS_DB_PASSWORD" \
     -v analytics_pw="$ANALYTICS_DB_PASSWORD" <<'SQL'
CREATE ROLE links_app LOGIN PASSWORD :'links_pw';
CREATE ROLE analytics_app LOGIN PASSWORD :'analytics_pw';

CREATE DATABASE links OWNER links_app;
CREATE DATABASE analytics OWNER analytics_app;
REVOKE ALL ON DATABASE links FROM PUBLIC;
REVOKE ALL ON DATABASE analytics FROM PUBLIC;

\connect links
SET ROLE links_app;
CREATE TABLE links (
    code        TEXT PRIMARY KEY,
    target_url  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

\connect analytics
SET ROLE analytics_app;
CREATE TABLE clicks (
    id          BIGSERIAL PRIMARY KEY,
    code        TEXT NOT NULL,
    clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clicks_code_idx ON clicks (code);
SQL
