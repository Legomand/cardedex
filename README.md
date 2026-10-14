# Cardédex

A responsive Pokédex and Pokémon trading-card browser. It uses PokéAPI for the complete species list and Pokémon details, and TCGdex for card imagery and metadata.

Features include favorites, owned/wanted card tracking, completion progress, card variant labels, set/rarity/status filters, evolution chains, stat comparisons, shiny artwork, Danish UI, dark mode, offline API caching, market links, local collection backup/restore, and a Trade Binder preview. Collection values can be shown in their original EUR/USD market currencies or converted to Danish kroner using cached ECB reference rates.

Cardedex is local-first and account-free. Collection data stays in the browser or
desktop app. Versioned backup files move a complete collection between devices.
The same complete version-6 backup can be copied and pasted as a `CDXC1` import
string, including the collection's local settings, without using a server or URL.
Trade Binders share only the cards a collector chooses, remain read-only when
opened, and can be compared locally to create reviewable trade offers. Compact
`CDX1` import strings can be sent through the phone share sheet or copied between
devices without depending on a hostname or redirect service. Anyone holding such
a code can read its shared subset, so it should be treated like the equivalent
JSON file. JSON files remain available for large collections
and offline handoff. After a
physical trade, either collector can review
the exact additions and removals for their side and explicitly apply them to that
device's collection; offers never change a collection automatically. Sharing lives
in its own Trade tab, where each device resolves the shared card IDs into artwork
through the normal TCGdex card-data path.

Trade offers also expose an on-device QR handoff when their compact import code
fits the app's conservative 213-byte QR capacity. The QR option is omitted for
larger offers; those continue through import strings or files. Collection binders
do not expose QR sharing.

## Run locally

From this folder, start any static web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

No build step is required. An internet connection is needed for Pokémon/card
catalogue data, images, exchange rates, and the scanner's OCR support. Collection
storage, backups, Trade Binders, and trade offers do not use a Cardedex server.

## Phone app

The hosted site is an installable Progressive Web App. On iPhone, open it in Safari and choose **Share → Add to Home Screen**. On Android, open it in Chrome and choose **Install app** from the browser menu.

Each browser keeps its own local collection copy. Use an exported backup to move
or copy the complete private collection to another device. Use a Trade Binder
when sharing a limited, read-only view with another collector.

## Windows app

The packaged `Cardedex-Windows-x64.exe` is portable: copy it to a Windows 10 or 11 computer and double-click it. It does not need to be installed, but it does need an internet connection for Pokémon data and card images.

To rebuild the Windows executable:

```bash
npm install
npm run package:windows
```

The executable will be created in `dist/`.
