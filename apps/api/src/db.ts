import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
export type DB = {
  query: (
    sql: string,
    params?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
};
export async function migrate(db: DB) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const file of readdirSync(
    resolve("packages/database/migrations"),
  ).sort()) {
    if (
      !(
        await db.query("SELECT name FROM schema_migrations WHERE name=$1", [
          file,
        ])
      ).rows.length
    ) {
      await db.query("BEGIN");
      try {
        await db.query(
          readFileSync(resolve("packages/database/migrations", file), "utf8"),
        );
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          file,
        ]);
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
    }
  }
}
export async function connect() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(734201)");
    await migrate(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(734201)");
    client.release();
  }
  return pool;
}
