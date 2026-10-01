# Cliffs Lunch Club · Daycare

Version **0.2.0** — administrator-only meal operations for multiple daycare locations.

Rebuilt on the same core stack and local workflow as `sample-elementary-school`: **React 19 + TypeScript + Vite + PocketBase**. This replaces the earlier standalone Node/SQLite implementation. The elementary-school repository is independent.

## Download and run on a Mac

1. On GitHub, choose **Code → Download ZIP** and extract the folder.
2. Open Terminal in the extracted `sample-daycare` folder.
3. Run:

```bash
npm start
```

Open **http://127.0.0.1:5173**. Requires **Node.js 22.12 or newer**, plus the Mac's `curl` and `unzip` commands. The first start downloads PocketBase 0.28.4 from its official release, verifies its SHA-256 checksum, installs frontend dependencies from the lockfile, creates fictional demo records, and starts both servers. No separate `npm install` is needed. Subsequent starts retain your local changes. Ctrl+C stops both servers. `Start-Mac.command` is an optional double-click launcher.

If the school app is already running, stop it first, or use different ports:

```bash
CLC_PB_PORT=8091 CLC_WEB_PORT=5174 npm start
```

Then open http://127.0.0.1:5174.

### Demo sign-in

Terminal displays a randomly generated initial password. Use it with:

| Email | Access |
|---|---|
| `clc@example.test` | CLC super administrator |
| `staff@example.test` | CLC operations staff |
| `garden@example.test` | Garden Demo administrator |
| `river@example.test` | Riverside Demo administrator |

The initial password is kept locally in ignored `.runtime/demo-login.json`. If you change an account password in **My account**, use the new password; the initial credential file is not updated. Demo students, locations, prices, and dietary instructions are fictional. No real school source spreadsheets or student records are included.

## Workflows

### Location administrators

- **Dashboard:** their location's daily and weekly counts, current menu, monthly projection, and pending notes.
- **Students:** create or edit their school-managed students, classroom, weekly meal schedule, and portion where enabled. An effective date preserves earlier schedules.
- **Meal schedule:** view the recurring week and add dated enrollment changes or à la carte meals. There is no weekday editing lock. Ordinary absences do not reduce preparation or billing.
- **Billing:** view the location's subtotal and adjustment entries; submit a note for CLC to review. Notes do not alter the subtotal.
- **Meals managed by CLC:** read-only receiving information. These meals arrive individually packaged and labeled and are excluded from the school invoice. Detailed dietary/packing instructions are visible only to CLC.

### CLC staff

Access all locations, plus:

- Signed **+/− meal-unit adjustments**, each with its own note, month, author, timestamp, and audit history. Adjustments affect billing only.
- Review and respond to location billing notes, optionally linking an adjustment.
- Save a **monthly subtotal snapshot** at the beginning of the month. Later roster, schedule, and price changes do not change that saved amount. Reopening requires a reason and preserves the prior amount in the audit log. Saving does not send an invoice or collect payment.
- CLC-managed/subsidized meal arrangements, private dietary instructions, and service closures.
- Combined **weekly kitchen sheet**, with location, weekday, Small/Large, named substitutions, separate CLC packaging, and pizza totals. Print from the app.
- **Separate meal labels** for CLC-managed students. Letter 30-up labels: 1 × 2⅝ inches. Print at 100%, headers/footers off, and check on plain paper first.
- **Audit log** of server-recorded changes.

### CLC super administrator

All staff workflows, plus **Settings**:

- Create locations; configure classrooms, recurring weekday menus, and pizza day.
- Set one **meal price per location**, regardless of Small/Large portion.
- Toggle **Small/Large** and **Allow substitutions** separately for each location.
- Edit the shared **A/B/C/V definitions**. Location administrators only assign allowed options.
- Create administrator accounts and assign location access. Credentials are shared manually; this app does not email invitations.

## Calculation rules

- Scheduled school-billed meals + manual signed adjustments = billable meal units.
- Subtotal = billable units × location price. **No tax calculation.**
- Subsidized and separately CLC-billed meals remain in production counts but are excluded from scheduled school-billable units.
- Sizes affect preparation, not pricing.
- Pizza quantity = standard bulk meals ÷ 3, **rounded up per location**, excluding substitutions. Individually packed CLC meals appear in their own production section. Combined pizza total sums location quantities.
- Closures remove meals from production and unsaved projections. Saved monthly amounts stay unchanged.
- Dated enrollment changes affect production and unsaved projections; billing-only adjustments do not change food quantities.

## Project structure

```text
frontend/          React + TypeScript application and Vite configuration
pb_hooks/          PocketBase authenticated routes and business rules
pb_migrations/     Database schema and first-run initialization
scripts/start.mjs  One-command Mac/Linux launcher
scripts/           Local tooling
test/              PocketBase integration tests
```

PocketBase owns authentication, token validation, database storage, and transactional writes. All normal record collection APIs are locked. Authenticated custom routes scope every response and validate all writes on the server; frontend navigation is not the security boundary. Workspace data is currently stored in a private JSON record, with every mutation performed inside a PocketBase transaction. This is a small-operations starter rather than a normalized large-scale data model.

Local data is stored in ignored **`pb_data/`**. Runtime downloads, initial demo credentials, dependencies, and built files are ignored. GitHub stores source code, not operational data. The old application's `data/` directory is not imported or read.

## Checks

After `npm start` has downloaded dependencies and PocketBase:

```bash
npm test
npm run build
```

The integration test starts an isolated PocketBase database and tests real authenticated HTTP requests: cross-location isolation, direct collection access denial, role restrictions, CLC-managed protections, adjustment audit/rollback, notes, snapshots, closures, administrator creation, and password changes. The build runs TypeScript checking and creates `frontend/dist`.

## Empty non-demo workspace

Use a separate database directory and explicitly disable demo seeding before first initialization:

```bash
CLC_DEMO=0 CLC_DATA_DIR=pb_data_production \
CLC_ADMIN_EMAIL='your-email@example.com' \
CLC_ADMIN_PASSWORD='a-long-unique-password' npm start
```

`pb_data_production/` is ignored automatically. Prefer an absolute data path outside the source checkout for real data. Bootstrap variables are only used to initialize a new database; changing them does not reset existing account passwords. Demo mode also cannot convert an existing production database into a demo or vice versa.

## Deployment status

This release runs locally and is **not deployed**. `npm start` binds both servers to loopback. For hosting, build the frontend and serve `frontend/dist` through PocketBase's `pb_public` directory (or a web server), retaining same-origin `/api` routing. Use a dedicated non-demo database, HTTPS, a managed PocketBase process, and backups. Set `VITE_POCKETBASE_URL` at frontend build time only if the API is on a different origin. Pin/validate PocketBase upgrades before changing the 0.28.4 compatibility baseline.

This release does not integrate QuickBooks, send invoices, collect payments, import the source spreadsheets, or expose parent accounts. Substitution definitions and menus are current configuration; saved invoices retain financial snapshots. Browser print output still requires physical label-stock alignment verification.
