import pg from "pg";
import { config } from "./config.js";

// Each replica has its own pool: N replicas = N * max connections.
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

// Idle connections error when Postgres restarts; without a handler that crashes the process.
pool.on("error", (err) => console.error("idle db connection lost:", err.message));
