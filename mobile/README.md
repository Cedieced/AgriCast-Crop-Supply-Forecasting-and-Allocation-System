# AgriCast Field

Flutter field reporting app with secure JWT storage, on-device SQLite drafts, GPS capture, and retryable submission sync.

## Run

```powershell
flutter pub get
flutter run -d chrome --web-port 5174
```

On Flutter web the default API URL is derived from the browser host at port 4000, so Chrome on `localhost:5174` connects to `localhost:4000`. Native debug builds default to this workspace's local API at `http://192.168.2.9:4000/api`, reachable by devices on the same Wi-Fi. Start the API with `cd backend; npm start`. If the computer's LAN IP changes, override the local default with `--dart-define=LOCAL_API_BASE_URL=http://<computer-LAN-IP>:4000/api`. The API must be running and inbound TCP port 4000 allowed through the computer firewall.

The field app is intended to run in Chrome for this workflow. Start the API and React dashboard, then run:

```powershell
cd mobile
flutter pub get
flutter run -d chrome --web-port 5174
```

Open the dashboard at `http://localhost:5173` and the field app at `http://localhost:5174`. Both browser apps call the same API at `http://localhost:4000/api`. If using the computer's LAN IP instead of `localhost`, open both apps with that same IP and allow their exact page origins in the API's `WEB_ORIGIN` setting. Restart the API after changing `.env`.

The API URL is configured at build time and is never editable in the app. For a production build, provide the deployed API base URL as a Dart define:

```powershell
flutter run -d <device> --dart-define=API_BASE_URL=https://<your-api-host>/api
```

Set the same `--dart-define` when building a release APK/AAB. Release builds without `API_BASE_URL` show a configuration error instead of trying a development address. Use HTTPS for deployed APIs. The app checks the API before showing sign-in and displays a retry message when it cannot connect. Stored sessions are validated with the API; when a token expires, the app returns to sign-in and keeps pending reports locally for sync after the next sign-in. A previously signed-in field officer can continue saving reports offline; queued submissions sync to the configured API when connectivity returns. MySQL should remain private; the phone connects to the API, not directly to the database.

For Flutter web opened from another device, add its page origin (for example `http://<computer-LAN-IP>:5174`) to the API's comma-separated `WEB_ORIGIN` setting.

Sign in using the seeded `field_officer@boac.gov.ph` account and the configured demo password. An authenticated session is needed before starting offline field visits. Reports and drafts are stored in the app's local database; submitted reports retry automatically when connectivity returns, and reports for the signed-in field officer are refreshed from the API when online.
