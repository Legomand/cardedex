# Cardedex backend draft

This folder is a reviewed starting contract, not a deployed backend. The local
preview deliberately contains no Supabase URL, publishable key, service key, or
user credentials.

`supabase-schema.sql` defines PostgreSQL tables for accounts, collections,
idempotent sync operations, revocable Trade Binder links, and trade proposals.
All browser-facing tables have row-level security. Public Trade Binder reads go
through a token-limited function rather than anonymous table access.

`supabase-account-sync.sql` is the next migration. It adds the private JSON
snapshot used by the browser client, creates new-user profile/collection records,
and exposes one authenticated, revision-checked sync function. Apply it only after the base
schema. Its contents must remain byte-for-byte identical to
`supabase/migrations/20261011220000_account_sync.sql`.

Account creation is self-service through Supabase Auth. The same OTP request uses
`shouldCreateUser: true`: a new email creates one account, while an existing email
signs into that same account on additional devices. Supabase's unique Auth email
identity prevents a second account for the same address.

Before production:

1. Create separate development and production Supabase projects.
2. Apply the schema to development and add automated allow/deny RLS tests.
3. Configure custom SMTP and change the Magic Link template to send the six-digit
   `{{ .Token }}` used by the Cardedex OTP form.
4. Test new-account signup and returning-device login with the same email.
5. Store only the publishable project key in frontend runtime configuration.
6. Test migration, two-device offline retries, conflict handling, rate limits,
   backups, and restore before release.
7. Replace the file-based share snapshot with a random raw token; store only
   its SHA-256 digest in `share_links`.

The current JSON share/import flow remains useful for testing and for collectors
who want to exchange a snapshot without creating accounts.
