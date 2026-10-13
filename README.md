# Cardédex

A responsive Pokédex and Pokémon trading-card browser. It uses PokéAPI for the complete species list and Pokémon details, and TCGdex for card imagery and metadata.

Features include favorites, owned/wanted card tracking, completion progress, card variant labels, set/rarity/status filters, evolution chains, stat comparisons, shiny artwork, Danish UI, dark mode, offline API caching, market links, local collection backup/restore, and a Trade Binder preview. Collection values can be shown in their original EUR/USD market currencies or converted to Danish kroner using cached ECB reference rates.

Cardedex supports self-service, passwordless Supabase accounts. A collector enters
their own email and verifies a six-digit code; a new email creates an account and
an existing email signs into the same account on another device. An account-scoped IndexedDB operation
journal and confirmed server baseline protect offline changes. Signed-in
collections synchronize through an authenticated, revision-checked database
function. Divergent revisions pause for an explicit, downloadable comparison;
non-overlapping changes can be reviewed as a proposed combination and overlapping
fields require a per-field choice. Trade Binder snapshots remain file-based and
read-only for now.

## Run locally

From this folder, start any static web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

No build step is required. An internet connection is needed for account login,
synchronization, Pokémon data, and images. Local collection edits continue to
save on the device while offline.

## Phone app

The hosted site is an installable Progressive Web App. On iPhone, open it in Safari and choose **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Install app** from the browser menu.

Each browser keeps a local collection copy. Collectors use the same email address
on every device, so a second device opens the same account rather than creating
another identity. Collection
data synchronizes to that collector's private account, while language, theme, and
other presentation preferences remain local to each device. Row-level security
restricts collection access to the authenticated owner.

## Account backend

Apply `backend/supabase-schema.sql` to a new Supabase project, followed by
`backend/supabase-account-sync.sql`. The frontend contains only the public
project URL and publishable key. Secret keys, service-role keys, database
passwords, and access tokens must never be added to browser code or Git.

Enable email signup in Supabase Auth and change the Magic Link email template to
contain the six-digit `{{ .Token }}` value used by the Cardedex form. The browser
calls Supabase Auth with the publishable key only; no invitation administrator or
service-role Edge Function is required.

## Windows app

The packaged `Cardedex-Windows-x64.exe` is portable: copy it to a Windows 10 or 11 computer and double-click it. It does not need to be installed, but it does need an internet connection for Pokémon data and card images.

To rebuild the Windows executable:

```bash
npm install
npm run package:windows
```

The executable will be created in `dist/`.
