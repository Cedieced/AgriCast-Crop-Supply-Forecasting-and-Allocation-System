USE crop_supply;

INSERT IGNORE INTO municipalities (name, population) VALUES
  ('Boac', 57915), ('Mogpog', 34871), ('Gasan', 38323), ('Buenavista', 26139),
  ('Torrijos', 30854), ('Santa Cruz', 55493);

INSERT IGNORE INTO crop_types (name, average_yield_kg_ha, per_capita_kg_year) VALUES
  ('Rice', 4500, 115), ('Corn', 4200, 18), ('Mongo', 950, 1.2), ('Tomato', 18000, 9);

INSERT IGNORE INTO crop_maturity_periods (crop_type_id, maturity_days)
SELECT id, CASE name WHEN 'Rice' THEN 120 WHEN 'Corn' THEN 110 WHEN 'Mongo' THEN 90 ELSE 75 END
FROM crop_types;

INSERT IGNORE INTO barangays (municipality_id, name, latitude, longitude, population)
SELECT m.id, b.name,
  13.43 + MOD(b.ordinality - 1, 9) * 0.008,
  121.82 + FLOOR((b.ordinality - 1) / 9) * 0.010,
  950 + MOD(b.ordinality * 317, 1700)
FROM municipalities m
CROSS JOIN (
  SELECT 'Agot' AS name, 1 AS ordinality UNION ALL SELECT 'Agumaymayan', 2 UNION ALL
  SELECT 'Amoingon', 3 UNION ALL SELECT 'Apitong', 4 UNION ALL
  SELECT 'Balagasan', 5 UNION ALL SELECT 'Balaring', 6 UNION ALL
  SELECT 'Balimbing', 7 UNION ALL SELECT 'Balogo', 8 UNION ALL
  SELECT 'Bamban', 9 UNION ALL SELECT 'Bangbangalon', 10 UNION ALL
  SELECT 'Bantad', 11 UNION ALL SELECT 'Bantay', 12 UNION ALL
  SELECT 'Bayuti', 13 UNION ALL SELECT 'Binunga', 14 UNION ALL
  SELECT 'Boi', 15 UNION ALL SELECT 'Boton', 16 UNION ALL
  SELECT 'Buliasnin', 17 UNION ALL SELECT 'Bunganay', 18 UNION ALL
  SELECT 'Caganhao', 19 UNION ALL SELECT 'Canat', 20 UNION ALL
  SELECT 'Catubugan', 21 UNION ALL SELECT 'Cawit', 22 UNION ALL
  SELECT 'Daig', 23 UNION ALL SELECT 'Daypay', 24 UNION ALL
  SELECT 'Duyay', 25 UNION ALL SELECT 'Hinapulan', 26 UNION ALL
  SELECT 'Ihatub', 27 UNION ALL SELECT 'Isok 1 (Poblacion)', 28 UNION ALL
  SELECT 'Isok 2 (Poblacion)', 29 UNION ALL SELECT 'Laylay', 30 UNION ALL
  SELECT 'Lupac', 31 UNION ALL SELECT 'Mahinhin', 32 UNION ALL
  SELECT 'Mainit', 33 UNION ALL SELECT 'Malbog', 34 UNION ALL
  SELECT 'Maligaya', 35 UNION ALL SELECT 'Malusak (Poblacion)', 36 UNION ALL
  SELECT 'Mansiwat', 37 UNION ALL SELECT 'Mataas na Bayan (Poblacion)', 38 UNION ALL
  SELECT 'Maybo', 39 UNION ALL SELECT 'Mercado (Poblacion)', 40 UNION ALL
  SELECT 'Murallon (Poblacion)', 41 UNION ALL SELECT 'Ogbac', 42 UNION ALL
  SELECT 'Pawa', 43 UNION ALL SELECT 'Pili', 44 UNION ALL
  SELECT 'Poctoy', 45 UNION ALL SELECT 'Poras', 46 UNION ALL
  SELECT 'Putting Buhangin', 47 UNION ALL SELECT 'Puyog', 48 UNION ALL
  SELECT 'Sabong', 49 UNION ALL SELECT 'San Miguel (Poblacion)', 50 UNION ALL
  SELECT 'Santol', 51 UNION ALL SELECT 'Sawi', 52 UNION ALL
  SELECT 'Tabi', 53 UNION ALL SELECT 'Tabigue', 54 UNION ALL
  SELECT 'Tagwak', 55 UNION ALL SELECT 'Tambunan', 56 UNION ALL
  SELECT 'Tampus (Poblacion)', 57 UNION ALL SELECT 'Tanza', 58 UNION ALL
  SELECT 'Tugos', 59 UNION ALL SELECT 'Tumagabok', 60 UNION ALL
  SELECT 'Tumapon', 61
) b
WHERE m.name = 'Boac';

INSERT INTO farmers (name)
SELECT CONCAT('Sample Farmer ', n)
FROM (
  SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
) numbers
WHERE NOT EXISTS (SELECT 1 FROM farmers);

INSERT INTO field_reports
  (id, barangay_id, farmer_id, crop_type_id, area_ha, planting_date, planting_method,
   latitude, longitude, status, submitted_by)
SELECT UUID(), b.id, f.id, c.id, vals.area,
  DATE_SUB(DATE_ADD(CURDATE(), INTERVAL vals.days_to_harvest DAY), INTERVAL maturity.maturity_days DAY),
  CASE WHEN vals.n % 2 = 0 THEN 'Transplanting' ELSE 'Direct Seeding' END,
  b.latitude, b.longitude,
  CASE WHEN vals.n <= 5 THEN 'approved' ELSE 'submitted' END,
  (SELECT id FROM users
   WHERE email = CASE WHEN vals.n % 2 = 0 THEN 'municipal_officer@boac.gov.ph' ELSE 'field_officer@boac.gov.ph' END
   LIMIT 1)
FROM (
  SELECT 1 AS n, 1.8 AS area, 18 AS days_to_harvest, 'Rice' AS crop_name, 'Agumaymayan' AS barangay_name UNION ALL
  SELECT 2, 1.2, 32, 'Rice', 'Amoingon' UNION ALL
  SELECT 3, 0.9, 15, 'Corn', 'Balaring' UNION ALL
  SELECT 4, 1.4, 20, 'Rice', 'Caganhao' UNION ALL
  SELECT 5, 0.8, 55, 'Tomato', 'Laylay' UNION ALL
  SELECT 6, 2.0, 27, 'Rice', 'Pawa' UNION ALL
  SELECT 7, 0.7, 40, 'Mongo', 'Tampus (Poblacion)' UNION ALL
  SELECT 8, 1.1, 62, 'Corn', 'Murallon (Poblacion)'
) vals
JOIN crop_types c ON c.name = vals.crop_name
JOIN crop_maturity_periods maturity ON maturity.crop_type_id = c.id
JOIN barangays b ON b.name = vals.barangay_name
JOIN farmers f ON f.name = CONCAT('Sample Farmer ', vals.n)
WHERE NOT EXISTS (SELECT 1 FROM field_reports);

INSERT IGNORE INTO demand_records (municipality_id, crop_type_id, demand_week, demand_kg)
SELECT municipality.id, crop.id,
  DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
  municipality.population * crop.per_capita_kg_year / 52.0
FROM municipalities municipality CROSS JOIN crop_types crop;
