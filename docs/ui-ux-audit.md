# AgriCast UI/UX audit

## Scope

This review covers the React dashboard in `frontend/src/App.jsx` and
`frontend/src/index.css`, and the Flutter field application in
`mobile/lib/main.dart`. It is a source-level design and accessibility review;
it is not a formal WCAG conformance assessment or a production-device usability
study.

## Findings and changes

| Area | Finding | Change |
| --- | --- | --- |
| Visual system | The web UI relied on many one-off colors, radii, and spacing values; its palette was close to the field app but not shared. Flutter's Material 3 theme mostly set only a seed color and input borders. | Added web color, risk, spacing, radius, shadow, and navigation tokens; established a shared forest-green / neutral palette and a centralized Flutter Material 3 theme with matching surfaces, typography, controls, cards, and status colors. |
| Typography | Many web labels, chart captions, table cells, and secondary mobile text were 8–11 px, making dense data difficult to scan, especially on smaller screens and outdoors. | Increased hierarchy and contrast for headings, body copy, navigation, tables, cards, forms, and report status text. Kept only compact metadata and map attribution intentionally small. |
| Navigation and keyboard use | The web sidebar had small targets and visual-only active state; the mobile menu controls lacked clear accessible names, and keyboard users had no skip link. | Increased navigation and icon targets, added `aria-current`, menu labels/state, and a keyboard-visible skip link to the main content. |
| Data presentation | Tables used small text and had no sticky header; chart legends and labels were hard to read. Risk colors were not expressed through a consistent semantic palette. | Added readable table typography, sticky headers within bounded table regions, hover/focus feedback, tabular number alignment, larger chart labels, and consistent low/medium/high status colors (green/yellow/red). |
| Forms and actions | Web form labels and controls were compact; several mobile controls were difficult to distinguish and had inconsistent dimensions. | Increased field spacing, contrast, and control heights; standardized button/input themes; improved mobile date/GPS controls, crop selection, planting-method choices, and accessible error/loading announcements. |
| Mobile status and data states | The field app displayed a generic online/offline message, did not distinguish drafts from queued reports, and could briefly present an empty report list before local storage finished loading. | Added explicit offline/ready/syncing/synced/failed copy and color, a retry action after sync failures, distinct draft/synced/queued report indicators, and loading/error/empty states for local reports. Database sync errors now clear the syncing indicator and are shown in the UI. |
| Motion and responsiveness | The dashboard had desktop/tablet/mobile breakpoints, but some mobile typography and controls remained too small; transitions did not honor reduced-motion preferences. | Tuned responsive spacing and type sizes, preserved the collapsible mobile navigation, and added a `prefers-reduced-motion` treatment. |

## Remaining product and validation gaps

- The mobile application is a field-reporting client; it has no forecast,
  allocation, or mobile risk-summary screen to restyle. Adding those views would
  be a product-feature change, not a visual-only redesign.
- The web UI currently renders several controls without action handlers,
  including the report filter icon, forecast-season selector, allocation
  municipality selector, “Mark all as read,” and some “Details” actions. They
  were left unchanged to avoid inventing business behavior during a design
  pass; they should be specified and implemented separately.
- The field-report form remains a single scrollable flow because changing it
  into a wizard or adding sticky submission actions would alter its workflow.
- Android-native compilation could not be verified in this environment because
  no Android SDK is installed. Flutter tests, analysis, and a Flutter web build
  were used instead.

## Verification

- `frontend`: `npm run build`
- `mobile`: `flutter test`
- `mobile`: `flutter analyze`
- `mobile`: `flutter build web --debug --no-wasm-dry-run`
- `git diff --check`
