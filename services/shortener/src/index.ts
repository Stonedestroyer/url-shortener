import express from "express";
import { config } from "./config.js";
import { pool } from "./db.js";
import { getStats } from "./analyticsClient.js";

const app = express();
app.use(express.json());
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

// TODO: create short link
app.post("/api/links", (_req, res) => {
  res.status(501).json({ error: "not implemented" });
});

// TODO: redirect + record click
// Must be the last route.
app.get("/:code", (_req, res) => {
  res.status(501).send("not implemented");
});

app.listen(config.port, () => {
  console.log(`shortener listening on :${config.port}`);
});
