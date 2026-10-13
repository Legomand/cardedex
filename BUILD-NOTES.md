# Cardedex binder scanner and collection tools

This release adds the first binder-page photo flow, completion tracking,
local sync scaffolding, and Trade Binder previews.

## Included

- Photograph or choose a 3 x 3, 3 x 4, or 4 x 4 binder-page image.
- Dark-pocket seam detection can identify the grid and crop surrounding table,
  floor, or other background before dividing the page into slots.
- Automatic portrait normalization and fixed-grid card crops.
- One shared Tesseract worker for the whole page.
- Existing OCR, TCGdex lookup, text evidence, and visual ranking reused per slot.
- Review grid with confidence, candidate correction, opt-in checkboxes, and one
  bulk-add action. Duplicate copies increase collection quantities.
- Versioned `cardedex-binder-scan/v1` JSON held in the browser session.
- Persistent completion goals for selected sets and series, calculated from
  unique owned card IDs against TCGdex totals (including secret cards).
- Completion goals and owned printings are included in version 5 collection
  backup exports.
- Completion can switch between "any printing" and "every known printing".
  Owned cards can record multiple known TCGdex printings (normal, holo, reverse,
  First Edition, and promo where supplied).
- Entire runtime is browser-side. It has no Codex, AI Army, private server, or
  tailnet dependency. Network access is still required for the existing CDN
  Tesseract loader and TCGdex catalogue/image lookups.
- Passwordless Supabase accounts with an IndexedDB snapshot and operation
  journal, authenticated private sync, offline retry, idempotent operation IDs,
  server revisions, and an explicit conflict choice.
- Trade Binder JSON export/import with all, duplicate-only, or selected-card
  scopes; optional wishlist matching; expiry validation; read-only inspection;
  two-way wanted-card comparison; and draft trade-proposal export.
- A Supabase/PostgreSQL schema under `backend/` with row-level security,
  account bootstrap, private snapshot sync, revocable share-link records, and
  trade proposals. The browser configuration contains only a publishable key.
- Optional DKK display for Cardmarket and TCGplayer estimates. The app refreshes
  official ECB reference rates when online and keeps the last valid rate for
  offline use; original EUR/USD market values remain selectable.

## Deliberately not included yet

- Binder video capture and stable-frame selection.
- Perspective corner detection for strongly skewed pages.
- A trained ONNX card detector. The current prototype uses deterministic grid
  crops because no validated model artifact is available yet.
- Persistence/export of the scan-session JSON after the review is complete.
- Shadowless and other specialist historical print runs are not consistently
  represented by TCGdex and are therefore not claimed by master-set totals.
- Hosted Trade Binder URLs/QR codes, share revocation UI, trade proposals,
  server-side public-link rate limits, and automatic managed backups.

## Validate

Run `npm test` from this directory. A real-phone trial with several 3 x 3 and
3 x 4 pages is still required to tune crop margins and confidence thresholds.
The supplied 1080 x 1920 4 x 4 binder photograph is used as a local acceptance
fixture and currently passes automatic 4 x 4 detection and background cropping.
