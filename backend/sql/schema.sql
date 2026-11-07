USE crop_supply;

CREATE TABLE IF NOT EXISTS municipalities (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  population INT NOT NULL DEFAULT 0 CHECK (population >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  role VARCHAR(32) NOT NULL CHECK (role IN ('admin','municipal_officer','provincial_officer','field_officer')),
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS barangays (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  municipality_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  population INT NOT NULL DEFAULT 0 CHECK (population >= 0),
  UNIQUE KEY barangays_municipality_name_uq (municipality_id, name),
  CONSTRAINT barangays_municipality_fk FOREIGN KEY (municipality_id) REFERENCES municipalities(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS farmers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_number VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crop_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  average_yield_kg_ha DECIMAL(12,2) NOT NULL CHECK (average_yield_kg_ha > 0),
  per_capita_kg_year DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (per_capita_kg_year >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS crop_maturity_periods (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  crop_type_id INT UNSIGNED NOT NULL UNIQUE,
  maturity_days INT NOT NULL CHECK (maturity_days > 0),
  CONSTRAINT maturity_crop_fk FOREIGN KEY (crop_type_id) REFERENCES crop_types(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS field_reports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  barangay_id INT UNSIGNED NOT NULL,
  farmer_id INT UNSIGNED NOT NULL,
  crop_type_id INT UNSIGNED NOT NULL,
  area_ha DECIMAL(10,3) NOT NULL CHECK (area_ha > 0),
  planting_date DATE NOT NULL,
  planting_method VARCHAR(32) NOT NULL CHECK (planting_method IN ('Direct Seeding','Transplanting')),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  notes TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  remarks TEXT,
  submitted_by CHAR(36),
  reviewed_by CHAR(36),
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY field_reports_status_idx (status),
  KEY field_reports_harvest_idx (planting_date, crop_type_id),
  CONSTRAINT reports_barangay_fk FOREIGN KEY (barangay_id) REFERENCES barangays(id),
  CONSTRAINT reports_farmer_fk FOREIGN KEY (farmer_id) REFERENCES farmers(id),
  CONSTRAINT reports_crop_fk FOREIGN KEY (crop_type_id) REFERENCES crop_types(id),
  CONSTRAINT reports_submitter_fk FOREIGN KEY (submitted_by) REFERENCES users(id),
  CONSTRAINT reports_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forecasts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  barangay_id INT UNSIGNED NOT NULL,
  crop_type_id INT UNSIGNED NOT NULL,
  forecast_week DATE NOT NULL,
  total_area_ha DECIMAL(12,3) NOT NULL DEFAULT 0,
  expected_harvest_kg DECIMAL(14,2) NOT NULL DEFAULT 0,
  demand_kg DECIMAL(14,2) NOT NULL DEFAULT 0,
  supply_status VARCHAR(16) NOT NULL CHECK (supply_status IN ('oversupply','shortage','balanced')),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY forecasts_location_crop_week_uq (barangay_id, crop_type_id, forecast_week),
  CONSTRAINT forecasts_barangay_fk FOREIGN KEY (barangay_id) REFERENCES barangays(id),
  CONSTRAINT forecasts_crop_fk FOREIGN KEY (crop_type_id) REFERENCES crop_types(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS harvest_schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  field_report_id CHAR(36) NOT NULL UNIQUE,
  expected_harvest_date DATE NOT NULL,
  expected_harvest_kg DECIMAL(14,2) NOT NULL,
  notification_sent_at TIMESTAMP NULL,
  CONSTRAINT schedules_report_fk FOREIGN KEY (field_report_id) REFERENCES field_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS demand_records (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  municipality_id INT UNSIGNED NOT NULL,
  crop_type_id INT UNSIGNED NOT NULL,
  demand_week DATE NOT NULL,
  demand_kg DECIMAL(14,2) NOT NULL CHECK (demand_kg >= 0),
  UNIQUE KEY demand_municipality_crop_week_uq (municipality_id, crop_type_id, demand_week),
  CONSTRAINT demand_municipality_fk FOREIGN KEY (municipality_id) REFERENCES municipalities(id),
  CONSTRAINT demand_crop_fk FOREIGN KEY (crop_type_id) REFERENCES crop_types(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recommendations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  crop_type_id INT UNSIGNED NOT NULL,
  source_barangay_id INT UNSIGNED NOT NULL,
  target_municipality_id INT UNSIGNED NOT NULL,
  surplus_kg DECIMAL(14,2) NOT NULL CHECK (surplus_kg > 0),
  recommended_kg DECIMAL(14,2) NOT NULL CHECK (recommended_kg > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','completed','declined')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY recommendations_route_idx (crop_type_id, source_barangay_id, target_municipality_id),
  CONSTRAINT recommendations_crop_fk FOREIGN KEY (crop_type_id) REFERENCES crop_types(id),
  CONSTRAINT recommendations_source_fk FOREIGN KEY (source_barangay_id) REFERENCES barangays(id),
  CONSTRAINT recommendations_target_fk FOREIGN KEY (target_municipality_id) REFERENCES municipalities(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dedupe_key VARCHAR(255) NOT NULL UNIQUE,
  recipient_role VARCHAR(32) NOT NULL CHECK (recipient_role IN ('municipal_officer','provincial_officer')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  risk_status VARCHAR(16) NOT NULL DEFAULT 'watch' CHECK (risk_status IN ('watch','shortage','oversupply','balanced')),
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(64) NOT NULL,
  record_id VARCHAR(64),
  operation VARCHAR(8) NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  actor_id CHAR(36),
  old_data JSON,
  new_data JSON,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY audit_logs_occurred_at_idx (occurred_at DESC),
  CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
