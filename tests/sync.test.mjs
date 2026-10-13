import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const syncSource = fs.readFileSync(path.join(root, "js/sync.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "js/auth.js"), "utf8");
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
    state: { settings: { language: "en" } },
    document: {
      querySelector: () => null,
      addEventListener() {},
      createElement: () => ({ click() {} }),
      visibilityState: "visible",
    },
    collectionDialog: null,
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
    t(value) { return value; },
  });
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

test("email flow creates new accounts and signs existing emails into the same identity", () => {
  assert.match(authSource, /shouldCreateUser: true/);
  assert.match(authSource, /verifyOtp/);
  assert.doesNotMatch(authSource, /flowType: "pkce"/);
  assert.doesNotMatch(authSource, /invite-collector|app_admins|accountInvite/);
  assert.match(html, /Enter your email to create an account or sign in on this device/);
  assert.match(html, /Continue with email/);
  assert.doesNotMatch(html, /accountInvitePanel|Invite a collector/);
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
