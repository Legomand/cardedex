# Cardédex

A responsive Pokédex and Pokémon trading-card browser. It uses PokéAPI for the complete species list and Pokémon details, and TCGdex for card imagery and metadata.

Features include favorites, owned/wanted card tracking, completion progress, card variant labels, set/rarity/status filters, evolution chains, stat comparisons, shiny artwork, Danish UI, dark mode, offline API caching, market links, local collection backup/restore, and a Trade Binder preview.

The current development build has a backend-ready collection contract and an IndexedDB-backed local operation journal, but it is not connected to a managed account service yet. Trade Binder snapshots can be exported and imported as read-only JSON files, compared against the local collection, and turned into draft trade proposals without changing either collection.

## Run locally

From this folder, start any static web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

No build step or API key is required. An internet connection is needed for Pokémon data and images.

## Phone app

The hosted site is an installable Progressive Web App. On iPhone, open it in Safari and choose **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Install app** from the browser menu.

Until the managed backend is connected, each browser still keeps its own collection locally. The interface labels this clearly. Collection information is never uploaded automatically or shared between devices in this local preview.

## Windows app

The packaged `Cardedex-Windows-x64.exe` is portable: copy it to a Windows 10 or 11 computer and double-click it. It does not need to be installed, but it does need an internet connection for Pokémon data and card images.

To rebuild the Windows executable:

```bash
npm install
npm run package:windows
```

The executable will be created in `dist/`.
