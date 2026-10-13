# Cardedex v54 rollback plan

This kit returns the deployed application to the exact pre-sync-overhaul source
revision without deleting accounts or collection data.

## Pinned rollback point

- Git commit: `97dd0343e0f7dc8513ac60d2bc4deb553565443b`
- Commit date: `2026-10-13T10:34:23+02:00`
- Commit subject: `Focus collection page on saved cards`
- PWA cache: `cardedex-shell-v54`

Do not use `git reset --hard` in the working tree containing the unfinished v57
changes. Build or deploy the rollback from the pinned commit in a separate clone,
CI checkout, or hosting-provider revision selector.

## Before either testing or rollback

Supabase's dashboard backup feature is not required. Make an external logical
backup with PostgreSQL's `pg_dump`, which is installed locally:

```bash
read -rsp "Supabase database URL: " CARDEDEX_DATABASE_URL
echo
export CARDEDEX_DATABASE_URL
mkdir -p "/run/media/alex/SSD 500 GB/AIArmy/generated/cardedex-backups"
pg_dump --dbname="$CARDEDEX_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="/run/media/alex/SSD 500 GB/AIArmy/generated/cardedex-backups/cardedex-before-v57.dump"
unset CARDEDEX_DATABASE_URL
```

Use the direct or session-pooler PostgreSQL connection string from Supabase's
**Connect** panel. Do not save it in this repository, shell history, screenshots,
or chat. Confirm that the dump exists and is non-empty before continuing:

```bash
pg_restore --list "/run/media/alex/SSD 500 GB/AIArmy/generated/cardedex-backups/cardedex-before-v57.dump" | head
```

Also export the normal Cardedex JSON backup from every device with valuable
local-only changes. Database dumps cannot contain unsynchronized device data.

## Rollback order

1. Stop testing and do not choose either side of an unresolved sync conflict.
2. Deploy frontend commit `97dd0343e0f7dc8513ac60d2bc4deb553565443b`.
3. Restore the Supabase Magic Link email template so it contains a clickable
   `{{ .ConfirmationURL }}`; v54 has no six-digit-code input.
4. Run `rollback/20261013_restore_v54_compatibility.sql` in the Supabase SQL
   editor. It snapshots collection rows inside the database and allows v54's
   version-6 payloads while retaining revision checks and hardened privileges.
5. On each device, fully close and reopen the app. Verify that service-worker
   cache `cardedex-shell-v54` replaces v57.

## Rollback verification

- Sign in on one throwaway account using the emailed link.
- Confirm the server collection and revision are unchanged before making edits.
- Add one throwaway card, wait for synchronization, and verify the revision
  increases exactly once.
- Open a second independent browser profile and confirm the account collection
  loads. Do not use valuable collections for this smoke test.
- Verify collector A still cannot read collector B's collection.
- Export a fresh Cardedex JSON backup after stability is confirmed.

If a collection is wrong, stop all clients. Do not overwrite it again. The
external dump is authoritative; the additional in-database copy is stored in
`cardedex_rollback.collections_before_v54_rollback`.

## Restoring the external dump

Do not restore over the live project blindly. Restore into a separate temporary
PostgreSQL/Supabase project first, inspect the desired collection row, and copy
only the confirmed data back. A full restore can overwrite Auth and application
state and therefore requires a separate, explicit recovery decision.
