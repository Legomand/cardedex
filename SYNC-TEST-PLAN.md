# Cardedex account and multi-device sync acceptance plan

Latest execution results are recorded in `SYNC-TEST-RESULTS.md`. Items marked
blocked there remain required release gates rather than assumed passes.

Run this plan against a development Supabase project before applying the upgrade
to production. Use throwaway email addresses and test collections. Never paste a
service-role key, login token, or database password into the browser, repository,
screenshots, or test notes.

Before starting, prepare the external dump and pinned v54 fallback described in
`ROLLBACK-PLAN.md`. Do not begin live testing without verifying the dump listing.

## 1. Prepare the development environment

1. Export a JSON backup from every device that contains a collection you care
   about. Keep those files outside the repository.
2. Apply the Supabase migrations in timestamp order. Existing projects need
   `supabase/migrations/20261013000000_safe_multi_device_sync.sql`; a fresh
   project can run the complete migration directory.
3. Enable email signup in Supabase Auth.
4. Change the Magic Link email template to show the
   six-digit `{{ .Token }}` used by Cardedex's OTP form.
5. Configure the Site URL and allowed redirect URL for the development site.
6. Serve the updated frontend and confirm `cardedex-shell-v57` is installed.
7. Prepare two independent browser profiles or physical devices, called A and
   B. Do not use two tabs in the same browser profile because they share storage.

## 2. Self-service signup and device-login tests

- On device A, enter a new throwaway email and request a code. Confirm the text
  explains that a new account will be created when the code is verified.
- Enter an incorrect code and confirm the
  app stays signed out without losing local data. Then enter a valid code.
- Confirm exactly one Auth user, profile, and collection were created.
- On device B, use the same email and a new sign-in code. Expect the same
  Supabase user ID and collection; this must not create a second account.
- Request another code for the same email and confirm the Auth user count remains
  one.
- Sign out on A. Confirm B remains signed in and synchronized.

## 3. Basic collection synchronization

1. On A, add one owned card with quantity 2, an owned printing, a wanted card,
   a favorite Pokémon, and a completion goal. Wait for the green synchronized
   status and record the displayed server revision.
2. Sign in on an empty B. Confirm it downloads every collection field from A.
3. Change B's language and theme. Focus A or wait up to 60 seconds. Confirm A's
   language and theme do not change.
4. On A, add another card. Bring B to the foreground. Confirm B refreshes the
   collection without reloading the page.
5. Keep B's collection open. Remove that card on A and wait for A to report
   that it is synchronized. Bring B to the foreground and confirm the card is
   removed there. Return to A and confirm the card does not reappear.
6. Repeat step 5 with the final card in a throwaway collection. An empty
   collection must synchronize as a deliberate deletion, not as missing data.
7. Change only the language or theme on B. Confirm this does not create a new
   server revision or restore any removed card.
8. Export a normal collection backup from B and verify it still uses the
   backwards-compatible version-6 backup contract and contains local settings.

## 4. Offline and conflict tests

### Non-overlapping changes

1. Put B offline and add card X.
2. While B remains offline, add different card Y on A and wait for A to sync.
3. Reload B while still offline and confirm X remains present.
4. Reconnect B. Expect sync to pause with a proposed combination; neither copy
   may be applied automatically.
5. Select **Download both copies** and inspect the JSON file for base, device,
   and account snapshots.
6. Approve the proposed combination. Confirm both X and Y appear on A and B.

### Overlapping changes

1. Start with the same card quantity on both devices.
2. Put B offline. Change the quantity to 2 on B and to 3 on A.
3. Reconnect B. Expect one card row showing each side's status, quantity, and
   printings, with explicit **This device** and **Account** choices. Card fields
   are resolved together so a quantity or printing can never survive without
   its owned status. The reviewed-combination button must remain disabled until
   a choice is selected.
4. Test each choice in separate runs and confirm the unselected value is not
   applied silently.
5. Repeat once for owned/wanted status and once for owned printings.
6. Repeat with B removing the card while A changes its quantity. Choose the
   removal and confirm no orphaned quantity or printing remains.

### Whole-copy escape hatches

- During a conflict, test **Use this entire device** and **Use entire account
  copy** with throwaway data. Confirm the choice is uploaded or downloaded only
  after the explicit click.
- Confirm the conflict backup can restore either copy through the normal backup
  workflow after extracting the desired snapshot.

## 5. Queue, retry, and account-isolation tests

- With browser network throttling enabled, make several rapid edits while an
  upload is in flight. After connectivity stabilizes, confirm the final edit is
  present and the status returns to synchronized. A later edit must not vanish
  when an earlier request completes.
- Go offline, make edits, close the browser completely, reopen it offline, and
  confirm the edits remain. Reconnect and confirm they upload or enter explicit
  conflict review.
- Interrupt one upload after the server receives it but before the browser gets
  the response. Retry and confirm the operation is applied only once.
- Sign out of account A with an offline edit pending, then sign into throwaway
  account B. Expect an explicit collection choice. Confirm A's queued operation
  is never sent to B.
- Temporarily point a development build at a backend without the migration.
  Confirm the UI reports an actionable backend error rather than retrying every
  five seconds forever.

## 6. Security and rollout checks

- As collector A, verify direct reads of collector B's collection return no
  rows. Verify direct collection updates are denied.
- Verify the revision-checked RPC accepts a version-7 snapshot, rejects a stale
  revision with the current server snapshot, and rejects version-6 uploads.
- Inspect deployed browser resources and confirm they contain only the public
  Supabase URL and publishable key.
- Test the account panel and conflict review at approximately 390 x 844 and
  1280 x 900. Check keyboard navigation, radio labels, focus visibility, Danish
  copy, English copy, and touch targets.
- Install/update the PWA and confirm cache `v57` replaces the old shell. Test a
  portable Electron build separately, including OTP entry and reconnect sync.

## 7. Production rollout order

1. Back up the production database and retain user collection exports.
2. Deploy the `v57` frontend first so active clients begin receiving the safe
   version-7 sync code.
3. Deploy the SQL upgrade. It rejects old version-6 sync uploads, so an outdated
   installed PWA fails closed and keeps changes locally instead of overwriting
   the account collection.
4. Complete the self-service signup plus two-device basic, offline, and
   overlapping-conflict smoke tests
   with a throwaway production account.
5. Only then release it to collectors. Monitor Auth email delivery, RPC
   conflicts, and repeated rejected version-6 uploads.

Acceptance requires every expected result above. Any silent overwrite, missing
queued edit, duplicate account, cross-account row, or unreviewed merge is a
release blocker.
