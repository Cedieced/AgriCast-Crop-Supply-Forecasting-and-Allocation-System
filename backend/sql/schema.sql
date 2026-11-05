CREATE TABLE IF NOT EXISTS municipalities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  population INTEGER NOT NULL DEFAULT 0 CHECK (population >= 0)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','municipal_officer','provincial_officer','field_officer')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barangays (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
  name TEXT NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  population INTEGER NOT NULL DEFAULT 0 CHECK (population >= 0),
  UNIQUE (municipality_id, name)
);

CREATE TABLE IF NOT EXISTS farmers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crop_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  average_yield_kg_ha NUMERIC(12,2) NOT NULL CHECK (average_yield_kg_ha > 0),
  per_capita_kg_year NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (per_capita_kg_year >= 0)
);

CREATE TABLE IF NOT EXISTS crop_maturity_periods (
  id SERIAL PRIMARY KEY,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE CASCADE,
  maturity_days INTEGER NOT NULL CHECK (maturity_days > 0),
  UNIQUE (crop_type_id)
);

CREATE TABLE IF NOT EXISTS field_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id INTEGER NOT NULL REFERENCES barangays(id),
  farmer_id INTEGER NOT NULL REFERENCES farmers(id),
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id),
  area_ha NUMERIC(10,3) NOT NULL CHECK (area_ha > 0),
  planting_date DATE NOT NULL,
  planting_method TEXT NOT NULL CHECK (planting_method IN ('Direct Seeding','Transplanting')),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  remarks TEXT,
  submitted_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS field_reports_status_idx ON field_reports(status);
CREATE INDEX IF NOT EXISTS field_reports_harvest_idx ON field_reports(planting_date, crop_type_id);

CREATE TABLE IF NOT EXISTS forecasts (
  id SERIAL PRIMARY KEY,
  barangay_id INTEGER NOT NULL REFERENCES barangays(id),
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id),
  forecast_week DATE NOT NULL,
  total_area_ha NUMERIC(12,3) NOT NULL DEFAULT 0,
  expected_harvest_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  demand_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  supply_status TEXT NOT NULL CHECK (supply_status IN ('oversupply','shortage','balanced')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barangay_id, crop_type_id, forecast_week)
);

CREATE TABLE IF NOT EXISTS harvest_schedules (
  id SERIAL PRIMARY KEY,
  field_report_id UUID NOT NULL UNIQUE REFERENCES field_reports(id) ON DELETE CASCADE,
  expected_harvest_date DATE NOT NULL,
  expected_harvest_kg NUMERIC(14,2) NOT NULL,
  notification_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS demand_records (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id),
  demand_week DATE NOT NULL,
  demand_kg NUMERIC(14,2) NOT NULL CHECK (demand_kg >= 0),
  UNIQUE (municipality_id, crop_type_id, demand_week)
);

CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id),
  source_barangay_id INTEGER NOT NULL REFERENCES barangays(id),
  target_municipality_id INTEGER NOT NULL REFERENCES municipalities(id),
  surplus_kg NUMERIC(14,2) NOT NULL CHECK (surplus_kg > 0),
  recommended_kg NUMERIC(14,2) NOT NULL CHECK (recommended_kg > 0),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','completed','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recommendations_route_idx
  ON recommendations(crop_type_id, source_barangay_id, target_municipality_id);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('municipal_officer','provincial_officer')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  risk_status TEXT NOT NULL DEFAULT 'watch' CHECK (risk_status IN ('watch','shortage','oversupply','balanced')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
