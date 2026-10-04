# Sample Daycare

Cliffs Lunch Club's daycare lunch MVP. This is a fresh, deliberately small rebuild based on the supplied weekly counts, classroom roster, billing, and monthly menu examples.

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

These credentials are for local sample data only. Do not use them for production. The seeded records below come from the supplied school spreadsheets.

## MVP features

- Each school's subdomain shows the shared landing page with parent and school-admin choices. The parent choice opens that school's menu directly; at the root domain and on localhost, it opens school selection. School staff go to sign-in and then their dashboard.
- CLC super admins manage locations, control whether each school can use operations, and create a school admin account for the selected location. School staff can only access their own enabled location.
- Parents view published menus without logging in. School admins manage rosters only when CLC has enabled operations for their school.
- Add, edit, and remove classrooms and students. Student schedules repeat by weekday, with optional Small/Large counts per daycare.
- Record and remove substitutions by service date using A, B, C, and V codes. CLC controls whether each daycare permits substitutions and can edit the option labels.
- Generate a weekly US Letter landscape kitchen sheet with weekday counts, regular meals, substitutions, Small/Large counts, and pizza counts by daycare. Counts come from the recurring student schedules and refresh when records or closures change.
- CLC staff create monthly menus, mark days off, and publish selected dates to the read-only public menu. The public page has print-to-PDF and Word-compatible download buttons.
- Project an invoice subtotal from scheduled weekday meals, service days, the location's per-meal price, and CLC meal-unit adjustments. Daycare admins can add billing notes; only CLC can enter meal-unit adjustments. No tax is added.

Parents do not have app accounts and cannot order meals. The public menu only returns dates marked as published. This is the parent user type; the two authenticated account roles are `clc_admin` (CLC super admin) and `daycare_admin` (school admin).

## Local sample data

The local PocketBase seed includes:

- **Lightbridge Bergenfield** — eight classrooms and 39 student records from the supplied masterlist, with recurring weekdays, Small/Large sizes, substitutions enabled, and the substitution labels from the spreadsheet.
- **Lightbridge Fort Lee** — operations disabled, substitutions and sizes disabled, and published October 2026 Lightbridge menu dates. It uses aggregate weekly counts from the supplied count sheet: 64 meals Monday–Thursday (62 plus Ethan and Jayden) and 62 Friday. No individual Fort Lee roster was supplied.
- **TLE Englewood Cliffs** — operations disabled, with an aggregate count of 120 meals Monday–Thursday and zero Friday. No individual roster or menu was supplied.

The October Lightbridge menu is preloaded for Bergenfield and Fort Lee, including the October 2 pizza counts. CLC can edit the two calendars independently. TLE's menu can be added when its menu is provided. When a new local database starts, PocketBase applies the migrations and loads this data. Existing local databases receive the seed migration on the next start; the local demo admin is normalized to the CLC super admin role. Turning off daycare operations also deactivates that location's daycare admin accounts, and PocketBase rules enforce the operations toggle for roster, substitution, and billing records.

The interface uses the Sample School cream and garden-green palette, with Nunito typography and warm tomato accents.

For production, point the school's subdomains at this same frontend build: `bergenfield.cliffslunchclub.com`, `fortlee.cliffslunchclub.com`, and `tle.cliffslunchclub.com`. The frontend maps those hostnames to their school menu slugs. For local testing, add `?school=lightbridge-bergenfield`, `?school=lightbridge-fort-lee`, or `?school=tle-englewood-cliffs` to the local URL.

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

Never commit `pb_data` or frontend environment files. The seed migration includes the first-name roster supplied for this private development repository; keep the repository private and replace the seed records before any public release.
