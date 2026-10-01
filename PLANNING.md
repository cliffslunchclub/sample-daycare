# Daycare application decisions

Implementation was authorized after planning. See README.md for implemented workflows, running instructions, and current limitations.

## Agreed requirements

- Administrators only; parents do not have accounts or ordering workflows.
- Each location sees only its own numbers and projected invoice. CLC has the combined internal production view.
- Only CLC super admin changes location pricing, Small/Large and substitution toggles, and the A/B/C/V definitions.
- Substitutions repeat weekly. Weekend changes are customary but editing is not locked on weekdays.
- One meal rate per location regardless of portion size. Invoice projection is subtotal only, without tax.
- Billing is based on scheduled enrollment at the beginning of the month. Ordinary absences do not reduce invoices or preparation.
- CLC alone manages signed meal-unit adjustments, each with its own note and audit trail.
- Location administrators submit notes for CLC review without directly changing adjustments.
- CLC-managed students are visible as read-only to the location, separately packaged/labeled, and excluded from school invoices.
- Pizza calculation rounds up standard bulk meal units divided by three per location.
- Reuse CHS visual design cues. Keep this application's source and workflow separate.

## First-version implementation choices

- Saved monthly subtotal snapshots prevent later schedule changes rewriting a previously recorded amount.
- CLC staff may perform operations; settings/pricing/account creation remain super-admin only.
- Separately packed CLC meals are shown separately from bulk pizza counts.
- Service closures are CLC-managed. A closure changes unsaved projections but does not rewrite saved monthly subtotals.
- Real student source files and billing figures are not committed. Sample records are fictional.
