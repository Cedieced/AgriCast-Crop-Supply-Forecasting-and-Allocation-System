import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool, initializeDatabase } from "./db.js";
import { requireAuth, allowRoles } from "./auth.js";
import { allocationPlan, estimatedHarvestDate, expectedHarvest, supplyStatus } from "./domain.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const roles = ["admin", "municipal_officer", "provincial_officer", "field_officer"];
const officerRoles = ["admin", "municipal_officer", "provincial_officer"];

app.use(helmet());
app.use(cors({
  origin: (process.env.WEB_ORIGIN || "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174").split(",").map((origin) => origin.trim()),
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const result = await pool.query("SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = $1 AND is_active = true", [email]);
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
    const { rows } = await pool.query("SELECT id, name, email, role FROM users WHERE id = $1", [req.user.sub]);
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
       WHERE ($1::text IS NULL OR r.status = $1)
         AND ($2::text <> 'field_officer' OR r.submitted_by = $3)
       ORDER BY r.created_at DESC`,
      [status, req.user.role, req.user.sub],
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
    if (clientReportId) {
      const existing = await client.query("SELECT id, submitted_by FROM field_reports WHERE id = $1", [clientReportId]);
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
       WHERE b.name = $1 AND c.name = $2 AND m.name = 'Boac'`,
      [barangayName.trim(), cropName.trim()],
    );
    if (!references.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "The selected Boac barangay or crop type was not found" });
    }
    const farmer = await client.query(
      `INSERT INTO farmers (name) VALUES ($1) RETURNING id`,
      [farmerName.trim()],
    );
    const report = await client.query(
      `INSERT INTO field_reports (id, barangay_id, farmer_id, crop_type_id, area_ha, planting_date, planting_method,
        latitude, longitude, notes, status, submitted_by)
       VALUES (COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [clientReportId || null, references.rows[0].barangay_id, farmer.rows[0].id, references.rows[0].crop_type_id, Number(areaHa), plantingDate, plantingMethod,
        latitude ?? null, longitude ?? null, notes ?? null, status, req.user.sub],
    );
    await client.query(
      `INSERT INTO harvest_schedules (field_report_id, expected_harvest_date, expected_harvest_kg)
       VALUES ($1,$2,$3)`,
      [report.rows[0].id, estimatedHarvestDate(plantingDate, references.rows[0].maturity_days),
        expectedHarvest(areaHa, references.rows[0].average_yield_kg_ha)],
    );
    await client.query("COMMIT");
    res.status(201).json(report.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
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
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email, role, passwordHash],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "A user with this email already exists" });
    next(error);
  }
});

app.patch("/api/reports/:id/review", requireAuth, allowRoles(...officerRoles), async (req, res, next) => {
  const { status, remarks = "" } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status must be approved or rejected" });
  try {
    const { rows } = await pool.query(
      `UPDATE field_reports SET status = $1, remarks = $2, reviewed_by = $3, reviewed_at = now()
       WHERE id = $4 AND status = 'submitted' RETURNING *`,
      [status, String(remarks).slice(0, 2000), req.user.sub, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Submitted report not found" });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/forecasts", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `WITH approved AS (
        SELECT r.barangay_id, r.crop_type_id, SUM(r.area_ha)::numeric AS total_area,
          SUM(r.area_ha * c.average_yield_kg_ha)::numeric AS expected_harvest,
          MIN(r.planting_date + m.maturity_days) AS first_harvest,
          MAX(r.planting_date + m.maturity_days) AS last_harvest
        FROM field_reports r JOIN crop_types c ON c.id = r.crop_type_id
        JOIN crop_maturity_periods m ON m.crop_type_id = c.id
        WHERE r.status = 'approved' GROUP BY r.barangay_id, r.crop_type_id
      )
      SELECT b.id AS barangay_id, b.name AS barangay_name, c.id AS crop_type_id, c.name AS crop_name,
        COALESCE(a.total_area,0) AS total_area_ha, COALESCE(a.expected_harvest,0) AS expected_harvest_kg,
        (municipality.population * c.per_capita_kg_year / 52.0)::numeric AS weekly_demand_kg,
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
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (crop_type_id, source_barangay_id, target_municipality_id)
           DO UPDATE SET surplus_kg = EXCLUDED.surplus_kg, recommended_kg = EXCLUDED.recommended_kg`,
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
  if (!["accepted", "declined", "completed"].includes(status)) {
    return res.status(400).json({ error: "Status must be accepted, declined, or completed" });
  }
  try {
    const { rows } = await pool.query(
      "UPDATE recommendations SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Recommendation not found" });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/notifications", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM notifications WHERE recipient_role = $1 OR $2 = 'admin' ORDER BY created_at DESC LIMIT 100",
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
      `SELECT COUNT(*) FILTER (WHERE status='submitted')::int AS pending_reviews,
        COUNT(*) FILTER (WHERE status='approved')::int AS approved_reports,
        COALESCE(SUM(area_ha) FILTER (WHERE status='approved'),0)::numeric AS planted_area_ha,
        COALESCE(SUM(area_ha * c.average_yield_kg_ha) FILTER (WHERE status='approved'),0)::numeric AS forecast_kg
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
  const demoPassword = process.env.DEMO_PASSWORD || "BoacDemo123!";
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  for (const role of roles) {
    const email = `${role}@boac.gov.ph`;
    const name = role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    await pool.query(
      `INSERT INTO users (name,email,role,password_hash) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, role, passwordHash],
    );
  }
  await generateHarvestAlerts();
  setInterval(() => generateHarvestAlerts().catch((error) => console.error("Harvest alert generation failed:", error)), 60 * 60 * 1000).unref();
  app.listen(port, () => console.log(`Crop Supply API listening on http://localhost:${port}`));
}

async function generateHarvestAlerts() {
  const { rows } = await pool.query(
    `SELECT r.id, b.name AS barangay_name, c.name AS crop_name,
      r.planting_date + m.maturity_days AS harvest_date,
      r.area_ha * c.average_yield_kg_ha AS harvest_kg,
      municipality.population * c.per_capita_kg_year / 52.0 AS weekly_demand_kg
     FROM field_reports r
     JOIN barangays b ON b.id = r.barangay_id
     JOIN municipalities municipality ON municipality.id = b.municipality_id
     JOIN crop_types c ON c.id = r.crop_type_id
     JOIN crop_maturity_periods m ON m.crop_type_id = c.id
     WHERE r.status = 'approved'
       AND r.planting_date + m.maturity_days BETWEEN CURRENT_DATE + 14 AND CURRENT_DATE + 21`,
  );
  for (const report of rows) {
    const risk = supplyStatus(report.harvest_kg, report.weekly_demand_kg);
    const days = Math.ceil((new Date(report.harvest_date).getTime() - Date.now()) / 86400000);
    for (const recipientRole of ["municipal_officer", "provincial_officer"]) {
      await pool.query(
        `INSERT INTO notifications (dedupe_key, recipient_role, title, message, risk_status)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING`,
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
