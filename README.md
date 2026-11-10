# AgriCast — Crop Supply Forecasting and Allocation System

An MVP for the Municipal Agriculture Office of Boac, Marinduque. The workspace contains a React dashboard, an Express/MySQL API, and a Flutter field-app foundation designed for offline data capture.

## Project layout

- `frontend/` — React, Vite, Tailwind CSS, Leaflet dashboard.
- `backend/` — Express REST API, JWT authentication, MySQL schema and seed data.
- `mobile/` — Flutter field application with SQLite draft storage and background connectivity sync.
- `docs/system-design.md` — Architecture, ERD, use cases, data flow, and wireframes.

This repository does not contain a PHP API or use XAMPP/Apache to serve the backend. The API is Express/Node.js at `http://localhost:4000/api`; use its `/api/health` endpoint to check both API and MySQL connectivity. The Flutter and React clients connect to this API, and MySQL is accessed only by the backend.

## Run locally

Requirements: Node.js 20+, npm, MySQL 8+ (or Docker Desktop), MySQL Workbench, and Flutter 3.19+ for the mobile app.

1. Start MySQL Server 8+ and connect to it in MySQL Workbench. Workbench is the database client; it must connect to a running MySQL Server.
2. In Workbench, create the database with `CREATE DATABASE crop_supply CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, select it as the default schema, then open and execute [`backend/sql/schema.sql`](./backend/sql/schema.sql). Create a MySQL user with privileges on this database, or use an existing development account. For example, from an administrator connection, create a local `cropapp` user and grant it access with `CREATE USER 'cropapp'@'localhost' IDENTIFIED BY 'choose-a-password';` and `GRANT ALL PRIVILEGES ON crop_supply.* TO 'cropapp'@'localhost';`.
3. Create or update `.env` using `.env.example` as a reference. Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` to match that MySQL user (remove the old `DATABASE_URL` setting), and change `JWT_SECRET` before using non-demo data. The included defaults match the local Docker setup.
4. Alternatively, start a local MySQL server with Docker: `docker compose up -d db`. Connect to `localhost:3306` in Workbench using user `cropapp` and password `cropapp`.
5. Start the API: `cd backend; npm install; npm run dev`
6. Start the web dashboard: `cd frontend; npm install; npm run dev`
7. Start the field app in Chrome: `cd mobile; flutter pub get; flutter run -d chrome --web-port 5174`.
8. Open `http://localhost:5173` for the dashboard and `http://localhost:5174` for the field app. On the same computer, both use the API at `http://localhost:4000/api`. The seeded web demo account is `admin@boac.gov.ph` / `BoacDemo123!`.

In VS Code, run the `Start AgriCast Services` task to start the API and both browser apps together. For dashboard access from another device on the same Wi-Fi, open it using the computer's LAN IP and allow inbound TCP port 5173 through Windows Firewall on a trusted private network. The dashboard uses Vite's same-origin `/api` proxy to reach the API on the host computer, so the remote browser must not use `localhost` as the API address. The Flutter field app connects directly to the API; configure its `API_BASE_URL` with the host's LAN IP, allow inbound TCP ports 4000 and 5174, and include the field-app browser origin in `.env`'s `WEB_ORIGIN`. Restart the API after changing `.env`. Do not expose MySQL port 3306 to the device or the public network.

The API initializes the schema, audit triggers, and sample data on startup. It listens on port 4000 by default. In Workbench, refresh the `crop_supply` schema after the API starts to see its tables and data.

The MySQL database is a new database; existing PostgreSQL data is not copied automatically. Back up and migrate any existing records separately before switching production systems.

## MVP boundaries

- Seeded production values are illustrative; confirm them with the Municipal Agriculture Office before operational use. Barangay map coordinates are intentionally unset.
- The dashboard map validates stored barangay coordinates against the 61 polygons in `frontend/public/data/boac-barangay-boundaries.geojson`. If coordinates are missing or outside a polygon, it uses an interior representative point; this is a barangay-level visualization point, not a farm GPS location. The boundary layer is derived from NAMRIA administrative boundaries (valid on 2023-11-06), cross-referenced to PSA PSGC 2023-10-24 in the [Barangay Boundaries Repository](https://github.com/bendlikeabamboo/barangay-boundaries-repository), release [v2026.4.13.0](https://github.com/bendlikeabamboo/barangay-boundaries-repository/releases/tag/v2026.4.13.0). The downloaded release archive was SHA-256 verified before extracting Boac (ADM3 code `PH1704001`); the GeoJSON retains PSGC identifiers and source properties. The release simplifies polygon boundaries at 0.005°; confirm against current LGU/NAMRIA GIS before legal, cadastral, or operational decisions. Data attribution: © NAMRIA; PSGC attributes © Philippine Statistics Authority.
- Forecast demand uses weekly population consumption (population × per-capita kg/year ÷ 52). Crop-specific consumption defaults are demo values and should be validated by municipal/provincial officers.
- PDF and Excel exports are available from the Reports page. Approval, remarks, report entry, and recommendations are exposed through the API and dashboard.
- The Flutter project implements local draft persistence, GPS capture, and retryable sync. Configure `API_BASE_URL` for the target deployment before field testing.

## Security and deployment

Configure strong secrets, HTTPS, managed MySQL backups, restricted CORS origins, and a production identity/password policy before deployment. Development demo accounts and sample data are not created in production. See the [Vercel deployment guide](./docs/vercel-deployment.md) for production setup and verification, and `docs/system-design.md` for module boundaries and the data model.
"# AgriCast-Crop-Supply-Forecasting-and-Allocation-System-for-Boac-Marinduque" 
"# AgriCast-Crop-Supply-Forecasting-and-Allocation-System-for-Boac-Marinduque" 
