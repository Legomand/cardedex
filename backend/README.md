# Cardedex backend draft

This folder is a reviewed starting contract, not a deployed backend. The local
preview deliberately contains no Supabase URL, publishable key, service key, or
user credentials.

`supabase-schema.sql` defines PostgreSQL tables for accounts, collections,
idempotent sync operations, revocable Trade Binder links, and trade proposals.
All browser-facing tables have row-level security. Public Trade Binder reads go
through a token-limited function rather than anonymous table access.

`supabase-account-sync.sql` is the next migration. It adds the private JSON
snapshot used by the current browser client, creates new-user profile/collection
records, and exposes one authenticated, revision-checked sync function. Apply it
only after the base schema.

Before production:

1. Create separate development and production Supabase projects.
2. Apply the schema to development and add automated allow/deny RLS tests.
3. Add email or OAuth authentication and custom SMTP.
4. Implement an adapter matching the local contract in `js/sync.js`.
5. Store only the publishable project key in frontend runtime configuration.
6. Keep service-role credentials exclusively in server-side functions.
7. Test migration, offline retries, conflict handling, revocation, rate limits,
   backups, and restore before inviting public users.
8. Replace the file-based share snapshot with a random raw token; store only
   its SHA-256 digest in `share_links`.

The current JSON share/import flow remains useful for testing and for collectors
who want to exchange a snapshot without creating accounts.
