import express from "express";
import { randomUUID } from "node:crypto";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, initializeDatabase, seedDatabase } from "./db.js";
import { requireAuth, allowRoles } from "./auth.js";
import { allocationPlan, estimatedHarvestDate, expectedHarvest, supplyStatus } from "./domain.js";
import { createDataChangeFeed } from "./realtime.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const roles = ["admin", "municipal_officer", "provincial_officer", "field_officer"];
const officerRoles = ["admin", "municipal_officer", "provincial_officer"];
let dataChanges;

async function releaseClient(client) {
  try {
    await client.query("SET @app_user_id = NULL");
  } catch (error) {
    await client.release(true);
    throw error;
  }
  await client.release();
}

app.use(helmet());
app.use(cors({
  origin: (process.env.WEB_ORIGIN || "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174").split(",").map((origin) => origin.trim()),
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/events", requireAuth, (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ type: "connected" })}\n\n`);
  const unsubscribe = dataChanges.subscribe((change) => {
    res.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const result = await pool.query("SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = ? AND is_active = TRUE", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }
    const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id, name, email, role FROM users WHERE id = ?", [req.user.sub]);
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/barangays", requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id, name, latitude, longitude, population FROM barangays ORDER BY name");
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/crops", requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.average_yield_kg_ha, c.per_capita_kg_year, m.maturity_days
       FROM crop_types c JOIN crop_maturity_periods m ON m.crop_type_id = c.id
       ORDER BY c.name`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports", requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const { rows } = await pool.query(
      `SELECT r.*, b.name AS barangay_name, c.name AS crop_name, u.name AS farmer_name
       FROM field_reports r JOIN barangays b ON b.id = r.barangay_id
       JOIN crop_types c ON c.id = r.crop_type_id JOIN farmers u ON u.id = r.farmer_id
       WHERE (? IS NULL OR r.status = ?)
         AND (? <> 'field_officer' OR r.submitted_by = ?)
       ORDER BY r.created_at DESC`,
      [status, status, req.user.role, req.user.sub],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports", requireAuth, async (req, res, next) => {
  const { clientReportId, barangayName, cropName, farmerName, areaHa, plantingDate, plantingMethod, latitude, longitude, notes, status = "draft" } = req.body || {};
  const parsedDate = typeof plantingDate === "string" ? new Date(`${plantingDate}T00:00:00Z`) : null;
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === plantingDate;
  const validCoordinates = (latitude == null && longitude == null) ||
    (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180);
  if ((clientReportId != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientReportId)) ||
      typeof barangayName !== "string" || !barangayName.trim() || typeof cropName !== "string" || !cropName.trim() ||
      typeof farmerName !== "string" || !farmerName.trim() || farmerName.length > 200 ||
      !Number.isFinite(Number(areaHa)) || Number(areaHa) <= 0 || !validDate || !validCoordinates ||
      (notes != null && typeof notes !== "string") ||
      !["Direct Seeding", "Transplanting"].includes(plantingMethod) || !["draft", "submitted"].includes(status)) {
    return res.status(400).json({ error: "Valid barangay, crop, farmer, positive area, planting date, method, and status are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET @app_user_id = ?", [req.user.sub]);
    if (clientReportId) {
      const existing = await client.query("SELECT id, submitted_by FROM field_reports WHERE id = ?", [clientReportId]);
      if (existing.rows[0]) {
        if (existing.rows[0].submitted_by !== req.user.sub) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "This report identifier is already in use" });
        }
        await client.query("COMMIT");
        return res.status(200).json({ id: existing.rows[0].id, alreadySynced: true });
      }
    }
    const references = await client.query(
      `SELECT b.id AS barangay_id, c.id AS crop_type_id, c.average_yield_kg_ha, maturity.maturity_days
       FROM barangays b CROSS JOIN crop_types c
       JOIN municipalities m ON m.id = b.municipality_id
       JOIN crop_maturity_periods maturity ON maturity.crop_type_id = c.id
       WHERE b.name = ? AND c.name = ? AND m.name = 'Boac'`,
      [barangayName.trim(), cropName.trim()],
    );
    if (!references.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "The selected Boac barangay or crop type was not found" });
    }
    const farmer = await client.query("INSERT INTO farmers (name) VALUES (?)", [farmerName.trim()]);
    const reportId = clientReportId || randomUUID();
    await client.query(
      `INSERT INTO field_reports (id, barangay_id, farmer_id, crop_type_id, area_ha, planting_date, planting_method,
        latitude, longitude, notes, status, submitted_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [reportId, references.rows[0].barangay_id, farmer.insertId, references.rows[0].crop_type_id, Number(areaHa), plantingDate, plantingMethod,
        latitude ?? null, longitude ?? null, notes ?? null, status, req.user.sub],
    );
    await client.query(
      `INSERT INTO harvest_schedules (field_report_id, expected_harvest_date, expected_harvest_kg)
       VALUES (?,?,?)`,
      [reportId, estimatedHarvestDate(plantingDate, references.rows[0].maturity_days),
        expectedHarvest(areaHa, references.rows[0].average_yield_kg_ha)],
    );
    await client.query("COMMIT");
    const { rows } = await pool.query("SELECT * FROM field_reports WHERE id = ?", [reportId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    await releaseClient(client);
  }
});

app.put("/api/reports/:id", requireAuth, async (req, res, next) => {
  const reportId = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return res.status(400).json({ error: "A valid report identifier is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET @app_user_id = ?", [req.user.sub]);
    const existing = await client.query(
      `SELECT r.*, b.name AS barangay_name, c.name AS crop_name, f.name AS farmer_name
       FROM field_reports r JOIN barangays b ON b.id = r.barangay_id
       JOIN crop_types c ON c.id = r.crop_type_id JOIN farmers f ON f.id = r.farmer_id
       WHERE r.id = ? FOR UPDATE`,
      [reportId],
    );
    const current = existing.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Report not found" });
    }
    if (req.user.role === "field_officer" &&
        (current.submitted_by !== req.user.sub || !["draft", "submitted"].includes(current.status))) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Report not found" });
    }

    const input = {
      barangayName: req.body?.barangayName ?? current.barangay_name,
      cropName: req.body?.cropName ?? current.crop_name,
      farmerName: req.body?.farmerName ?? current.farmer_name,
      areaHa: req.body?.areaHa ?? current.area_ha,
      plantingDate: req.body?.plantingDate ?? (
        current.planting_date instanceof Date
          ? current.planting_date.toISOString().slice(0, 10)
          : String(current.planting_date).slice(0, 10)
      ),
      plantingMethod: req.body?.plantingMethod ?? current.planting_method,
      latitude: Object.hasOwn(req.body || {}, "latitude") ? req.body.latitude : current.latitude,
      longitude: Object.hasOwn(req.body || {}, "longitude") ? req.body.longitude : current.longitude,
      notes: Object.hasOwn(req.body || {}, "notes") ? req.body.notes : current.notes,
      status: req.user.role === "field_officer"
        ? (req.body?.status ?? current.status)
        : current.status,
    };
    const parsedDate = typeof input.plantingDate === "string" ? new Date(`${input.plantingDate}T00:00:00Z`) : null;
    const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === input.plantingDate;
    const validCoordinates = (input.latitude == null && input.longitude == null) ||
      (Number.isFinite(Number(input.latitude)) && Number.isFinite(Number(input.longitude)) &&
        Number(input.latitude) >= -90 && Number(input.latitude) <= 90 &&
        Number(input.longitude) >= -180 && Number(input.longitude) <= 180);
    if (typeof input.barangayName !== "string" || !input.barangayName.trim() ||
        typeof input.cropName !== "string" || !input.cropName.trim() ||
        typeof input.farmerName !== "string" || !input.farmerName.trim() || input.farmerName.length > 200 ||
        !Number.isFinite(Number(input.areaHa)) || Number(input.areaHa) <= 0 || !validDate ||
        !validCoordinates || (input.notes != null && typeof input.notes !== "string") ||
        !["Direct Seeding", "Transplanting"].includes(input.plantingMethod) ||
        !["draft", "submitted"].includes(input.status) && req.user.role === "field_officer") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Valid barangay, crop, farmer, positive area, planting date, method, and status are required" });
    }

    const references = await client.query(
      `SELECT b.id AS barangay_id, c.id AS crop_type_id, c.average_yield_kg_ha, m.maturity_days
       FROM barangays b CROSS JOIN crop_types c
       JOIN municipalities municipality ON municipality.id = b.municipality_id
       JOIN crop_maturity_periods m ON m.crop_type_id = c.id
       WHERE b.name = ? AND c.name = ? AND municipality.name = 'Boac'`,
      [input.barangayName.trim(), input.cropName.trim()],
    );
    if (!references.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "The selected Boac barangay or crop type was not found" });
    }
    const farmer = input.farmerName.trim() === current.farmer_name
      ? { rows: [{ id: current.farmer_id }] }
      : await client.query("INSERT INTO farmers (name) VALUES (?)", [input.farmerName.trim()]);
    const farmerId = farmer.insertId ?? farmer.rows[0].id;
    await client.query(
      `UPDATE field_reports SET barangay_id = ?, crop_type_id = ?, farmer_id = ?,
        area_ha = ?, planting_date = ?, planting_method = ?, latitude = ?, longitude = ?,
        notes = ?, status = ?
       WHERE id = ?`,
      [references.rows[0].barangay_id, references.rows[0].crop_type_id, farmerId,
        Number(input.areaHa), input.plantingDate, input.plantingMethod, input.latitude ?? null,
        input.longitude ?? null, input.notes ?? null, input.status, reportId],
    );
    await client.query(
      `INSERT INTO harvest_schedules (field_report_id, expected_harvest_date, expected_harvest_kg)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE
         expected_harvest_date = VALUES(expected_harvest_date),
         expected_harvest_kg = VALUES(expected_harvest_kg)`,
      [reportId, estimatedHarvestDate(input.plantingDate, references.rows[0].maturity_days),
        expectedHarvest(input.areaHa, references.rows[0].average_yield_kg_ha)],
    );
    await client.query("COMMIT");
    const { rows } = await pool.query("SELECT * FROM field_reports WHERE id = ?", [reportId]);
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    await releaseClient(client);
  }
});

