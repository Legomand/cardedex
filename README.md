# Cardédex

A responsive Pokédex and Pokémon trading-card browser. It uses PokéAPI for the complete species list and Pokémon details, and TCGdex for card imagery and metadata.

Features include favorites, owned/wanted card tracking, completion progress, card variant labels, set/rarity/status filters, evolution chains, stat comparisons, shiny artwork, Danish UI, dark mode, offline API caching, market links, and local collection backup/restore. Collection data stays on the device; there are no accounts.

## Run locally

From this folder, start any static web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

No build step or API key is required. An internet connection is needed for Pokémon data and images.

## Phone app

The hosted site is an installable Progressive Web App. On iPhone, open it in Safari and choose **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Install app** from the browser menu.

Each browser keeps its own collection locally. Collection information is never uploaded to GitHub and is not shared between devices.

## Windows app

The packaged `Cardedex-Windows-x64.exe` is portable: copy it to a Windows 10 or 11 computer and double-click it. It does not need to be installed, but it does need an internet connection for Pokémon data and card images.

To rebuild the Windows executable:

```bash
npm install
npm run package:windows
```

The executable will be created in `dist/`.
