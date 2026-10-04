# Sample Daycare

Cliffs Lunch Club's school lunch MVP. This is a deliberately small build based on the supplied weekly counts, classroom roster, and monthly menu examples.

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

## MVP features

- Each school's subdomain shows the shared landing page with parent and school-admin choices. The parent choice opens that school's menu directly; at the root domain and on localhost, it opens school selection. School staff go to sign-in and then their dashboard.
- CLC super admins manage locations, control whether each school can use operations, and create a school admin account for the selected location. School staff can only access their own enabled location.
- Parents view published menus without logging in. School Admins manage rosters only when CLC has enabled operations for their school.
- The super-admin workspace opens on **Weekly summary**.
- Add, edit, and remove classrooms and students. Classroom order follows age groups; roster headers sort each column, with classroom age order as the default. Displayed surnames use last initials. Student schedules repeat by weekday, with optional Small/Large counts per daycare.
- Record and remove substitutions by service date using A, B, C, and V codes. CLC controls whether each daycare permits substitutions and can edit the option labels.
- CLC super admins open the **Weekly summary** tab for a reusable weekday kitchen sheet, with total lunches, school counts, size breakdowns, substitutions, and pizza counts. Dates stay on the separate monthly calendar; substitutions repeat by weekday.
- In **Students & Classrooms**, CLC can choose roster counts or manual weekday totals for each school. Fort Lee and TLE start with manual counts; Bergenfield starts with roster counts. Manual totals repeat each week. Friday pizza counts are calculated from total lunches divided by three, rounded up to whole pizzas. School-managed and allergy totals are entered separately and combined in lunch totals.
- Print the Weekly summary as a US Letter landscape kitchen sheet. Substitution controls are in Students & Classrooms; there is no separate Weekly counts tab.
- CLC super admins manage a shared PocketBase menu-item catalog in the **Menu items** tab; items can be added, renamed, archived, and restored. Saved daily menus retain their text when catalog items change.
- CLC staff create monthly menus, mark days off, and publish selected dates to the read-only public menu. Both admin and public menus export the same five-column calendar in editable Word .docx and Print / Save PDF, with blue weekday headers, green date rows, yellow meals, and pink closed or out-of-month days. Pizza counts are calculated automatically; menus have no pizza-count input.
- On the `admin.cliffslunchclub.com` subdomain, CLC super admins can edit menus across all schools. The editor shows the current and next month, offers daily menu choices, and pre-fills unpublished suggestions from a weekday rotation.

Parents do not have app accounts and cannot order meals. The public menu only returns dates marked as published. This is the parent user type; the two authenticated account roles are `clc_admin` (CLC super admin) and `daycare_admin` (school admin).

## School menus

October menus are populated for Bergenfield, Fort Lee, and TLE. TLE follows Bergenfield, with Fridays marked as no service. Fort Lee has breakfast for lunch on October 5, fish sticks with rice on October 26, and sweet potato fries with pizza. Bergenfield's pizza has no listed side.

PocketBase applies migrations on startup. Existing saved menu edits are preserved when correcting the starter menus. Next-month suggestions remain unpublished until reviewed by CLC.

The interface uses the Sample School cream and garden-green palette, with Nunito typography and warm tomato accents.

For production, point the school's subdomains at this same frontend build: `bergenfield.cliffslunchclub.com`, `fortlee.cliffslunchclub.com`, and `tle.cliffslunchclub.com`. The frontend maps those hostnames to their school menu slugs. For local testing, add `?school=lightbridge-bergenfield`, `?school=lightbridge-fort-lee`, or `?school=tle-englewood-cliffs` to the local URL.

## Development checks

```sh
cd frontend
npm run build
cd ..
npm test
```

The first check type-checks and builds the web app. The tests check weekday calculations, the editable month horizon, and menu rotation suggestions.

## Project files

- `frontend/src` — React app and count logic
- `pb_migrations` — PocketBase collections, access rules, and local demo seed
- `pb_hooks` — secure CLC admin creation and substitution endpoint
- `scripts/start.mjs` — local PocketBase and Vite launcher
- `test` — focused recurring-count checks

Never commit `pb_data` or frontend environment files. Keep development seed data out of public releases.

School staff always have a read-only Menu tab. Roster and substitution sections follow each school’s feature toggles; the Students & Classrooms tab is hidden when both are off. Turning off roster operations does not disable accounts. Parents open the current month as an embedded PDF with a download fallback.
