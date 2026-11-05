INSERT INTO municipalities (name, population) VALUES
  ('Boac', 57915), ('Mogpog', 34871), ('Gasan', 38323), ('Buenavista', 26139),
  ('Torrijos', 30854), ('Santa Cruz', 55493)
ON CONFLICT (name) DO NOTHING;

INSERT INTO crop_types (name, average_yield_kg_ha, per_capita_kg_year) VALUES
  ('Rice', 4500, 115), ('Corn', 4200, 18), ('Mongo', 950, 1.2), ('Tomato', 18000, 9)
ON CONFLICT (name) DO NOTHING;

INSERT INTO crop_maturity_periods (crop_type_id, maturity_days)
SELECT id, CASE name WHEN 'Rice' THEN 120 WHEN 'Corn' THEN 110 WHEN 'Mongo' THEN 90 ELSE 75 END
FROM crop_types
ON CONFLICT (crop_type_id) DO NOTHING;

INSERT INTO barangays (municipality_id, name, latitude, longitude, population)
SELECT m.id, b.name,
  (13.43 + ((b.ordinality - 1) % 9) * 0.008)::numeric(9,6),
  (121.82 + ((b.ordinality - 1) / 9) * 0.010)::numeric(9,6),
  950 + ((b.ordinality * 317) % 1700)
FROM municipalities m
CROSS JOIN unnest(ARRAY[
  'Agot','Agumaymayan','Amoingon','Apitong','Balagasan','Balaring','Balimbing','Balogo','Bamban','Bangbangalon',
  'Bantad','Bantay','Bayuti','Binunga','Boi','Boton','Buliasnin','Bunganay','Caganhao','Canat',
  'Catubugan','Cawit','Daig','Daypay','Duyay','Hinapulan','Ihatub','Isok 1 (Poblacion)','Isok 2 (Poblacion)','Laylay',
  'Lupac','Mahinhin','Mainit','Malbog','Maligaya','Malusak (Poblacion)','Mansiwat','Mataas na Bayan (Poblacion)','Maybo','Mercado (Poblacion)',
  'Murallon (Poblacion)','Ogbac','Pawa','Pili','Poctoy','Poras','Putting Buhangin','Puyog','Sabong','San Miguel (Poblacion)',
  'Santol','Sawi','Tabi','Tabigue','Tagwak','Tambunan','Tampus (Poblacion)','Tanza','Tugos','Tumagabok','Tumapon'
]) WITH ORDINALITY AS b(name, ordinality)
WHERE m.name = 'Boac'
ON CONFLICT (municipality_id, name) DO NOTHING;

INSERT INTO farmers (name) SELECT 'Sample Farmer ' || n FROM generate_series(1, 8) AS n
WHERE NOT EXISTS (SELECT 1 FROM farmers);

INSERT INTO field_reports (barangay_id, farmer_id, crop_type_id, area_ha, planting_date, planting_method, latitude, longitude, status, submitted_by)
SELECT b.id, f.id, c.id, vals.area,
  CURRENT_DATE + (m.maturity_days * -1) + vals.days_to_harvest,
  CASE WHEN vals.n % 2 = 0 THEN 'Transplanting' ELSE 'Direct Seeding' END,
  b.latitude, b.longitude,
  CASE WHEN vals.n <= 5 THEN 'approved' ELSE 'submitted' END,
  (SELECT id FROM users WHERE email = CASE WHEN vals.n % 2 = 0 THEN 'municipal_officer@boac.gov.ph' ELSE 'field_officer@boac.gov.ph' END LIMIT 1)
FROM (VALUES
  (1, 1.8, 18, 'Rice', 'Agumaymayan'), (2, 1.2, 32, 'Rice', 'Amoingon'),
  (3, 0.9, 15, 'Corn', 'Balaring'), (4, 1.4, 20, 'Rice', 'Caganhao'),
  (5, 0.8, 55, 'Tomato', 'Laylay'), (6, 2.0, 27, 'Rice', 'Pawa'),
  (7, 0.7, 40, 'Mongo', 'Tampus (Poblacion)'), (8, 1.1, 62, 'Corn', 'Murallon (Poblacion)')
) AS vals(n, area, days_to_harvest, crop_name, barangay_name)
JOIN crop_types c ON c.name = vals.crop_name
JOIN crop_maturity_periods m ON m.crop_type_id = c.id
JOIN barangays b ON b.name = vals.barangay_name
JOIN farmers f ON f.name = 'Sample Farmer ' || vals.n
WHERE NOT EXISTS (SELECT 1 FROM field_reports);

INSERT INTO demand_records (municipality_id, crop_type_id, demand_week, demand_kg)
SELECT m.id, c.id, date_trunc('week', CURRENT_DATE)::date,
  (m.population * c.per_capita_kg_year / 52.0)::numeric(14,2)
FROM municipalities m CROSS JOIN crop_types c
ON CONFLICT (municipality_id, crop_type_id, demand_week) DO NOTHING;
