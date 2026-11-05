import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
});

export async function initializeDatabase() {
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile(fileURLToPath(new URL("../sql/schema.sql", import.meta.url)), "utf8");
  const seed = await readFile(fileURLToPath(new URL("../sql/seed.sql", import.meta.url)), "utf8");
  await pool.query(schema);
  await pool.query(seed);
}
