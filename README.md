# Cliffs Lunch Club — daycare administration

Version 0.1.0. Administrator-only meal operations for multiple daycare locations, with CHS-inspired cream/green styling and sidebar navigation. This is a working Node.js application with server-side authorization and persistent SQLite storage. It does not change or deploy the CHS application.

## Run the sample on your Mac

1. Install Node.js 24 or later.
2. Download this repository using **Code → Download ZIP**, then extract it.
3. Open Terminal in the extracted folder and run `npm run demo`, or double-click `Start-Mac.command` (you may need to allow execution in macOS).
4. Open http://127.0.0.1:3000.
5. On the first run, Terminal prints a randomly generated sample password. Keep it for subsequent logins. All sample accounts use this initial password:

| Account | Access |
| --- | --- |
| clc@example.test | CLC super administrator |
| garden@example.test | Garden Demo location only |
| river@example.test | Riverside Demo location only |

All sample students, prices, dietary notes and counts are fictional. The sample database persists in `data/demo/`. Stop with Control+C. To start over, stop the server and rename `data/demo/` to a backup folder, then run the demo again. Do not use sample accounts for real records.

There are no npm dependencies to install and no separate frontend build step. The implementation uses Node's HTTP, cryptography and SQLite libraries, plus browser-native JavaScript modules. The CHS visual reference is preserved without copying its parent-ordering workflows or backend data.

## Included workflows

- CLC super administrators: all locations, pricing, Small/Large and substitution toggles, A/B/C/V definitions, menus, classrooms and administrator accounts.
- CLC staff: all-location operations, student management, kitchen output, labels, billing adjustments, billing-note review and audit logs. Staff cannot change super-admin settings or create administrators.
- Location administrators: their own roster, recurring schedules, dated meal exceptions, counts, projected/saved subtotal and billing requests. They cannot access another location's records, the combined kitchen sheet, or CLC-only dietary instructions.
- Effective-dated student schedules preserve earlier enrollment when a future schedule is added. Editing a schedule with the same effective date replaces that version and records the change in the audit log.
- Recurring substitutions, editable any day; no weekday lock. Disabled locations offer standard meals only.
- Small/Large affects production, not pricing. Each location has one meal rate.
- Standard bulk pizza meals are divided by three and rounded up **per location**, then combined. Substitutions and separately packed CLC-managed meals are excluded from bulk pizza quantities.
- School-billed, subsidized and separately CLC-managed billing arrangements. Subsidized and CLC-managed meals remain in production but are excluded from school billable units. Do not also apply a manual credit for an already excluded subsidy.
- Manual positive/negative whole-meal adjustments, each with its own note and audit trail. CLC alone may apply, edit or remove them.
- Location-admin billing requests with CLC replies, review status and optional links to adjustments.
- Monthly projections from actual weekday dates and schedules, adjusted units and location rate. **Subtotal only; no tax calculation.**
- Save a beginning-of-month subtotal before preparing an invoice. Schedule and price changes do not rewrite saved subtotals. Reopening requires a reason and preserves the old snapshot in the audit log. Saving does not send an invoice or process payment.
- CLC-managed students are visible to their location as read-only, separately packaged/billed meals. Detailed dietary and packing instructions are CLC-only.
- Printable CLC weekly kitchen sheet and separate student labels. Kitchen output has full dietary/packing instructions; labels identify the student and direct staff to that sheet.

## Everyday use

1. Under **Settings**, configure each location's rate, classrooms, menu and options.
2. Add students with a schedule effective date, classroom and weekday selections. CLC can set billing arrangement and private packing instructions.
3. Use **Meal schedule** for a date-specific à la carte meal. Ordinary absences leave preparation and billing unchanged.
4. Use **Billing** to choose a month, review location notes, add unit adjustments, and save the monthly subtotal. For a saved month, reopen with a reason before revising adjustments, or apply a correction to the appropriate later month.
5. Print **Kitchen sheet** for all-location production. Choose the date and location in **Separate labels** for CLC-managed meals.

Location admins submit billing notes when an enrollment change needs a credit or charge. Such notes do not automatically change billing. Recurring schedule changes can change unsaved projections; saved monthly subtotals remain fixed.

## Start an empty installation

Set `CLC_ADMIN_EMAIL` and a strong `CLC_ADMIN_PASSWORD` (at least 12 characters) in the server environment, then run `npm start`. The first launch creates only the CLC super-admin account; use Settings to add locations and other administrators. Bootstrap credentials are only used when there are no accounts. Passwords are salted/scrypt-hashed; sessions use HttpOnly/SameSite cookies and expire after 12 hours.

| Environment variable | Purpose |
| --- | --- |
| CLC_ADMIN_EMAIL | Initial super-admin email |
| CLC_ADMIN_PASSWORD | Initial super-admin password; never commit it |
| DATA_DIR | Persistent database directory; defaults to `data/production/` or `data/demo/` |
| HOST | Listening address, default `127.0.0.1` |
| PORT | Listening port, default `3000` |
| PUBLIC_ORIGIN | Exact HTTPS origin when behind a reverse proxy |
| COOKIE_SECURE | Set to `1` for HTTPS deployments |

This release requires a long-running Node 24 process and persistent local disk. It is not a static SiteGround upload and has not been deployed to a live domain. For hosting, use an HTTPS reverse proxy, set `PUBLIC_ORIGIN` and `COOKIE_SECURE=1`, keep the database off public/static paths, and configure backups. Stop the server before copying the whole data directory for a consistent backup. Never place live data or credentials in GitHub.

## Verification and current limits

Run `npm test`. Tests cover pizza rounding, effective dates, subsidies, separate production/billing, cross-location access denial, CLC-only permissions, billing-note review, invoice snapshot behavior, persistence and cross-origin mutation denial.

This first version has no email delivery, password-reset email, QuickBooks integration, automated invoice sending, or spreadsheet import. Real rosters have not been loaded. Menus are recurring weekday settings, not a dated menu calendar. Browser visual verification was blocked by the execution environment's browser service; review desktop/mobile layout and print a plain-paper label test before operational use. Labels use Letter, 1 × 2⅝-inch stock, at 100%, with browser headers/footers off.

Source layout: `server.mjs` (auth, APIs, storage); `domain.mjs` (meal calculations); `public/` (interface); `test/` (regressions). The GitHub repository is the source of truth; local data stays in ignored directories.
