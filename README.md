# Sample Daycare

Cliffs Lunch Club's daycare lunch MVP. This is a fresh, deliberately small rebuild based on the supplied weekly count, classroom roster, billing, and monthly menu examples.

## Stack

- React, TypeScript, and Vite for the web app
- PocketBase for login, records, and location-scoped access
- One separate PocketBase instance for this daycare app

Node.js 22.12 or newer is required. The local launcher pins PocketBase to 0.28.4, starts both services, and keeps the database in the ignored `pb_data` folder.

## Run on a Mac

1. Install Node.js 24 LTS from [nodejs.org](https://nodejs.org).
2. Download or clone this repository and open Terminal in the `sample-daycare` folder.
3. Run `npm start`.
4. Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The first start downloads PocketBase and installs the small frontend dependency set, so it needs internet access. Stop both services with Control+C. The next start keeps local changes and demo data.

### Local demo login

- Email: `admin@example.test`
- Password: `LocalLunch2026!`

The local demo contains one fictional daycare and three fictional students. These credentials are for local sample data only. Do not use them for real records or production.

## MVP features

- CLC admins manage daycare locations and create location-scoped daycare admin accounts. Daycare staff can only access their own location.
- Add, edit, and remove classrooms and students. Student schedules repeat by weekday, with optional Small/Large counts per daycare.
- Record and remove substitutions by service date using A, B, C, and V codes. CLC controls whether each daycare permits substitutions and can edit the option labels.
- Generate a weekly US Letter landscape kitchen sheet with weekday counts, regular meals, substitutions, Small/Large counts, and pizza counts by daycare. Counts come from the recurring student schedules and refresh when records or closures change.
- CLC staff create monthly menus, mark days off, and publish selected dates to the read-only public menu. The public page has print-to-PDF and Word-compatible download buttons.
- Project an invoice subtotal from scheduled weekday meals, service days, the location's per-meal price, and CLC meal-unit adjustments. Daycare admins can add billing notes; only CLC can enter meal-unit adjustments. No tax is added.

Parents do not have app accounts and cannot order meals. The public menu only returns dates marked as published.

## Development checks

```sh
cd frontend
npm run build
cd ..
npm test
```

The first check type-checks and builds the web app. The tests check weekday calculation and the monthly meal projection, including closed days.

## Project files

- `frontend/src` — React app and count logic
- `pb_migrations` — PocketBase collections, access rules, and local demo seed
- `pb_hooks` — secure CLC admin creation and substitution endpoint
- `scripts/start.mjs` — local PocketBase and Vite launcher
- `test` — focused recurring-count checks

Never commit `pb_data`, frontend environment files, or real school/daycare records.
