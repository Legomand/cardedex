import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scannerSource = fs.readFileSync(path.join(root, "js/scanner.js"), "utf8");
const collectionSource = fs.readFileSync(
  path.join(root, "js/collection.js"),
  "utf8",
);
const coreSource = fs.readFileSync(path.join(root, "js/core.js"), "utf8");
const cardsSource = fs.readFileSync(path.join(root, "js/cards.js"), "utf8");
const catalogSource = fs.readFileSync(path.join(root, "js/catalog.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "js/auth.js"), "utf8");
const syncSource = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const tradeSource = fs.readFileSync(path.join(root, "js/trade.js"), "utf8");
const qrSource = fs.readFileSync(path.join(root, "js/qr.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const accountSyncSql = fs.readFileSync(
  path.join(root, "backend/supabase-account-sync.sql"),
  "utf8",
);
const accountSyncMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261011220000_account_sync.sql"),
  "utf8",
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function loadScanner() {
  const node = {
    addEventListener() {},
    querySelectorAll() { return []; },
    setAttribute() {},
    removeAttribute() {},
    style: {},
    parentElement: { style: {} },
    dataset: {},
    value: "auto",
    files: [],
  };
  const context = vm.createContext({
    console,
    document: {
      querySelector() { return node; },
      createElement() { return node; },
      head: { append() {} },
    },
    window: {},
  });
  vm.runInContext(scannerSource, context, { filename: "js/scanner.js" });
  return context;
}

test("binder controls exist once and are wired to scanner code", () => {
  for (const id of [
    "scannerBinderCamera",
    "scannerBinderGallery",
    "scannerBinderLayout",
    "scannerBinderCameraInput",
    "scannerBinderGalleryInput",
  ]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1);
    assert.match(scannerSource, new RegExp(id));
  }
});

test("collection workspace uses separate tabs with collected-card values", () => {
  const tabsPosition = html.indexOf('class="collection-tabs"');
  const browserPosition = html.indexOf('class="collection-browser"');
  const completionPosition = html.indexOf('id="collectionPanelCompletion"');
  const favoritesPosition = html.indexOf('id="collectionPanelFavorites"');
  const valuesPosition = html.indexOf('id="collectionPanelValues"');
  const backupPosition = html.indexOf('id="collectionPanelBackup"');
  const statsPosition = html.indexOf('id="collectionStats"');
  const tabsMarkup = html.slice(tabsPosition, browserPosition);
  assert.ok(tabsPosition > -1);
  assert.ok(browserPosition > tabsPosition);
  assert.ok(completionPosition > browserPosition);
  assert.ok(favoritesPosition > completionPosition);
  assert.ok(valuesPosition > favoritesPosition);
  assert.ok(backupPosition > valuesPosition);
  assert.ok(statsPosition > valuesPosition && statsPosition < backupPosition);
  assert.ok(tabsMarkup.indexOf("collectionTabCards") < tabsMarkup.indexOf("collectionTabCompletion"));
  assert.ok(tabsMarkup.indexOf("collectionTabCompletion") < tabsMarkup.indexOf("collectionTabFavorites"));
  assert.ok(tabsMarkup.indexOf("collectionTabFavorites") < tabsMarkup.indexOf("collectionTabValues"));
  assert.ok(tabsMarkup.indexOf("collectionTabValues") < tabsMarkup.indexOf("collectionTabBackup"));
  assert.match(html, /id="collectionCardsTitle">Collected cards</);
  assert.match(html, /id="collectionCardValue"/);
  assert.match(html, /role="tab"[^>]+aria-controls="collectionPanelCards"/);
  assert.match(html, /role="tab"[^>]+aria-controls="collectionPanelValues"/);
  assert.match(html, /role="tab"[^>]+aria-controls="collectionPanelBackup"/);
  assert.match(html, /role="tab"[^>]+aria-controls="collectionPanelCompletion"/);
  assert.match(html, /role="tab"[^>]+aria-controls="collectionPanelFavorites"/);
  assert.match(html, /id="collectionTabCards"[^>]*>Cards</);
  assert.match(html, /id="collectionTabCompletion"[^>]*>Goals</);
  assert.match(html, /id="collectionTabValues"[^>]*>Value</);
  assert.match(appSource, /function activateCollectionTab\(/);
  assert.match(appSource, /ArrowRight/);
  assert.match(collectionSource, /#collectionCardValue/);
  assert.match(stylesSource, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test("collection is available from the mobile bottom navigation", () => {
  assert.equal((html.match(/id="collectionNav"/g) || []).length, 1);
  assert.match(html, /class="collection-nav" href="#collection"/);
  assert.match(html, /class="mobile-about" id="mobileAbout" href="#about"/);
  assert.match(appSource, /hash === "#collection"/);
  assert.match(appSource, /collectionDialog\.addEventListener\("close"/);
  assert.match(stylesSource, /\.collection-nav \{ display:none; \}/);
  assert.match(stylesSource, /\.site-header nav \.collection-nav \{ display:flex; \}/);
  assert.match(stylesSource, /\.site-header nav a\[href="#about"\] \{ display:none; \}/);
  assert.match(stylesSource, /\.site-header \.collection-button \{ display:none; \}/);
  assert.match(stylesSource, /\.mobile-about \{ display:inline-flex;/);
  assert.match(stylesSource, /height:calc\(68px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(stylesSource, /background:var\(--white\); box-shadow:0 -8px 26px/);
  assert.match(stylesSource, /\.site-header nav a\.active \{ color:var\(--ink\); background:var\(--cream\)/);
  assert.match(stylesSource, /a\.active::after \{ width:28px;[^}]+transform:translateX\(-50%\)/);
  assert.doesNotMatch(stylesSource, /a\[href="#(?:pokedex|trade|collection)"\]::before/);
});

test("an activated PWA shell reloads the open page once", () => {
  assert.match(appSource, /serviceWorker\.addEventListener\("controllerchange"/);
  assert.match(appSource, /reloadingForServiceWorker/);
  assert.match(appSource, /location\.reload\(\)/);
  assert.match(appSource, /registration\.update\(\)/);
});

test("auto layout chooses common 9-pocket and 12-pocket pages", () => {
  const scanner = loadScanner();
  assert.equal(scanner.scannerBinderLayoutFor({ width: 1000, height: 1400 }).id, "3x3");
  assert.equal(scanner.scannerBinderLayoutFor({ width: 1000, height: 1800 }).id, "3x4");
  assert.equal(scanner.scannerBinderLayoutFor({}, "3x3").rows, 3);
  assert.equal(scanner.scannerBinderLayoutFor({}, "3x4").rows, 4);
  assert.equal(scanner.scannerBinderLayoutFor({}, "4x4").columns, 4);
});

test("supplied binder photo is detected and cropped as a 4x4 page", (context) => {
  const fixture = "/run/media/alex/SSD 500 GB/AIArmy/uploads/5fb2a265-e8d3-4a67-9abe-a738aa4dac81/Messenger_creation_B7A44681-39AD-4EF2-8B4E-4B7F0D4E455F.jpeg";
  if (!fs.existsSync(fixture)) {
    context.skip("local binder-photo fixture is unavailable");
    return;
  }
  const converted = spawnSync("magick", [
    fixture,
    "-resize",
    "180x320!",
    "-depth",
    "8",
    "rgba:-",
  ]);
  assert.equal(converted.status, 0, converted.stderr.toString());
  const scanner = loadScanner();
  const detected = scanner.scannerBinderDetectGridFromPixels(
    new Uint8Array(converted.stdout),
    180,
    320,
  );
  assert.equal(detected.layout.id, "4x4");
  assert.ok(detected.bounds.y > 25, "wood above the binder should be cropped");
  assert.ok(
    detected.bounds.height < 285,
    "floor and legs below the binder should be cropped",
  );
});

test("binder output uses the versioned on-device JSON contract", () => {
  const scanner = loadScanner();
  const output = scanner.scannerBinderJson({
    layout: { id: "3x3", columns: 3, rows: 3 },
    slots: [{
      position: 1,
      confidence: 0.87654,
      quality: { sharpness: 0.61234, glare: 0.03456 },
      evidence: { name: "pikachu", collectorNumbers: ["58"], hp: 60 },
      include: true,
      selectedId: "base1-58",
      candidates: [{
        id: "base1-58",
        name: "Pikachu",
        localId: "58",
        set: { name: "Base Set" },
      }],
    }],
  });
  assert.equal(output.schema, "cardedex-binder-scan/v1");
  assert.equal(output.source, "on-device");
  assert.equal(output.slots[0].include, true);
  assert.equal(output.slots[0].confidence, 0.877);
  assert.equal(output.slots[0].candidates[0].id, "base1-58");
});

test("runtime contains no Codex or AI Army dependency", () => {
  const runtime = [
    "index.html",
    "app.js",
    "js/core.js",
    "js/catalog.js",
    "js/cards.js",
    "js/collection.js",
    "js/sync.js",
    "js/trade.js",
    "js/scanner.js",
  ].map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  assert.doesNotMatch(runtime, /codex|ai[ -]?army|tailscale/i);
});

test("card filters default to the complete matching card catalogue", () => {
  for (const id of ["catalogViewToggle", "catalogCardGrid"]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1);
  }
  assert.match(catalogSource, /state\.catalogCards = cards/);
  assert.match(catalogSource, /card\.set \|\| set/);
  assert.match(catalogSource, /function renderCatalogCards\(\)/);
  assert.match(catalogSource, /function catalogCardFilterActive\(\)/);
  assert.match(catalogSource, /const showCards = filterActive;/);
  assert.match(catalogSource, /state\.catalogView = showCards \? "cards" : "pokemon"/);
  assert.match(catalogSource, /classList\.toggle\("cards-view", showCards\)/);
  assert.match(catalogSource, /class="card-status catalog-card-status"/);
  assert.match(catalogSource, /data-status="owned" aria-pressed=/);
  assert.match(catalogSource, /data-status="wanted" aria-pressed=/);
  assert.match(appSource, /catalogCardGrid\.addEventListener\("click"[\s\S]*?setCardStatus\(item\.dataset\.cardId, status\.dataset\.status\)/);
  const catalogCardGrid = { innerHTML: "" };
  const context = vm.createContext({
    setCode(id) { return id.slice(0, id.lastIndexOf("-")); },
    deriveVariant() { return "Standard"; },
    escapeHtml(value) { return String(value); },
    cardImageUrl(card) { return `https://images.test/${card.id}.webp`; },
    t(key) { return key; },
    catalogCardGrid,
    resultCount: { textContent: "" },
    loadMore: { hidden: false },
    state: {
      catalogCards: [
        { id: "base1-4", localId: "4", name: "Charizard" },
        { id: "base1-88", localId: "88", name: "Professor Oak" },
        { id: "base1-102", localId: "102", name: "Water Energy" },
      ],
      settings: { hidePocket: false },
      catalogSeries: "base",
      catalogSet: "base1",
      catalogRarity: "all",
      rarityCards: [],
      rarityLoading: false,
      artist: null,
      artistCards: [],
      artistLoading: false,
      artistCardIds: null,
      rarityCardIds: null,
      cardSets: [],
      cardStates: { "base1-4": "owned", "base1-88": "wanted" },
      catalogVisible: 100,
      generation: "all",
    },
  });
  vm.runInContext(catalogSource, context, { filename: "js/catalog.js" });
  assert.deepEqual(
    [...context.catalogCardsForDisplay()].map((card) => card.name),
    ["Charizard", "Professor Oak", "Water Energy"],
  );
  assert.equal(context.catalogCardFilterActive(), true);
  context.renderCatalogCards();
  assert.match(catalogCardGrid.innerHTML, /data-card-id="base1-4"[\s\S]*?data-status="owned" aria-pressed="true"/);
  assert.match(catalogCardGrid.innerHTML, /data-card-id="base1-88"[\s\S]*?data-status="wanted" aria-pressed="true"/);
  context.state.catalogRarity = "Rare";
  context.state.rarityCards = [
    { id: "base1-4", localId: "4", name: "Charizard" },
    { id: "base1-88", localId: "88", name: "Professor Oak" },
  ];
  assert.deepEqual(
    [...context.catalogCardsForDisplay()].map((card) => card.name),
    ["Charizard", "Professor Oak"],
  );
});

test("30th Celebration RGB Rare cards use available image fallbacks", () => {
  for (const [id, product] of [
    ["30th-B", "717609"],
    ["30th-G", "717608"],
    ["30th-R", "717607"],
  ]) {
    assert.match(coreSource, new RegExp(`"${id}"[\\s\\S]{0,100}${product}`));
  }
});

test("all 30th Classic Collection cards use the complete artwork source", () => {
  const context = vm.createContext({
    cardImageOverrides: {},
    isPocketCard() { return false; },
    encodeURIComponent,
  });
  vm.runInContext(cardsSource, context, { filename: "js/cards.js" });
  for (let number = 1; number <= 30; number++) {
    const localId = String(number).padStart(3, "0");
    assert.equal(
      context.cardImageUrl({
        id: `30th-c-${localId}`,
        localId,
        image: `https://assets.tcgdex.net/en/me/30th-c/${number}`,
        set: { id: "30th-c" },
      }),
      `https://img.illudex.com/30th-c-${localId}/high.webp`,
    );
  }
});

test("broken card artwork can recover from detailed marketplace metadata", () => {
  const context = vm.createContext({
    cardImageOverrides: {},
    isPocketCard() { return false; },
    encodeURIComponent,
  });
  vm.runInContext(cardsSource, context, { filename: "js/cards.js" });
  assert.equal(
    context.tcgplayerCardImageUrl({
      variants_detailed: [{
        pricing: {
          tcgplayer: { holofoil: { productId: 765432 } },
        },
      }],
    }),
    "https://product-images.tcgplayer.com/fit-in/1000x1000/765432.jpg",
  );
  assert.equal(
    context.tcgplayerCardImageUrl({
      variants_detailed: [{ thirdParty: { tcgplayer: 123456 } }],
    }),
    "https://product-images.tcgplayer.com/fit-in/1000x1000/123456.jpg",
  );
  assert.doesNotMatch(cardsSource, /cards\.filter\(\(c\) =>\s*\(c\.image/);
});

test("Mew cards with missing catalogue artwork use verified image fallbacks", () => {
  for (const [id, product] of [
    ["miscp-001", "108589"],
    ["cel25-25", "250295"],
    ["sm3.5-40", "146699"],
    ["mep-105", "713288"],
    ["cel25cc-CC013", "250330"],
    ["swsh12.5gg-GG10", "478027"],
    ["swsh11tg-TG30", "284303"],
  ]) {
    assert.match(coreSource, new RegExp(`"${id.replace(".", "\\.")}"[\\s\\S]{0,100}${product}`));
  }
});

test("missing TCG Pocket artwork falls back to the complete card image", () => {
  const context = vm.createContext({
    cardImageOverrides: {},
    isPocketCard() { return true; },
    encodeURIComponent,
  });
  vm.runInContext(cardsSource, context, { filename: "js/cards.js" });
  assert.equal(
    context.cardImageUrl({
      id: "B2a-130",
      localId: "130",
      set: { id: "B2a" },
    }),
    "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2a/B2a_130_EN.png",
  );
  assert.match(coreSource, /"B2a-130"[\s\S]{0,150}B2a_130_EN\.png/);
  assert.match(coreSource, /"B2a-131"[\s\S]{0,150}B2a_131_EN\.png/);
});

test("set and series completion goals are persisted and included in backups", () => {
  for (const id of [
    "completionSeriesSelect",
    "completionSetSelect",
    "completionList",
  ]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1);
  }
  assert.match(coreSource, /trackedSeries: new Set\(saved\.trackedSeries/);
  assert.match(coreSource, /trackedSets: new Set\(saved\.trackedSets/);
  assert.match(collectionSource, /version: 6/);
  assert.match(collectionSource, /counts\.total/);
  assert.match(collectionSource, /completionOwnedBySet/);
});

test("completion counts unique owned cards by set", () => {
  const context = vm.createContext({
    state: {
      cardStates: {
        "base1-1": "owned",
        "base1-2": "owned",
        "base1-3": "wanted",
        "base2-1": "owned",
      },
      cardOwnedVariants: {
        "base1-1": ["normal", "firstEdition"],
        "base1-2": ["holo"],
      },
      completionMode: "set",
      completionSetDetails: new Map(),
    },
    setCode(id) { return id.slice(0, id.lastIndexOf("-")); },
    canonicalPrintVariant(value) { return value; },
  });
  vm.runInContext(collectionSource, context, { filename: "js/collection.js" });
  const counts = context.completionOwnedBySet();
  assert.equal(counts.get("base1").cards, 2);
  assert.equal(counts.get("base1").printings, 3);
  assert.equal(counts.get("base2").cards, 1);
  assert.equal(context.completionSetTotal({
    cardCount: { official: 102, total: 110 },
  }), 110);
});

test("master mode uses all catalogued printings", () => {
  const context = vm.createContext({
    state: {
      completionMode: "master",
      completionSetDetails: new Map(),
    },
  });
  vm.runInContext(collectionSource, context, { filename: "js/collection.js" });
  assert.equal(context.completionSetTotal({
    id: "base1",
    cardCount: {
      total: 102,
      normal: 86,
      holo: 16,
      reverse: 0,
      firstEd: 102,
    },
  }), 204);
});

test("one owned card can record multiple printings", () => {
  const context = vm.createContext({
    state: {
      cardOwnedVariants: {
        "base1-4": ["holo", "firstEdition"],
      },
      cardPrintVariants: { "base1-4": "holo" },
    },
  });
  vm.runInContext(cardsSource, context, { filename: "js/cards.js" });
  const variants = context.ownedPrintVariants({
    id: "base1-4",
    variants: {
      normal: false,
      holo: true,
      reverse: false,
      firstEdition: true,
    },
  });
  assert.deepEqual([...variants], ["holo", "firstEdition"]);
});

function loadCardCurrency({
  language = "da",
  valuationCurrency = "dkk",
  cachedRates = null,
} = {}) {
  const context = vm.createContext({
    state: { settings: { language, valuationCurrency } },
    localStorage: {
      getItem() { return cachedRates ? JSON.stringify(cachedRates) : null; },
      setItem() {},
    },
  });
  vm.runInContext(cardsSource, context, { filename: "js/cards.js" });
  return context;
}

test("collection values can display in Danish kroner while preserving market currencies", () => {
  const cards = loadCardCurrency();
  assert.match(cards.collectionValueMoney(10, "EUR"), /74,75/);
  assert.match(cards.collectionValueMoney(10, "USD"), /66,85/);
  const detailPrices = cards.priceSummary({
    cardmarket: { unit: "EUR", trend: 10 },
    tcgplayer: { unit: "USD", holofoil: { marketPrice: 10 } },
  });
  assert.match(detailPrices[0].value, /74,75/);
  assert.match(detailPrices[1].value, /66,85/);

  cards.state.settings.valuationCurrency = "market";
  assert.match(cards.collectionValueMoney(10, "EUR"), /10,00/);
  assert.match(cards.collectionValueMoney(10, "USD"), /10,00/);
});

test("collection currency uses a valid cached ECB rate and rejects invalid rates", () => {
  const cached = loadCardCurrency({
    cachedRates: {
      date: "2026-10-13",
      fetchedAt: Date.now(),
      eurDkk: 7.5,
      eurUsd: 1.25,
    },
  });
  assert.match(cached.collectionValueMoney(10, "EUR"), /75,00/);
  assert.match(cached.collectionValueMoney(10, "USD"), /60,00/);

  const invalid = loadCardCurrency({
    cachedRates: {
      date: "2026-10-13",
      fetchedAt: Date.now(),
      eurDkk: 750,
      eurUsd: 0,
    },
  });
  assert.match(invalid.collectionValueMoney(10, "EUR"), /74,75/);
});

test("currency preference is sanitized across local, backup, and sync paths", () => {
  assert.match(coreSource, /normalizeValuationCurrency\(value\)/);
  assert.match(coreSource, /saved\.settings\?\.valuationCurrency/);
  assert.match(collectionSource, /state\.settings\.valuationCurrency = normalizeValuationCurrency/);
  assert.doesNotMatch(syncSource, /valuationCurrency: normalizeValuationCurrency/);
  assert.match(syncSource, /settings: state\.settings/);
});

function loadTrade(overrides = {}) {
  const storage = new Map();
  const context = vm.createContext({
    console,
    state: {
      settings: { language: "en" },
      collectionCards: [],
      cardStates: {},
      cardCounts: {},
      cardOwnedVariants: {},
      cardPrintVariants: {},
      ...overrides,
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
    document: {
      querySelector() { return null; },
      createElement() { return { click() {} }; },
    },
    syncRandomId(prefix) { return `${prefix}_test`; },
    collectorDisplayName() { return "Alex"; },
    escapeHtml(value) { return String(value); },
    URL,
    Blob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa,
    atob,
    setTimeout,
  });
  vm.runInContext(qrSource, context, { filename: "js/qr.js" });
  vm.runInContext(tradeSource, context, { filename: "js/trade.js" });
  return context;
}

test("Trade Binder and local trade-offer contracts are present", () => {
  for (const id of [
    "tradeBinderTitle",
    "tradeCollectorName",
    "tradeShareScope",
    "tradeShareCode",
    "tradeExportShare",
    "tradeImportShare",
    "tradeImportCode",
    "tradeImportCodeButton",
    "tradeShareDialog",
    "tradeInspector",
    "tradeOutgoing",
    "tradeOfferInspector",
  ]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1);
  }
  assert.match(tradeSource, /cardedex-trade-binder\/v1/);
  assert.match(tradeSource, /cardedex-trade-proposal\/v1/);
  assert.match(tradeSource, /sanitizeTradeProposal/);
  assert.match(tradeSource, /navigator\.share/);
  assert.match(tradeSource, /hydrateTradeCardArtwork/);
  assert.match(tradeSource, /cardImageUrl\(candidate, "low"\)/);
  assert.match(tradeSource, /tradeRemoteVisible = 36/);
  assert.match(tradeSource, /data-trade-more/);
  assert.match(tradeSource, /class="trade-card-grid"/);
  assert.match(tradeSource, /data-show-offer-qr/);
  assert.match(html, /<script src="js\/qr\.js\?v=84"><\/script>\s*<script src="js\/trade\.js\?v=84"><\/script>/);
  assert.match(tradeSource, /CDX1\./);
  assert.match(tradeSource, /#trade\/share\//);
  assert.match(html, /<a href="#trade" id="tradeNav">/);
  assert.match(html, /<section class="trade-page trade-binder" id="trade"/);
  assert.ok(html.indexOf('id="trade"') < html.indexOf('id="collectionDialog"'));
  assert.match(appSource, /function applyPageView\(\)/);
  assert.match(appSource, /hash === "#trade"/);
  assert.match(appSource, /hash\.startsWith\("#trade\/share\/"\)/);
  assert.match(appSource, /consumeTradeShareHash\(\)/);
  assert.doesNotMatch(html, /js\/auth\.js|js\/sync\.js|backend-config|supabase(?:\.min)?\.js/);
});

test("implementation details stay out of the collection and Trade Binder UI", () => {
  assert.doesNotMatch(
    html,
    /Cached for offline use|Imported binders stay read-only|Local collection preview|Local handoff|Local transfer|tradeReadonlyLabel|collectionStorageKicker|collection-intro|backupKicker/,
  );
  assert.doesNotMatch(
    tradeSource,
    /read-only collection|read-only preview|collectionPreview|tradeReadonlyLabel/,
  );
  assert.doesNotMatch(cardsSource, /t\("offline"\)/);
  assert.match(cardsSource, /state\.advancedLoaded \? "" : `<button id="advancedFilters"/);
  assert.match(coreSource, /indexedDB\.open\("cardedex-cache", 1\)/);
  assert.match(coreSource, /const cached = cache \? await cacheRead\(url\) : null/);
});

test("QR transport is offer-only and enforces its byte capacity", () => {
  const context = vm.createContext({ TextEncoder, Uint8Array });
  vm.runInContext(qrSource, context, { filename: "js/qr.js" });
  assert.equal(context.CardedexQr.MAX_BYTES, 213);
  const encoded = context.CardedexQr.encode("CDX1.TEST");
  assert.equal(encoded.version, 1);
  assert.equal(encoded.matrix.length, 21);
  assert.match(context.CardedexQr.toSvg("CDX1.TEST"), /^<svg/);
  assert.throws(() => context.CardedexQr.encode("A".repeat(214)), /qr-capacity/);
  const binderRenderer = tradeSource.slice(
    tradeSource.indexOf("function renderOutgoingTradeBinder"),
    tradeSource.indexOf("function renderTradeOffer"),
  );
  assert.doesNotMatch(binderRenderer, /data-show-offer-qr|CardedexQr/);
});

test("trade import strings compactly round-trip binders and offers", () => {
  const trade = loadTrade();
  const binder = {
    schema: "cardedex-trade-binder/v1",
    shareId: "share-link",
    createdAt: "2026-10-14T12:00:00.000Z",
    expiresAt: "2026-10-21T12:00:00.000Z",
    owner: { displayName: "Alex Ø" },
    scope: "duplicates",
    collection: {
      owned: [{ id: "base1-4", name: "Charizard", quantity: 2 }],
      wanted: [{ id: "base1-58", name: "Pikachu" }],
    },
  };
  const binderCode = trade.encodeTradeShareCode(binder);
  assert.match(binderCode, /^CDX1\./);
  assert.doesNotMatch(binderCode, /https?:/);
  assert.ok(binderCode.length < JSON.stringify(binder).length);
  const decodedBinder = trade.decodeTradeShareCode(`https://example.test/#trade/share/${binderCode}`);
  assert.equal(decodedBinder.schema, binder.schema);
  assert.equal(decodedBinder.owner.displayName, "Alex Ø");
  assert.equal(decodedBinder.scope, "duplicates");
  assert.equal(decodedBinder.collection.owned[0].quantity, 2);
  assert.equal(decodedBinder.collection.wanted[0].id, "base1-58");

  const offer = {
    schema: "cardedex-trade-proposal/v1",
    proposalId: "proposal-link",
    createdAt: "2026-10-14T12:00:00.000Z",
    parties: { owner: "Alex", guest: "Sam" },
    sourceShareId: "share-link",
    cardsFromOwner: [{ id: "base1-4", quantity: 1 }],
    cardsFromGuest: [{ id: "base1-58", quantity: 2 }],
    note: "Meet Saturday",
  };
  const decodedOffer = trade.decodeTradeShareCode(trade.encodeTradeShareCode(offer));
  assert.equal(decodedOffer.schema, offer.schema);
  assert.equal(decodedOffer.parties.guest, "Sam");
  assert.equal(decodedOffer.cardsFromGuest[0].quantity, 2);
  assert.equal(decodedOffer.note, "Meet Saturday");
  assert.equal(trade.tradeOfferQrData(offer).available, true);
  assert.equal(trade.tradeOfferQrData({ ...offer, note: "x".repeat(240) }).available, false);
});

test("Trade Binder comparison finds wanted cards on both sides", () => {
  const trade = loadTrade();
  const comparison = trade.compareTradeCollections(
    {
      owned: [{ id: "base1-1", quantity: 2 }, { id: "base1-2", quantity: 1 }],
      wanted: [{ id: "base1-3" }],
    },
    {
      owned: [{ id: "base1-3", quantity: 1 }, { id: "base1-4", quantity: 1 }],
      wanted: [{ id: "base1-1" }],
    },
  );
  assert.deepEqual([...comparison.receiveWanted].map((card) => card.id), ["base1-3"]);
  assert.deepEqual([...comparison.giveWanted].map((card) => card.id), ["base1-1"]);
  assert.deepEqual([...comparison.receiveMissing].map((card) => card.id), ["base1-3", "base1-4"]);
  assert.deepEqual([...comparison.localDuplicates].map((card) => card.id), ["base1-1"]);
});

test("outgoing Trade Binders use only local collection and profile data", () => {
  const trade = loadTrade({
    collectionCards: [
      { id: "base1-4", name: "Charizard", localId: "4", set: { name: "Base Set" } },
      { id: "base1-58", name: "Pikachu", localId: "58", set: { name: "Base Set" } },
    ],
    cardStates: { "base1-4": "owned", "base1-58": "wanted" },
    cardCounts: { "base1-4": 2 },
    cardOwnedVariants: { "base1-4": ["holo"] },
  });
  trade.saveTradeProfile("Alex");
  const snapshot = trade.createTradeBinderSnapshot("all", 7, true);
  assert.equal(snapshot.schema, "cardedex-trade-binder/v1");
  assert.equal(snapshot.owner.displayName, "Alex");
  assert.equal(snapshot.collection.owned[0].quantity, 2);
  assert.equal("printings" in snapshot.collection.owned[0], false);
  assert.equal("image" in snapshot.collection.owned[0], false);
  assert.equal(snapshot.collection.wanted[0].id, "base1-58");
});

test("Trade Binder import codes can be shared without opening the preview", async () => {
  const trade = loadTrade({
    collectionCards: [
      { id: "base1-4", name: "Charizard", localId: "4", set: { name: "Base Set" } },
    ],
    cardStates: { "base1-4": "owned" },
    cardCounts: { "base1-4": 2 },
  });
  const controls = {
    "#tradeShareScope": { value: "all" },
    "#tradeShareExpiry": { value: "7" },
    "#tradeIncludeWishlist": { checked: true },
  };
  const queries = [];
  let copied = "";
  trade.document.querySelector = (selector) => {
    queries.push(selector);
    return controls[selector] || null;
  };
  trade.navigator = { clipboard: { async writeText(value) { copied = value; } } };

  await trade.shareCurrentTradeBinder();

  assert.match(copied, /^CDX1\./);
  const shared = trade.decodeTradeShareCode(copied);
  assert.equal(shared.collection.owned[0].id, "base1-4");
  assert.equal(shared.collection.owned[0].quantity, 2);
  assert.equal(queries.includes("#tradeOutgoing"), false);
});
test("Trade Binder import sanitizes records and rejects expired snapshots", () => {
  const trade = loadTrade();
  const clean = trade.sanitizeTradeBinder({
    schema: "cardedex-trade-binder/v1",
    shareId: "share-safe",
    createdAt: "2026-10-01T10:00:00Z",
    owner: { displayName: "Another collector" },
    collection: {
      owned: [{ id: "base1-4", name: "Charizard", quantity: 9999 }],
      wanted: [{ id: "base1-58", name: "Pikachu" }],
    },
  });
  assert.equal(clean.collection.owned[0].quantity, 999);
  assert.equal(clean.collection.wanted[0].id, "base1-58");
  assert.throws(() => trade.sanitizeTradeBinder({
    schema: "cardedex-trade-binder/v1",
    shareId: "expired",
    expiresAt: "2020-01-01T00:00:00Z",
    collection: { owned: [], wanted: [] },
  }), /expired/);
});

test("trade offers are sanitized and remain non-mutating drafts", () => {
  const trade = loadTrade();
  const offer = trade.sanitizeTradeProposal({
    schema: "cardedex-trade-proposal/v1",
    proposalId: "proposal-safe",
    createdAt: "2026-10-14T12:00:00Z",
    status: "accepted",
    parties: { owner: "Alex", guest: "Sam" },
    cardsFromOwner: [{ id: "base1-4", name: "Charizard", quantity: 9999 }],
    cardsFromGuest: [{ id: "base1-58", name: "Pikachu", quantity: 1 }],
  });
  assert.equal(offer.status, "draft");
  assert.equal(offer.cardsFromOwner[0].quantity, 999);
  assert.equal("printings" in offer.cardsFromOwner[0], false);
  assert.equal(offer.cardsFromGuest[0].id, "base1-58");
  assert.throws(() => trade.sanitizeTradeProposal({
    schema: "cardedex-trade-proposal/v1",
    proposalId: "empty",
    parties: {},
    cardsFromOwner: [],
    cardsFromGuest: [],
  }), /cards/);
});

test("completed physical trades reconcile one chosen side atomically", () => {
  const trade = loadTrade();
  const collection = {
    cardStates: { "base1-4": "owned", "base1-58": "wanted" },
    cardCounts: { "base1-4": 2 },
    cardPrintVariants: { "base1-4": "holo" },
    cardOwnedVariants: { "base1-4": ["holo"] },
  };
  const offer = trade.sanitizeTradeProposal({
    schema: "cardedex-trade-proposal/v1",
    proposalId: "trade-atomic",
    parties: { owner: "Alex", guest: "Sam" },
    cardsFromOwner: [{ id: "base1-4", name: "Charizard", quantity: 2 }],
    cardsFromGuest: [{ id: "base1-58", name: "Pikachu", quantity: 3 }],
  });
  const plan = trade.buildTradeReconciliation(offer, "owner", collection, new Set());
  assert.equal(plan.errors.length, 0);
  assert.deepEqual([...plan.changes].map((change) => [change.id, change.before, change.after]), [
    ["base1-4", 2, 0],
    ["base1-58", 0, 3],
  ]);
  trade.applyTradeReconciliation(plan, collection);
  assert.equal("base1-4" in collection.cardStates, false);
  assert.equal("base1-4" in collection.cardCounts, false);
  assert.equal("base1-4" in collection.cardPrintVariants, false);
  assert.equal("base1-4" in collection.cardOwnedVariants, false);
  assert.equal(collection.cardStates["base1-58"], "owned");
  assert.equal(collection.cardCounts["base1-58"], 3);

  const guestCollection = {
    cardStates: { "base1-58": "owned", "base1-4": "wanted" },
    cardCounts: { "base1-58": 3 },
    cardPrintVariants: {},
    cardOwnedVariants: {},
  };
  const guestPlan = trade.buildTradeReconciliation(offer, "guest", guestCollection, new Set());
  trade.applyTradeReconciliation(guestPlan, guestCollection);
  assert.equal("base1-58" in guestCollection.cardStates, false);
  assert.equal(guestCollection.cardStates["base1-4"], "owned");
  assert.equal(guestCollection.cardCounts["base1-4"], 2);
});

test("trade reconciliation blocks stale quantities and repeated application", () => {
  const trade = loadTrade();
  const collection = {
    cardStates: { "base1-4": "owned" },
    cardCounts: { "base1-4": 1 },
    cardPrintVariants: {},
    cardOwnedVariants: {},
  };
  const offer = trade.sanitizeTradeProposal({
    schema: "cardedex-trade-proposal/v1",
    proposalId: "trade-stale",
    parties: { owner: "Alex", guest: "Sam" },
    cardsFromOwner: [{ id: "base1-4", name: "Charizard", quantity: 2 }],
    cardsFromGuest: [],
  });
  const stale = trade.buildTradeReconciliation(offer, "owner", collection, new Set());
  assert.equal(stale.errors.length, 1);
  assert.throws(() => trade.applyTradeReconciliation(stale, collection), /invalid-plan/);
  const repeated = trade.buildTradeReconciliation(offer, "owner", collection, new Set(["trade-stale"]));
  assert.equal(repeated.alreadyApplied, true);
  assert.throws(() => trade.applyTradeReconciliation(repeated, collection), /invalid-plan/);
});
