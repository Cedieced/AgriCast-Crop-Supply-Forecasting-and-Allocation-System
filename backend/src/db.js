import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const rawPool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "crop_supply",
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: ["DATE"],
});

function createClient(connection) {
  return {
    async query(statement, values = []) {
      const [result] = await connection.query(statement, values);
      return Array.isArray(result)
        ? { rows: result }
        : { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
    },
    async release(destroy = false) {
      if (destroy) connection.destroy();
      else connection.release();
    },
  };
}

export const pool = {
  async query(statement, values = []) {
    const [result] = await rawPool.query(statement, values);
    return Array.isArray(result)
      ? { rows: result }
      : { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
  },
  async connect() {
    return createClient(await rawPool.getConnection());
  },
  async end() {
    await rawPool.end();
  },
};

async function runSqlFile(path) {
  const contents = await readFile(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  for (const statement of contents.split(";").map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}

export async function initializeDatabase() {
  await runSqlFile("../sql/schema.sql");
  await runSqlFile("../sql/triggers.sql");
}

export async function seedDatabase() {
  await runSqlFile("../sql/seed.sql");
}
