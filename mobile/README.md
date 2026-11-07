# AgriCast Field

Flutter field reporting app with secure JWT storage, on-device SQLite drafts, GPS capture, and retryable submission sync.

## Run

```powershell
flutter pub get
flutter run -d chrome --web-port 5174
```

On Flutter web the default API URL is derived from the browser host at port 4000, so Chrome on `localhost:5174` connects to `localhost:4000`. Android emulator development uses `http://10.0.2.2:4000/api`.

For a physical device, connect the computer and phone to the same network and pass the computer's LAN IP (not `localhost` or the phone's IP):

```powershell
flutter run -d <device> --dart-define=API_BASE_URL=http://<computer-LAN-IP>:4000/api
```

For example, use `http://192.168.1.25:4000/api` if that is the computer's current LAN address. Allow inbound TCP port 4000 in Windows Firewall for a trusted private network if the phone cannot reach the API. MySQL should remain on the development computer; the phone connects to the API, not directly to port 3306. Use HTTPS for release builds. For Flutter web opened from another device, add its page origin (for example `http://<computer-LAN-IP>:5174`) to the API's comma-separated `WEB_ORIGIN` setting.

Sign in using the seeded `field_officer@boac.gov.ph` account and the configured demo password. An authenticated session is needed before starting offline field visits. Reports and drafts are stored in the app's local database; submitted reports retry automatically when connectivity returns, and reports for the signed-in field officer are refreshed from the API when online.
