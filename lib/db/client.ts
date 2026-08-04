import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Single pool, reused across requests — VPS always-on process, not serverless.
const pool = new Pool({ connectionString: env.databaseUrl });

export const db = drizzle(pool, { schema });
