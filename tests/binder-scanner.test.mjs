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
const syncSource = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const tradeSource = fs.readFileSync(path.join(root, "js/trade.js"), "utf8");
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
    setTimeout,
  });
  vm.runInContext(tradeSource, context, { filename: "js/trade.js" });
  return context;
}

test("Trade Binder controls and read-only import contract are present", () => {
  for (const id of [
    "tradeBinderTitle",
    "tradeShareScope",
    "tradeExportShare",
    "tradeImportShare",
    "tradeInspector",
  ]) {
    assert.equal((html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1);
  }
  assert.match(tradeSource, /cardedex-trade-binder\/v1/);
  assert.match(syncSource, /cardedex-user-data/);
  assert.match(syncSource, /server sync is not connected/);
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
