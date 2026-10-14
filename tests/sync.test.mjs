import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const syncSource = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "js/auth.js"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "js/core.js"), "utf8");
const cardsSource = fs.readFileSync(path.join(root, "js/cards.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const collectionSource = fs.readFileSync(path.join(root, "js/collection.js"), "utf8");
const accountSql = fs.readFileSync(
  path.join(root, "backend/supabase-account-sync.sql"),
  "utf8",
);
const accountMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261011220000_account_sync.sql"),
  "utf8",
);
const rollbackSql = fs.readFileSync(
  path.join(root, "rollback/20261013_restore_v54_compatibility.sql"),
  "utf8",
);

function loadSync(options = {}) {
  const storage = options.storage || new Map();
  const db = { objectStoreNames: { contains: () => true } };
  const indexedDB = options.indexedDB || {
    open() {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  const context = vm.createContext({
    console,
    Blob,
    URL,
    Set,
    Date,
    Intl,
    JSON,
    Math,
    Promise,
    structuredClone,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval() {},
    indexedDB,
    navigator: { onLine: true },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    state: options.state || { settings: { language: "en" } },
    document: {
      querySelector: () => null,
      addEventListener() {},
      createElement: () => ({ click() {} }),
      visibilityState: "visible",
    },
    collectionDialog: options.collectionDialog || null,
    showCollection: options.showCollection,
    escapeHtml: (value) => String(value),
    crypto: { randomUUID: () => "test-id" },
    addEventListener() {},
  });
  context.globalThis = context;
  vm.runInContext(syncSource, context, { filename: "js/sync.js" });
  context.testStorage = storage;
  return context;
}

function createFakeIndexedDb() {
  const stores = {
    snapshots: new Map(),
    operations: new Map(),
    bases: new Map(),
  };
  function requestWith(value) {
    const request = {};
    queueMicrotask(() => {
      request.result = value;
      request.onsuccess?.();
    });
    return request;
  }
  const db = {
    objectStoreNames: { contains(name) { return name in stores; } },
    close() {},
    transaction(names) {
      const tx = {
        objectStore(name) {
          const store = stores[name];
          return {
            put(value, key = value.operationId || value.accountUserId) {
              store.set(key, structuredClone(value));
            },
            get(key) { return requestWith(structuredClone(store.get(key))); },
            getAll() {
              return requestWith([...store.values()].map((value) => structuredClone(value)));
            },
            delete(key) { store.delete(key); },
          };
        },
      };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };
  return {
    stores,
    indexedDB: {
      open() {
        const request = { result: db };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
  };
}

function evaluate(context, source) {
  return vm.runInContext(source, context);
}

function loadCollectionBackup() {
  let exportedBlob = null;
  const anchor = { href: "", download: "", clicked: false, click() { this.clicked = true; } };
  const context = vm.createContext({
    console,
    Blob,
    Date,
    JSON,
    Map,
    Set,
    Promise,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
    encodeURIComponent,
    setTimeout(callback) { callback(); },
    URL: {
      createObjectURL(blob) { exportedBlob = blob; return "blob:test"; },
      revokeObjectURL() {},
    },
    document: { createElement() { return anchor; }, querySelector() { return null; } },
    state: {
      favorites: new Set([25]),
      cardStates: { "base1-1": "owned", "base1-2": "wanted" },
      cardCounts: { "base1-1": 3 },
      cardPrintVariants: { "base1-1": "holo" },
      cardOwnedVariants: { "base1-1": ["holo", "firstEdition"] },
      trackedSeries: new Set(["base"]),
      trackedSets: new Set(["base1"]),
      completionMode: "master",
      settings: { language: "da", dark: true, valuationCurrency: "dkk" },
      collectionCards: [],
      collectionFilters: {},
      completionSetDetails: new Map(),
    },
    syncProfile: { displayName: "Collector", revision: 12 },
    normalizeValuationCurrency(value) { return ["market", "dkk"].includes(value) ? value : "market"; },
    saveUser() { context.saved = true; },
    applySettings() { context.settingsApplied = true; },
    renderPokemon() { context.pokemonRendered = true; },
    alert() { context.alerted = true; },
    escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[character]);
    },
    t(value) { return value; },
  });
  context.navigator = {
    clipboard: {
      async writeText(value) { context.copiedText = value; },
    },
  };
  vm.runInContext(collectionSource, context, { filename: "js/collection.js" });
  vm.runInContext("showCollection = () => { importRendered = true; }", context);
  return { context, anchor, exportedBlob: () => exportedBlob };
}

test("sync v7 excludes device presentation settings", () => {
  const sync = loadSync();
  const snapshot = evaluate(sync, `normalizeSyncSnapshot({
    settings: { language: "da", dark: true },
    favorites: [25],
    cardStates: { "base1-1": "owned" }
  })`);
  assert.equal(snapshot.version, 7);
  assert.equal("settings" in snapshot, false);
  assert.deepEqual([...snapshot.favorites], [25]);
});

test("sync v7 removes orphaned card properties during normalization", () => {
  const sync = loadSync();
  const snapshot = evaluate(sync, `normalizeSyncSnapshot({
    cardStates: { wanted: "wanted", owned: "owned" },
    cardCounts: { missing: 9, wanted: 4 },
    cardPrintVariants: { wanted: "reverse", missing: "holo" },
    cardOwnedVariants: { wanted: ["reverse"], missing: ["holo"] }
  })`);
  assert.deepEqual({ ...snapshot.cardCounts }, { owned: 1 });
  assert.deepEqual({ ...snapshot.cardPrintVariants }, {});
  assert.deepEqual({ ...snapshot.cardOwnedVariants }, {});
});

test("device-only settings do not create a collection change", () => {
  const sync = loadSync();
  const changed = evaluate(sync, `syncCollectionChanged(
    {
      settings: { language: "en", dark: false },
      cardStates: { "base1-1": "owned" },
      cardCounts: { "base1-1": 1 }
    },
    {
      settings: { language: "da", dark: true },
      cardStates: { "base1-1": "owned" },
      cardCounts: { "base1-1": 1 }
    }
  )`);
  assert.equal(changed, false);
});

test("removing a card, including the final card, is a collection change", () => {
  const sync = loadSync();
  const changed = evaluate(sync, `syncCollectionChanged(
    {
      cardStates: { "base1-1": "owned" },
      cardCounts: { "base1-1": 1 }
    },
    { cardStates: {}, cardCounts: {} }
  )`);
  assert.equal(changed, true);
});

test("a remote deletion replaces the open PC collection without uploading stale data", async () => {
  const storage = new Map();
  const fakeDb = createFakeIndexedDb();
  const original = {
    version: 7,
    favorites: [],
    cardStates: { "base1-1": "owned" },
    cardCounts: { "base1-1": 1 },
    cardPrintVariants: {},
    cardOwnedVariants: {},
    trackedSeries: [],
    trackedSets: [],
    completionMode: "set",
  };
  storage.set("cardedex-sync-profile", JSON.stringify({
    profileId: "pc-profile",
    deviceId: "pc-device",
    accountUserId: "account-a",
    revision: 1,
    serverRevision: 1,
  }));
  storage.set("cardedex-user", JSON.stringify({ ...original, version: 6 }));
  fakeDb.stores.bases.set("account-a", {
    accountUserId: "account-a",
    revision: 1,
    snapshot: original,
  });
  let collectionRenders = 0;
  const state = {
    settings: { language: "en" },
    favorites: new Set(),
    cardStates: { "base1-1": "owned" },
    cardCounts: { "base1-1": 1 },
    cardPrintVariants: {},
    cardOwnedVariants: {},
    trackedSeries: new Set(),
    trackedSets: new Set(),
    completionMode: "set",
  };
  const sync = loadSync({
    storage,
    indexedDB: fakeDb.indexedDB,
    state,
    collectionDialog: { open: true },
    showCollection() { collectionRenders += 1; },
  });
  sync.cardedexAccount = {
    client: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async single() {
            return {
              data: {
                id: "collection-a",
                revision: 2,
                snapshot: { ...original, cardStates: {}, cardCounts: {} },
              },
              error: null,
            };
          },
        };
      },
    },
  };

  await evaluate(sync, `handleSyncAccountChange({ id: "account-a" })`);
  assert.deepEqual({ ...state.cardStates }, {});
  assert.deepEqual(JSON.parse(storage.get("cardedex-user")).cardStates, {});
  assert.equal(fakeDb.stores.operations.size, 0);
  assert.equal(collectionRenders, 1);
});

test("local saves do not queue backend synchronization", () => {
  assert.doesNotMatch(coreSource, /queueCollectionSync|syncCollectionChanged/);
  assert.match(cardsSource, /if \(collectionChanged\) saveUser\(\);/);
});

test("version-6 backup export and restore preserves collection fields and settings", async () => {
  const backup = loadCollectionBackup();
  backup.context.exportCollection();
  assert.equal(backup.anchor.clicked, true);
  assert.equal(backup.anchor.download, "cardedex-collection-backup.json");
  const exported = JSON.parse(await backup.exportedBlob().text());
  assert.equal(exported.version, 6);
  assert.equal(exported.cardCounts["base1-1"], 3);
  assert.deepEqual(exported.cardOwnedVariants["base1-1"], ["holo", "firstEdition"]);
  assert.deepEqual(exported.trackedSeries, ["base"]);
  assert.deepEqual(exported.trackedSets, ["base1"]);
  assert.equal(exported.completionMode, "master");
  assert.equal(exported.settings.language, "da");

  backup.context.state.favorites = new Set();
  backup.context.state.cardStates = {};
  backup.context.state.cardCounts = {};
  backup.context.state.cardPrintVariants = {};
  backup.context.state.cardOwnedVariants = {};
  backup.context.state.trackedSeries = new Set();
  backup.context.state.trackedSets = new Set();
  backup.context.state.completionMode = "set";
  backup.context.state.settings = { language: "en", valuationCurrency: "market" };
  await backup.context.importCollection({ text: async () => JSON.stringify(exported) });

  assert.deepEqual([...backup.context.state.favorites], [25]);
  assert.equal(backup.context.state.cardStates["base1-1"], "owned");
  assert.equal(backup.context.state.cardCounts["base1-1"], 3);
  assert.deepEqual(
    [...backup.context.state.cardOwnedVariants["base1-1"]],
    ["holo", "firstEdition"],
  );
  assert.deepEqual([...backup.context.state.trackedSeries], ["base"]);
  assert.deepEqual([...backup.context.state.trackedSets], ["base1"]);
  assert.equal(backup.context.state.completionMode, "master");
  assert.equal(backup.context.state.settings.language, "da");
  assert.equal(backup.context.saved, true);
  assert.equal(backup.context.settingsApplied, true);
  assert.equal(backup.context.pokemonRendered, true);
  assert.equal(backup.context.importRendered, true);
  assert.equal(backup.context.alerted, undefined);
});

test("CDXC1 collection strings round-trip the complete version-6 backup", async () => {
  const backup = loadCollectionBackup();
  const importString = backup.context.encodeCollectionImportString();

  assert.match(importString, /^CDXC1\./);
  assert.doesNotMatch(importString, /https?:\/\//);
  const decoded = backup.context.decodeCollectionImportString(importString);
  assert.equal(decoded.version, 6);
  assert.equal(decoded.cardCounts["base1-1"], 3);
  assert.deepEqual(
    [...decoded.cardOwnedVariants["base1-1"]],
    ["holo", "firstEdition"],
  );
  assert.equal(decoded.settings.language, "da");

  backup.context.state.favorites = new Set();
  backup.context.state.cardStates = {};
  backup.context.state.cardCounts = {};
  backup.context.state.cardPrintVariants = {};
  backup.context.state.cardOwnedVariants = {};
  backup.context.state.trackedSeries = new Set();
  backup.context.state.trackedSets = new Set();
  backup.context.state.completionMode = "set";
  backup.context.state.settings = { language: "en", valuationCurrency: "market" };

  assert.equal(backup.context.importCollectionString(importString), true);
  assert.equal(backup.context.state.cardStates["base1-1"], "owned");
  assert.equal(backup.context.state.cardCounts["base1-1"], 3);
  assert.deepEqual(
    [...backup.context.state.cardOwnedVariants["base1-1"]],
    ["holo", "firstEdition"],
  );
  assert.deepEqual([...backup.context.state.trackedSeries], ["base"]);
  assert.deepEqual([...backup.context.state.trackedSets], ["base1"]);
  assert.equal(backup.context.state.completionMode, "master");
  assert.equal(backup.context.state.settings.language, "da");
  assert.equal(backup.context.alerted, undefined);

  assert.equal(backup.context.importCollectionString("CDX1.not-a-collection"), false);
  assert.equal(backup.context.alerted, true);
});

test("completion entries show set artwork and accessible owned-card progress", () => {
  const backup = loadCollectionBackup();
  backup.context.state.completionMode = "set";
  const owned = new Map([["base1", { cards: 25, printings: 30 }]]);
  const markup = backup.context.completionProgressItem("set", {
    id: "base1",
    name: "Base Set",
    logo: "https://assets.tcgdex.net/en/base/base1/logo",
    cardCount: { total: 100 },
  }, owned);

  assert.match(markup, /class="completion-artwork/);
  assert.match(markup, /assets\.tcgdex\.net\/en\/base\/base1\/logo\.webp/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /aria-valuenow="25"/);
  assert.match(markup, /style="width:25%"/);

  backup.context.state.cardSets = [
    { id: "base1", name: "Base Set", seriesId: "base", setOrder: 0, logo: "https://assets.tcgdex.net/en/base/base1/logo", cardCount: { total: 100 } },
    { id: "base2", name: "Jungle", seriesId: "base", setOrder: 1, logo: "https://assets.tcgdex.net/en/base/base2/logo", cardCount: { total: 50 } },
  ];
  const seriesMarkup = backup.context.completionProgressItem(
    "series",
    { id: "base", name: "Base" },
    owned,
  );
  assert.match(seriesMarkup, /completion-artwork-collage/);
  assert.match(seriesMarkup, /base1\/logo\.webp/);
  assert.match(seriesMarkup, /base2\/logo\.webp/);

  assert.equal(
    backup.context.completionAssetUrl("https://assets.tcgdex.net/en/base/base1/logo.png"),
    "https://assets.tcgdex.net/en/base/base1/logo.png",
  );
  assert.equal(
    backup.context.completionAssetUrl("https://assets.tcgdex.net/en/base/base1/logo?cache=1"),
    "https://assets.tcgdex.net/en/base/base1/logo.webp?cache=1",
  );

  const unsafeMarkup = backup.context.completionProgressItem("set", {
    id: "unsafe",
    name: "Unsafe Set",
    logo: "javascript:alert(1)",
    cardCount: { total: 1 },
  }, new Map());
  assert.doesNotMatch(unsafeMarkup, /javascript:/);
});

test("offline operation journal survives a simulated browser restart", async () => {
  const storage = new Map();
  const fakeDb = createFakeIndexedDb();
  const first = loadSync({ storage, indexedDB: fakeDb.indexedDB });
  evaluate(first, `queueCollectionSync({
    cardStates: { "base1-4": "owned" },
    cardCounts: { "base1-4": 2 },
    trackedSets: ["base1"]
  })`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    fakeDb.stores.operations.size,
    1,
    JSON.stringify(evaluate(first, "remoteSync.memoryOperation")),
  );

  const reopened = loadSync({ storage, indexedDB: fakeDb.indexedDB });
  const operations = await evaluate(reopened, "pendingSyncOperations(null)");
  assert.equal(operations.length, 1);
  assert.equal(operations[0].snapshot.cardStates["base1-4"], "owned");
  assert.equal(operations[0].snapshot.cardCounts["base1-4"], 2);
  assert.deepEqual([...operations[0].snapshot.trackedSets], ["base1"]);
});

test("queued operations stay scoped to their signed-in account", () => {
  const sync = loadSync();
  const scoped = evaluate(sync, `(() => {
    syncProfile.accountUserId = "account-a";
    return {
      a: operationBelongsToAccount({ profileId: syncProfile.profileId, accountUserId: "account-a" }, "account-a"),
      b: operationBelongsToAccount({ profileId: syncProfile.profileId, accountUserId: "account-a" }, "account-b"),
      otherProfile: operationBelongsToAccount({ profileId: "different", accountUserId: "account-a" }, "account-a")
    };
  })()`);
  assert.deepEqual({ ...scoped }, { a: true, b: false, otherProfile: false });
});

test("acknowledging an upload leaves edits queued during the request", async () => {
  const fakeDb = createFakeIndexedDb();
  const sync = loadSync({ indexedDB: fakeDb.indexedDB });
  const profileId = evaluate(sync, "syncProfile.profileId");
  fakeDb.stores.operations.set("sent", {
    operationId: "sent",
    profileId,
    accountUserId: "account-a",
    revision: 1,
  });
  fakeDb.stores.operations.set("new-edit", {
    operationId: "new-edit",
    profileId,
    accountUserId: "account-a",
    revision: 2,
  });

  await evaluate(sync, `deleteSyncOperations(["sent"])`);
  assert.equal(fakeDb.stores.operations.has("sent"), false);
  assert.equal(fakeDb.stores.operations.has("new-edit"), true);
});

test("three-way sync combines non-overlapping device changes", () => {
  const sync = loadSync();
  const merge = evaluate(sync, `buildSyncMerge(
    { cardStates: {}, cardCounts: {} },
    { cardStates: { "base1-1": "owned" }, cardCounts: {} },
    { cardStates: { "base1-2": "owned" }, cardCounts: { "base1-2": 2 } }
  )`);
  assert.equal(merge.conflicts.length, 0);
  assert.equal(merge.merged.cardStates["base1-1"], "owned");
  assert.equal(merge.merged.cardCounts["base1-2"], 2);
});

test("three-way sync resolves all properties of a card atomically", () => {
  const sync = loadSync();
  const merge = evaluate(sync, `buildSyncMerge(
    { cardStates: { "base1-1": "owned" }, cardCounts: { "base1-1": 1 } },
    { cardStates: { "base1-1": "owned" }, cardCounts: { "base1-1": 2 } },
    { cardStates: { "base1-1": "owned" }, cardCounts: { "base1-1": 3 } }
  )`);
  assert.equal(merge.conflicts.length, 1);
  assert.equal(merge.conflicts[0].field, "cardRecord");
  assert.equal(merge.conflicts[0].local.count, 2);
  assert.equal(merge.conflicts[0].remote.count, 3);
});

test("removal versus quantity edit cannot create an orphaned card count", () => {
  const sync = loadSync();
  const merge = evaluate(sync, `buildSyncMerge(
    { cardStates: { "base1-1": "owned" }, cardCounts: { "base1-1": 1 } },
    { cardStates: {}, cardCounts: {} },
    { cardStates: { "base1-1": "owned" }, cardCounts: { "base1-1": 2 } }
  )`);
  assert.equal(merge.conflicts.length, 1);
  assert.equal(merge.conflicts[0].field, "cardRecord");
  assert.equal(merge.conflicts[0].local, undefined);
  const resolved = evaluate(sync, `(() => {
    const snapshot = ${JSON.stringify(merge.merged)};
    applySyncCardRecord(snapshot, "base1-1", undefined);
    return snapshot;
  })()`);
  assert.equal(resolved.cardStates["base1-1"], undefined);
  assert.equal(resolved.cardCounts["base1-1"], undefined);
});

test("upload completion acknowledges captured operations rather than clearing the journal", () => {
  assert.match(syncSource, /operations\.slice\(0, operationIndex \+ 1\)/);
  assert.match(syncSource, /deleteSyncOperations\(sentIds\)/);
  assert.doesNotMatch(syncSource, /objectStore\("operations"\)\.clear/);
});

test("a response-loss retry resubmits the exact in-flight operation first", () => {
  const sync = loadSync();
  const batch = evaluate(sync, `(() => {
    remoteSync.retryOperationId = "op-2";
    return selectSyncUploadBatch([
      { operationId: "op-1" },
      { operationId: "op-2" },
      { operationId: "op-3" }
    ]);
  })()`);
  assert.equal(batch.operation.operationId, "op-2");
  assert.deepEqual([...batch.sentIds], ["op-1", "op-2"]);
  assert.match(syncSource, /remoteSync\.ready && remoteSync\.retryOperationId/);
});

test("permanent backend contract errors do not enter the network retry loop", () => {
  const sync = loadSync();
  assert.equal(evaluate(sync, `transientSyncError({code:"PGRST202"})`), false);
  assert.equal(evaluate(sync, `transientSyncError({message:"Failed to fetch"})`), true);
});

test("browser runtime is disconnected from accounts and database synchronization", () => {
  assert.doesNotMatch(html, /supabase(?:\.min)?\.js|js\/backend-config\.js|js\/auth\.js|js\/sync\.js/);
  assert.doesNotMatch(html, /accountSignIn|accountCodeForm|syncChoice|Continue with email/);
  assert.match(html, /id="tradeCollectorName"/);
});

test("local sharing previews remain phone-friendly and refresh the PWA shell", () => {
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.match(styles, /\.trade-preview-columns \{ grid-template-columns:1fr;/);
  assert.match(styles, /\.artist-status \{ width:min\(340px,100%\);[^}]*text-align:left;/);
  assert.match(styles, /\.artist-status,\.catalog-filter-status\{width:100%;margin:8px 0 20px;/);
  assert.doesNotMatch(styles, /\.catalog-filter-status\{margin-top:-15px\}/);
  assert.match(collectionSource, /function updateMode\(event\)/);
  assert.match(collectionSource, /updateCompletionButtons\(\);\s*\n\}/);
  assert.match(serviceWorker, /cardedex-shell-v84/);
  assert.match(serviceWorker, /\.\/js\/qr\.js\?v=84/);
  assert.doesNotMatch(serviceWorker, /backend-config|js\/auth|js\/sync/);
  for (const asset of [
    "styles.css", "js/core.js", "js/catalog.js", "js/cards.js",
    "js/collection.js", "js/qr.js", "js/trade.js", "js/scanner.js", "app.js",
  ]) {
    assert.match(html, new RegExp(`${asset.replace(".", "\\.")}\\?v=84`));
    assert.match(serviceWorker, new RegExp(`${asset.replace(".", "\\.")}\\?v=84`));
  }
});

test("account bootstrap and synchronization backend contracts stay synchronized", () => {
  assert.equal(accountMigration, accountSql);
  assert.match(accountSql, /insert into public\.profiles/);
  assert.match(accountSql, /insert into public\.collections/);
  assert.match(accountSql, /on conflict \(owner_id\) do nothing/);
  assert.match(accountSql, /security definer/);
  assert.match(accountSql, /Unsupported snapshot version/);
  assert.match(accountSql, /revoke insert, update, delete on public\.collections/);
  assert.doesNotMatch(accountSql, /collector_invitations|app_admins/);
  assert.doesNotMatch(authSource, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("v54 rollback remains non-destructive and accepts transition payloads", () => {
  assert.match(rollbackSql, /not in \('6', '7'\)/);
  assert.match(rollbackSql, /collections_before_v54_rollback/);
  assert.match(rollbackSql, /security definer/);
  assert.doesNotMatch(rollbackSql, /drop\s+(table|schema)/i);
  assert.doesNotMatch(rollbackSql, /truncate/i);
});
