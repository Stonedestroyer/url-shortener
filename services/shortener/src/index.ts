import { randomInt } from "node:crypto";
import express from "express";
import { config } from "./config.js";
import { pool } from "./db.js";
import { getStats, recordClick } from "./analyticsClient.js";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 7;
const CODE_PATTERN = /^[0-9A-Za-z]{1,32}$/;
const MAX_URL_LENGTH = 2048;
const MAX_INSERT_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505"; // Postgres error code for a duplicate primary key

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

// No DB check here, otherwise a DB outage restarts every pod.
app.get("/healthz", (_req, res) => {
  res.send("ok");
});

app.get("/readyz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.send("ready");
  } catch {
    res.status(503).send("database unavailable");
  }
});

// Most recent links, so the page can show what is stored. There are no accounts, so this is
// everyone's links; fine for a demo, would need a login in a real service.
app.get("/api/links", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT code, target_url, created_at FROM links ORDER BY created_at DESC LIMIT 20",
  );
  res.json(rows.map((r) => ({ ...r, shortUrl: `${config.publicBaseUrl}/${r.code}` })));
});

app.get("/api/links/:code", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT code, target_url, created_at FROM links WHERE code = $1",
    [req.params.code],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(rows[0]);
});

app.get("/api/links/:code/stats", async (req, res) => {
  try {
    const stats = await getStats(req.params.code);
    res.json(stats ?? { code: req.params.code, clicks: 0 });
  } catch {
    res.status(502).json({ error: "analytics unavailable" });
  }
});

// http/https only, javascript:/data:/file: links would be dangerous.
function parseTargetUrl(input: unknown): URL | null {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // no links back to ourselves (redirect loops)
  if (url.origin === new URL(config.publicBaseUrl).origin) return null;
  return url;
}

// Random instead of a counter so codes can't be guessed and replicas don't need to coordinate.
// A collision fails on the primary key and we retry.
function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

app.post("/api/links", async (req, res) => {
  const target = parseTargetUrl(req.body?.url);
  if (!target) {
    res.status(400).json({ error: "url must be an http or https URL of at most 2048 characters" });
    return;
  }

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await pool.query("INSERT INTO links (code, target_url) VALUES ($1, $2)", [code, target.href]);
      console.log(`created ${code} -> ${target.href}`);
      res.status(201).json({ code, shortUrl: `${config.publicBaseUrl}/${code}` });
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      console.warn(`code collision on ${code}, retrying`);
    }
  }
  res.status(503).json({ error: "could not allocate a short code, try again" });
});

// Must be the last route.
app.get("/:code", async (req, res) => {
  const { code } = req.params;
  if (!CODE_PATTERN.test(code)) {
    res.status(404).send("Not found");
    return;
  }
  const { rows } = await pool.query("SELECT target_url FROM links WHERE code = $1", [code]);
  if (rows.length === 0) {
    res.status(404).send("Not found");
    return;
  }
  void recordClick(code);
  res.redirect(302, rows[0].target_url);
});

const server = app.listen(config.port, () => {
  console.log(`shortener listening on :${config.port}`);
});

// Graceful shutdown on SIGTERM so scaling down doesn't drop requests.
function shutdown(signal: string) {
  console.log(`${signal} received, finishing in-flight requests`);
  server.close(async () => {
    await pool.end();
    console.log("shortener stopped");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
