import { pool, initializeDatabase } from "./db.js";
import { validateEnvironment } from "./config.js";

try {
  validateEnvironment();
  await initializeDatabase();
  console.log("Database schema and audit triggers are ready.");
} catch (error) {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
