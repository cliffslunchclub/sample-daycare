# Preschool production deployment

Backend: https://clc-preschools.pockethost.io (PocketBase 0.28.4).
Frontend: preschool, lba-bf, lba-fl, tle-ec subdomains of cliffslunchclub.com.
The main website is separate.

## Initial data transfer

Keep the PocketHost instance off. Stop the local app on the Mac before copying
its latest pb_data folder. Make an untouched backup first. Do not commit or put
this database inside public_html. Copy hooks and migrations separately.

Prepare a separate copy for production. Preserve all business collections,
uploads, schedules, invoices and history. Replace login accounts with one
CLC admin, joe@cliffslunchclub.com, with a new password. Old superuser accounts
and sessions must also be replaced. Review user relations before deleting
accounts so PocketBase does not cascade-delete business records. Perform this
through PocketBase on the separate copy, verify collection counts and records,
and upload that verified copy while PocketHost is off. Never sanitize the
original Mac database. We still need the Mac backup to perform this step.

After transfer start the instance, apply pending migrations, create a new
PocketBase superuser privately, and test the app before enabling deployments.
Application CLC admin and PocketBase superuser are separate accounts.

## GitHub configuration

Repository Settings → Secrets and variables → Actions.
Secrets:
- SITEGROUND_HOST: SSH hostname from SiteGround.
- SITEGROUND_USER: SSH username from SiteGround.
- SITEGROUND_SSH_KEY: private key authorized on SiteGround.
- POCKETHOST_USER: PocketHost account email.
- POCKETHOST_SSH_KEY: Ed25519 private key authorized for clc-preschools only.
- DEPLOY_KNOWN_HOSTS: verified SSH host-key entries for both hosts and ports.

Variables:
- SITEGROUND_ROOT: verified absolute remote parent directory containing the
  four subdomain folders. Confirm using SFTP; do not guess this path.
- SITEGROUND_PORT: SSH port (default 18765; confirm in SiteGround).
- DEPLOY_READY: leave unset until initial data transfer and tests succeed.
  Set to true to enable push-to-main and manual deployments.

Workflow: Deploy preschools. Uploads backend code then the same production
frontend to all four subdomains. Never uploads pb_data or resets users. Existing
asset files are retained so open sessions can continue using old bundles.
Verify backend migrations have applied after code uploads; restart the instance
if required by PocketHost. Check the first deployment before inviting schools.

## Invoice behavior

Creation produces a private draft. Save Invoice shares it with its school while
keeping the draft editable by CLC. Saved TLE invoices permit the next period
and participate in carry-forward corrections. Previously issued invoices stay
frozen. Display/payment-term toggles do not change billing totals.
