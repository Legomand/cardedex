# Cardedex synchronization acceptance results

Run date: 2026-10-13

This report distinguishes locally verified behavior from checks that require a
deployed Supabase project, real email delivery, or physical devices. A blocked
check is not treated as passed.

## Passed locally

### Collection and synchronization logic

- Version-7 synchronization excludes device language, theme, and presentation
  settings.
- Version-6 JSON backup export and restore preserve favorites, owned/wanted
  state, quantities, primary and owned printings, set/series goals, completion
  mode, and local settings.
- The IndexedDB operation journal survives a simulated browser restart.
- Pending operations remain scoped to their original profile and account.
- Completing one upload deletes only the acknowledged operation IDs; edits
  queued while the request is in flight remain pending.
- A lost-response retry selects the exact submitted operation before newer
  edits, allowing the backend idempotency record to resolve it safely.
- Non-overlapping device changes produce a proposed combination.
- Conflicting changes to one card require review and resolve status, quantity,
  and printings atomically.
- Removing a card while another device changes its quantity cannot leave an
  orphaned quantity or printing.
- A remote deletion replaces an open collection view without creating a stale
  upload from that device, including when the deleted card was the final card.
- Language, theme, and other device-only saves do not queue collection uploads.
- Delayed card-detail loading does not save or upload an unchanged collection.
- Permanent backend contract errors are not placed in the network retry loop.

### Authentication and signup

- Signup/login uses `shouldCreateUser: true` and verifies a six-digit OTP. A new
  email creates an account; Supabase Auth resolves an existing email to the same
  identity on another device.
- New Auth users receive exactly one profile and collection through the
  idempotent account bootstrap trigger.
- The browser contains no administrator-invite or service-role flow.

### PostgreSQL and RLS integration

The initial schema and account-sync migration were applied to PostgreSQL 18,
then exercised as separate authenticated collectors.

- A collector can read their own collection and cannot read another collector's
  collection.
- Direct collection writes are denied.
- The synchronization operation journal is denied to browser roles.
- Version-7 RPC uploads apply at the expected revision.
- A stale revision returns a conflict and the current server snapshot.
- Repeating one operation ID returns `duplicate` without incrementing the
  revision or applying a different payload.
- Version-6 uploads are rejected by the v57 backend contract.
- The two canonical account-sync SQL files are byte-identical.

### Rollback integration

The sequence initial schema -> v57 backend -> v54 compatibility rollback was
applied to PostgreSQL 18.

- The pre-rollback collection row was copied to the rollback schema.
- Version-6 and version-7 transition payloads both applied through the rollback
  RPC.
- Revision checking and the hardened security-definer boundary remained active.
- The rollback performed no table/schema drop or truncate.

### Static delivery checks

- `npm test` passes.
- JavaScript syntax checks and `git diff --check` pass.
- The application shell identifies `cardedex-shell-v57` and includes the changed
  authentication and synchronization scripts.
- Browser runtime files contain no service-role credential.
- Previously captured 390 x 844 and 1280 x 900 conflict-dialog screenshots were
  visually reviewed and show no horizontal overflow or clipped conflict actions.

## Blocked external acceptance checks

These checks could not be executed honestly from the current sandbox:

- The configured live Supabase endpoint is unreachable from this environment.
- No database password or external dump was available, so production data was
  not touched.
- Creating an account from a real email code and logging that same account into
  two real devices require a deployed project and throwaway mailbox.
- Confirming that repeated signup/login requests retain one Auth identity requires
  authenticated test users on the target Supabase project.
- Real offline/reconnect behavior across two independent physical devices still
  requires the manual scenarios in `SYNC-TEST-PLAN.md`.
- Current Chromium and Electron launches are blocked by the execution sandbox's
  socket/sandbox restrictions. The earlier phone/desktop screenshots remain
  useful visual evidence, but they are not counted as a fresh browser pass.
- Portable Windows Electron behavior requires the Windows build/device.

These blocked checks remain release gates. Do not deploy to valuable collections
until the external database dump is verified and the live two-device tests pass.
