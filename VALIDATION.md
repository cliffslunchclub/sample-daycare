# Validation · v0.2.0

Verified on October 1, 2026 using fictional records and isolated temporary databases.

- `npm run build`: strict TypeScript check and Vite production build passed.
- `npm test`: actual PocketBase 0.28.4 HTTP integration checks passed for unauthenticated rejection, location-scoped reads, private dietary-field removal, direct collection read/write denial, role escalation denial, cross-location mutation denial, super-admin settings restrictions, protected CLC students, billing notes, adjustment permissions and rollback, saved invoice prices/totals, closure counts, account creation, and password updates.
- Chromium browser check: all navigation screens opened; created a student with a no-meal weekday; added an adjustment; saved a monthly subtotal; signed in as a location administrator; verified a single location and absence of CLC kitchen navigation; submitted a billing note; exercised mobile navigation. No page JavaScript errors.
- Desktop dashboard/billing and mobile dashboard screenshots were visually inspected.
- The local launcher started PocketBase and Vite together on alternate ports using an existing compatible binary. It shuts down its direct child processes on termination.

Not performed: Mac execution, a fresh external PocketBase binary download in this environment, a production deployment, physical label-stock alignment, real-data import, or a QuickBooks integration. First-run downloads use the official pinned release and compare its SHA-256 checksum with the release checksum file.
