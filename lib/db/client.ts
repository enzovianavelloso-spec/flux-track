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
  // getDashboard alone fires 14 concurrent queries in one Promise.all — with max:10 the
  // extra 4 queued for a free connection, and under Neon cold-start that queueing wait
  // could itself exceed connectionTimeoutMillis, surfacing as an outright page error
  // instead of just a slower load. DATABASE_URL points at Neon's pooler endpoint
  // (PgBouncer-style), which comfortably handles more concurrent client connections than
  // this app ever opens at once — raising the ceiling here is free.
  max: 20,
  idleTimeoutMillis: 30_000,
  // 10s, not 5s: confirmed live against this exact Neon project — the first request after
  // real idle (compute scaled to zero) can take longer than 5s to establish a connection,
  // and a too-tight timeout here turns a cold-start into a 500 on the dashboard/webhook
  // instead of just a slower first response. Still fails fast under genuine pool exhaustion
  // (an already-awake Neon accepts connections in tens of ms, not seconds).
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });
