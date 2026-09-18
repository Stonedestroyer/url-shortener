import pg from "pg";
import { config } from "./config.js";

// Each replica has its own pool: N replicas = N * max connections.
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
