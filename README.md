# AgriCast — Crop Supply Forecasting and Allocation System

An MVP for the Municipal Agriculture Office of Boac, Marinduque. The workspace contains a React dashboard, an Express/PostgreSQL API, and a Flutter field-app foundation designed for offline data capture.

## Project layout

- `frontend/` — React, Vite, Tailwind CSS, Leaflet dashboard.
- `backend/` — Express REST API, JWT authentication, PostgreSQL schema and seed data.
- `mobile/` — Flutter field application with SQLite draft storage and background connectivity sync.
- `docs/system-design.md` — Architecture, ERD, use cases, data flow, and wireframes.

## Run locally

Requirements: Node.js 20+, npm, Docker Desktop (or PostgreSQL 15+), and Flutter 3.19+ for the mobile app.

1. Copy `.env.example` to `.env`. Change the JWT secret before using non-demo data.
2. Start PostgreSQL: `docker compose up -d db`
3. Start the API: `cd backend; npm install; npm run dev`
4. Start the web app in another terminal: `cd frontend; npm install; npm run dev`
5. Open the Vite URL shown in the terminal. The seeded web demo account is `admin@boac.gov.ph` / `BoacDemo123!`.
6. To run the Flutter app in Chrome: `cd mobile; flutter pub get; flutter run -d chrome --web-port 5174`. The web build connects to the API on `localhost:4000`; Android emulators use `10.0.2.2:4000`.

The API initializes the schema and sample data on startup. It listens on port 4000 by default. The dashboard uses the API when available and includes a small local demo dataset so the UI can be explored before PostgreSQL is configured.

## MVP boundaries

- Seeded barangay coordinates and production values are illustrative; confirm them with the Municipal Agriculture Office before operational use.
- The dashboard map uses OpenStreetMap tiles and barangay markers, not an authoritative cadastral boundary layer.
- Forecast demand uses weekly population consumption (population × per-capita kg/year ÷ 52). Crop-specific consumption defaults are demo values and should be validated by municipal/provincial officers.
- PDF and Excel exports are available from the Reports page. Approval, remarks, report entry, and recommendations are exposed through the API and dashboard.
- The Flutter project implements local draft persistence, GPS capture, and retryable sync. Configure `API_BASE_URL` for the target deployment before field testing.

## Security and deployment

Configure strong secrets, HTTPS, managed PostgreSQL backups, restricted CORS origins, and a production identity/password policy before deployment. Demo accounts are created on first API startup; change or disable them before exposing the service. See `docs/system-design.md` for the module boundaries and data model.
"# AgriCast-Crop-Supply-Forecasting-and-Allocation-System-for-Boac-Marinduque" 
"# AgriCast-Crop-Supply-Forecasting-and-Allocation-System-for-Boac-Marinduque" 