app.delete("/api/reports/:id", requireAuth, async (req, res, next) => {
  const reportId = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return res.status(400).json({ error: "A valid report identifier is required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET @app_user_id = ?", [req.user.sub]);
    const result = await client.query(
      `DELETE FROM field_reports
       WHERE id = ?
         AND (? <> 'field_officer' OR (submitted_by = ? AND status IN ('draft','submitted')))`,
      [reportId, req.user.role, req.user.sub],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Report not found" });
    }
    await client.query("COMMIT");
    res.json({ id: reportId, deleted: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    await releaseClient(client);
  }
});

app.get("/api/users", requireAuth, allowRoles("admin"), async (_req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name");
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireAuth, allowRoles("admin"), async (req, res, next) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || !roles.includes(role)) {
    return res.status(400).json({ error: "A name, valid email, role, and password of at least 12 characters are required" });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    await pool.query(
      "INSERT INTO users (id, name, email, role, password_hash) VALUES (?,?,?,?,?)",
      [id, name, email, role, passwordHash],
    );
    const { rows } = await pool.query(
      "SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?",
      [id],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A user with this email already exists" });
    next(error);
  }
});

app.patch("/api/reports/:id/review", requireAuth, allowRoles(...officerRoles), async (req, res, next) => {
  const { status, remarks = "" } = req.body;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id) ||
      !["approved", "rejected"].includes(status) || typeof remarks !== "string" || remarks.length > 2000) {
    return res.status(400).json({ error: "A valid report ID, approved/rejected status, and remarks up to 2000 characters are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET @app_user_id = ?", [req.user.sub]);
    const result = await client.query(
      `UPDATE field_reports SET status = ?, remarks = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'submitted'`,
      [status, remarks, req.user.sub, req.params.id],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Submitted report not found" });
    }
    await client.query("COMMIT");
    const { rows } = await pool.query("SELECT * FROM field_reports WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    await releaseClient(client);
  }
});

app.get("/api/forecasts", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `WITH approved AS (
        SELECT r.barangay_id, r.crop_type_id, SUM(r.area_ha) AS total_area,
          SUM(r.area_ha * c.average_yield_kg_ha) AS expected_harvest,
          MIN(DATE_ADD(r.planting_date, INTERVAL m.maturity_days DAY)) AS first_harvest,
          MAX(DATE_ADD(r.planting_date, INTERVAL m.maturity_days DAY)) AS last_harvest
        FROM field_reports r JOIN crop_types c ON c.id = r.crop_type_id
        JOIN crop_maturity_periods m ON m.crop_type_id = c.id
        WHERE r.status = 'approved' GROUP BY r.barangay_id, r.crop_type_id
      )
      SELECT b.id AS barangay_id, b.name AS barangay_name, c.id AS crop_type_id, c.name AS crop_name,
        COALESCE(a.total_area,0) AS total_area_ha, COALESCE(a.expected_harvest,0) AS expected_harvest_kg,
        (municipality.population * c.per_capita_kg_year / 52.0) AS weekly_demand_kg,
        a.first_harvest, a.last_harvest,
        CASE WHEN COALESCE(a.expected_harvest,0) > (municipality.population * c.per_capita_kg_year / 52.0) THEN 'oversupply'
             WHEN COALESCE(a.expected_harvest,0) < (municipality.population * c.per_capita_kg_year / 52.0) THEN 'shortage'
             ELSE 'balanced' END AS supply_status,
        CASE WHEN COALESCE(a.expected_harvest,0) = (municipality.population * c.per_capita_kg_year / 52.0) THEN 'green'
             WHEN municipality.population * c.per_capita_kg_year = 0
               OR ABS(COALESCE(a.expected_harvest,0) - (municipality.population * c.per_capita_kg_year / 52.0))
                  >= (municipality.population * c.per_capita_kg_year / 52.0) * 0.25 THEN 'red'
             ELSE 'yellow' END AS risk_status
      FROM barangays b JOIN municipalities municipality ON municipality.id = b.municipality_id
      CROSS JOIN crop_types c
      LEFT JOIN approved a ON a.barangay_id = b.id AND a.crop_type_id = c.id
      ORDER BY b.name,c.name`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/recommendations", requireAuth, async (_req, res, next) => {
  try {
    const boac = await pool.query(
      `SELECT c.id AS crop_type_id, c.name AS crop_name,
        c.per_capita_kg_year * m.population / 52.0 AS weekly_demand_kg,
        COALESCE(SUM(r.area_ha * c.average_yield_kg_ha),0) AS expected_supply_kg,
        (SELECT b.id FROM field_reports source_report
          JOIN barangays b ON b.id = source_report.barangay_id
          WHERE source_report.status = 'approved' AND source_report.crop_type_id = c.id
            AND b.municipality_id = m.id
          GROUP BY b.id ORDER BY SUM(source_report.area_ha * c.average_yield_kg_ha) DESC LIMIT 1) AS source_barangay_id
       FROM crop_types c CROSS JOIN municipalities m
       LEFT JOIN barangays b ON b.municipality_id = m.id
       LEFT JOIN field_reports r ON r.barangay_id = b.id AND r.crop_type_id = c.id AND r.status = 'approved'
       WHERE m.name = 'Boac'
       GROUP BY c.id, c.name, c.per_capita_kg_year, m.population, m.id`,
    );
    const destinations = await pool.query(
      `SELECT municipality.id AS municipality_id, municipality.name,
        crop.id AS crop_type_id,
        GREATEST(municipality.population * crop.per_capita_kg_year / 52.0 - COALESCE(SUM(report.area_ha * crop.average_yield_kg_ha),0), 0) AS remaining_demand_kg
       FROM municipalities municipality CROSS JOIN crop_types crop
       LEFT JOIN barangays b ON b.municipality_id = municipality.id
       LEFT JOIN field_reports report ON report.barangay_id = b.id AND report.crop_type_id = crop.id AND report.status = 'approved'
       WHERE municipality.name <> 'Boac'
       GROUP BY municipality.id, municipality.name, municipality.population, crop.id, crop.per_capita_kg_year`,
    );
    const destinationByCrop = new Map();
    for (const destination of destinations.rows) {
      const current = destinationByCrop.get(destination.crop_type_id) || [];
      current.push(destination);
      destinationByCrop.set(destination.crop_type_id, current);
    }
    for (const crop of boac.rows) {
      const totalSurplus = Math.max(0, Number(crop.expected_supply_kg) - Number(crop.weekly_demand_kg));
      if (!crop.source_barangay_id || totalSurplus === 0) continue;
      const plan = allocationPlan(totalSurplus, destinationByCrop.get(crop.crop_type_id) || []);
      for (const neighbor of plan) {
        await pool.query(
          `INSERT INTO recommendations (crop_type_id, source_barangay_id, target_municipality_id, surplus_kg, recommended_kg)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             surplus_kg = VALUES(surplus_kg),
             recommended_kg = VALUES(recommended_kg)`,
          [crop.crop_type_id, crop.source_barangay_id, neighbor.municipality_id, totalSurplus, neighbor.recommended_kg],
        );
      }
    }
    const { rows } = await pool.query(
      `SELECT rec.*, c.name AS crop_name, b.name AS source_barangay, target.name AS target_municipality
       FROM recommendations rec JOIN crop_types c ON c.id = rec.crop_type_id
       JOIN barangays b ON b.id = rec.source_barangay_id
       JOIN municipalities target ON target.id = rec.target_municipality_id ORDER BY rec.created_at DESC`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/recommendations/:id", requireAuth, allowRoles(...officerRoles), async (req, res, next) => {
  const { status } = req.body;
  if (!/^\d+$/.test(req.params.id) || !["accepted", "declined", "completed"].includes(status)) {
    return res.status(400).json({ error: "A valid recommendation ID and status are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET @app_user_id = ?", [req.user.sub]);
    const result = await client.query(
      "UPDATE recommendations SET status = ? WHERE id = ?",
      [status, req.params.id],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Recommendation not found" });
    }
    await client.query("COMMIT");
    const { rows } = await pool.query("SELECT * FROM recommendations WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    await releaseClient(client);
  }
});

app.get("/api/notifications", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM notifications WHERE recipient_role = ? OR ? = 'admin' ORDER BY created_at DESC LIMIT 100",
      [req.user.role, req.user.role],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/summary", requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(status = 'submitted'), 0) AS pending_reviews,
        COALESCE(SUM(status = 'approved'), 0) AS approved_reports,
        COALESCE(SUM(IF(status = 'approved', area_ha, 0)), 0) AS planted_area_ha,
        COALESCE(SUM(IF(status = 'approved', area_ha * c.average_yield_kg_ha, 0)), 0) AS forecast_kg
       FROM field_reports r JOIN crop_types c ON c.id = r.crop_type_id`,
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "An unexpected server error occurred" });
});

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw new Error("JWT_SECRET must be set to at least 24 characters");
  }
  await initializeDatabase();
  dataChanges = createDataChangeFeed(pool);
  const demoPassword = process.env.DEMO_PASSWORD || "BoacDemo123!";
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  for (const role of roles) {
    const email = `${role}@boac.gov.ph`;
    const name = role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    await pool.query(
      `INSERT IGNORE INTO users (id,name,email,role,password_hash) VALUES (?,?,?,?,?)`,
      [randomUUID(), name, email, role, passwordHash],
    );
  }
  await seedDatabase();
  await generateHarvestAlerts();
  setInterval(() => generateHarvestAlerts().catch((error) => console.error("Harvest alert generation failed:", error)), 60 * 60 * 1000).unref();
  app.listen(port, () => console.log(`Crop Supply API listening on http://localhost:${port}`));
}

async function generateHarvestAlerts() {
  const { rows } = await pool.query(
    `SELECT r.id, b.name AS barangay_name, c.name AS crop_name,
      DATE_ADD(r.planting_date, INTERVAL m.maturity_days DAY) AS harvest_date,
      r.area_ha * c.average_yield_kg_ha AS harvest_kg,
      municipality.population * c.per_capita_kg_year / 52.0 AS weekly_demand_kg
     FROM field_reports r
     JOIN barangays b ON b.id = r.barangay_id
     JOIN municipalities municipality ON municipality.id = b.municipality_id
     JOIN crop_types c ON c.id = r.crop_type_id
     JOIN crop_maturity_periods m ON m.crop_type_id = c.id
     WHERE r.status = 'approved'
       AND DATE_ADD(r.planting_date, INTERVAL m.maturity_days DAY)
         BETWEEN DATE_ADD(CURRENT_DATE, INTERVAL 14 DAY) AND DATE_ADD(CURRENT_DATE, INTERVAL 21 DAY)`,
  );
  for (const report of rows) {
    const risk = supplyStatus(report.harvest_kg, report.weekly_demand_kg);
    const days = Math.ceil((new Date(report.harvest_date).getTime() - Date.now()) / 86400000);
    for (const recipientRole of ["municipal_officer", "provincial_officer"]) {
      await pool.query(
        `INSERT INTO notifications (dedupe_key, recipient_role, title, message, risk_status)
         VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE dedupe_key = dedupe_key`,
        [`harvest:${report.id}:${recipientRole}`, recipientRole, `${report.crop_name} harvest in ${days} days`,
          `${report.crop_name} · ${report.barangay_name} · ${new Date(report.harvest_date).toLocaleDateString("en-CA")} · ${Math.round(Number(report.harvest_kg)).toLocaleString()} kg · ${risk}`,
          risk],
      );
    }
  }
}

start().catch((error) => {
  console.error("API startup failed:", error);
  process.exitCode = 1;
});
