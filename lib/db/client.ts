import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Single pool, reused across requests — VPS always-on process, not serverless.
// Explicit limits instead of pg's defaults: without connectionTimeoutMillis, a request
// acquiring a client waits forever if the pool is exhausted (piles up rather than failing
// fast); without a bounded idle timeout, connections that Neon's pooler already dropped
// on its end can sit in the local pool looking alive until the next query on them errors.
const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
