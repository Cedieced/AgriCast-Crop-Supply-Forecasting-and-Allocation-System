# AgriCast Field

Flutter field reporting app with secure JWT storage, on-device SQLite drafts, GPS capture, and retryable submission sync.

## Run

```powershell
flutter pub get
flutter run -d chrome --web-port 5174
```

On Flutter web the default API URL is derived from the browser host at port 4000, so Chrome on `localhost:5174` connects to `localhost:4000`. Android emulator development uses `http://10.0.2.2:4000/api`. For a physical device or deployed server, pass its reachable API URL with `--dart-define=API_BASE_URL=...`; use HTTPS for release builds. Add your web app origin to the API's `WEB_ORIGIN` setting.

Sign in using the seeded `field_officer@boac.gov.ph` account and the configured demo password. An authenticated session is needed before starting offline field visits. Reports and drafts are stored in the app's local database; submitted reports retry automatically when connectivity returns.
