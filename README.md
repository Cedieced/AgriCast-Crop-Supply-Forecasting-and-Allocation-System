# AgriCast — Crop Supply Forecasting and Allocation System

An MVP for the Municipal Agriculture Office of Boac, Marinduque. The workspace contains a React dashboard, an Express/MySQL API, and a Flutter field-app foundation designed for offline data capture.

## Project layout

- `frontend/` — React, Vite, Tailwind CSS, Leaflet dashboard.
- `backend/` — Express REST API, JWT authentication, MySQL schema and seed data.
- `mobile/` — Flutter field application with SQLite draft storage and background connectivity sync.
- `docs/system-design.md` — Architecture, ERD, use cases, data flow, and wireframes.

## Run locally

Requirements: Node.js 20+, npm, MySQL 8+ (or Docker Desktop), MySQL Workbench, and Flutter 3.19+ for the mobile app.

1. Start MySQL Server 8+ and connect to it in MySQL Workbench. Workbench is the database client; it must connect to a running MySQL Server.
2. In Workbench, create the database with `CREATE DATABASE crop_supply CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, select it as the default schema, then open and execute [`backend/sql/schema.sql`](./backend/sql/schema.sql). Create a MySQL user with privileges on this database, or use an existing development account. For example, from an administrator connection, create a local `cropapp` user and grant it access with `CREATE USER 'cropapp'@'localhost' IDENTIFIED BY 'choose-a-password';` and `GRANT ALL PRIVILEGES ON crop_supply.* TO 'cropapp'@'localhost';`.
3. Create or update `.env` using `.env.example` as a reference. Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` to match that MySQL user (remove the old `DATABASE_URL` setting), and change `JWT_SECRET` before using non-demo data. The included defaults match the local Docker setup.
4. Alternatively, start a local MySQL server with Docker: `docker compose up -d db`. Connect to `localhost:3306` in Workbench using user `cropapp` and password `cropapp`.
5. Start the API: `cd backend; npm install; npm run dev`
6. Start the web app in another terminal: `cd frontend; npm install; npm run dev`
7. Open the Vite URL shown in the terminal. The seeded web demo account is `admin@boac.gov.ph` / `BoacDemo123!`.
8. To run the Flutter app in Chrome: `cd mobile; flutter pub get; flutter run -d chrome --web-port 5174`. The web build connects to the API on `localhost:4000`; Android emulators use `10.0.2.2:4000`.

The API initializes the schema, audit triggers, and sample data on startup. It listens on port 4000 by default. In Workbench, refresh the `crop_supply` schema after the API starts to see its tables and data. The dashboard uses the API when available and includes a small local demo dataset so the UI can be explored before MySQL is configured.

The MySQL database is a new database; existing PostgreSQL data is not copied automatically. Back up and migrate any existing records separately before switching production systems.

## MVP boundaries

- Seeded barangay coordinates and production values are illustrative; confirm them with the Municipal Agriculture Office before operational use.
- The dashboard map uses OpenStreetMap tiles and barangay markers, not an authoritative cadastral boundary layer.
- Forecast demand uses weekly population consumption (population × per-capita kg/year ÷ 52). Crop-specific consumption defaults are demo values and should be validated by municipal/provincial officers.
- PDF and Excel exports are available from the Reports page. Approval, remarks, report entry, and recommendations are exposed through the API and dashboard.
- The Flutter project implements local draft persistence, GPS capture, and retryable sync. Configure `API_BASE_URL` for the target deployment before field testing.

## Security and deployment

Configure strong secrets, HTTPS, managed MySQL backups, restricted CORS origins, and a production identity/password policy before deployment. Demo accounts are created on first API startup; change or disable them before exposing the service. See `docs/system-design.md` for the module boundaries and data model.
"# AgriCast-Crop-Supply-Forecasting-and-Allocation-System-for-Boac-Marinduque" 
"# AgriCast-Crop-Supply-Forecasting-and-Allocation-System-for-Boac-Marinduque" 
