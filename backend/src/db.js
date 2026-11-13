import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { isProduction } from "./config.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const rawPool = mysql.createPool({
  host: process.env.MYSQL_HOST || (isProduction() ? undefined : "127.0.0.1"),
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || (isProduction() ? undefined : "root"),
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || (isProduction() ? undefined : "crop_supply"),
  ssl: isProduction()
    ? { rejectUnauthorized: true, ca: process.env.MYSQL_SSL_CA || undefined }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 60000,
  connectTimeout: 10000,
  enableKeepAlive: true,
  dateStrings: ["DATE"],
});

rawPool.on("connection", (connection) => {
  connection.on("error", (error) => {
    console.error(JSON.stringify({
      event: "mysql_connection_error",
      code: error.code || null,
      sqlState: error.sqlState || null,
    }));
  });
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
  const { rows } = await pool.query(
    `SELECT COLUMN_NAME, IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'crop_maturity_periods'`,
  );
  const columns = new Map(rows.map((row) => [row.COLUMN_NAME, row.IS_NULLABLE]));
  for (const column of ["direct_seeding_days", "transplanting_days"]) {
    if (!columns.has(column)) {
      await pool.query(`ALTER TABLE crop_maturity_periods ADD COLUMN ${column} INT NULL`);
      columns.set(column, "YES");
    }
    if (columns.get(column) === "YES") {
      await pool.query(
        `UPDATE crop_maturity_periods SET ${column} = maturity_days WHERE ${column} IS NULL`,
      );
      await pool.query(
        `ALTER TABLE crop_maturity_periods MODIFY COLUMN ${column} INT NOT NULL`,
      );
    }
  }
  await runSqlFile("../sql/triggers.sql");
}

export async function seedDatabase() {
  await runSqlFile("../sql/seed.sql");
}
