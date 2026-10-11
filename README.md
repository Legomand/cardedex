# Cardédex

A responsive Pokédex and Pokémon trading-card browser. It uses PokéAPI for the complete species list and Pokémon details, and TCGdex for card imagery and metadata.

Features include favorites, owned/wanted card tracking, completion progress, card variant labels, set/rarity/status filters, evolution chains, stat comparisons, shiny artwork, Danish UI, dark mode, offline API caching, market links, local collection backup/restore, and a Trade Binder preview.

Cardedex supports passwordless Supabase accounts and keeps an IndexedDB-backed
operation journal for offline changes. Signed-in collections synchronize through
an authenticated, revision-checked database function; conflicts require an
explicit choice instead of silently overwriting either copy. Trade Binder
snapshots remain file-based and read-only for now.

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

Each browser keeps a local collection copy. After the collector signs in and
chooses which copy to keep, changes synchronize to that collector's private
account. Row-level security restricts collection access to the authenticated
owner.

## Account backend

Apply `backend/supabase-schema.sql` to a new Supabase project, followed by
`backend/supabase-account-sync.sql`. The frontend contains only the public
project URL and publishable key. Secret keys, service-role keys, database
passwords, and access tokens must never be added to browser code or Git.

## Windows app

The packaged `Cardedex-Windows-x64.exe` is portable: copy it to a Windows 10 or 11 computer and double-click it. It does not need to be installed, but it does need an internet connection for Pokémon data and card images.

To rebuild the Windows executable:

```bash
npm install
npm run package:windows
```

The executable will be created in `dist/`.
