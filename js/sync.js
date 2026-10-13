const CARDEDEX_SYNC_PROFILE_KEY = "cardedex-sync-profile";

function syncRandomId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function readSyncProfile() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CARDEDEX_SYNC_PROFILE_KEY) || "{}",
    );
    return {
      profileId: stored.profileId || syncRandomId("local"),
      displayName: String(stored.displayName || "").slice(0, 40),
      deviceId: stored.deviceId || syncRandomId("device"),
      revision: Math.max(0, Number(stored.revision) || 0),
      serverRevision: Math.max(0, Number(stored.serverRevision) || 0),
      accountUserId: stored.accountUserId || null,
      lastSavedAt: stored.lastSavedAt || null,
      lastSyncedAt: stored.lastSyncedAt || null,
    };
  } catch {
    return {
      profileId: syncRandomId("local"),
      displayName: "",
      deviceId: syncRandomId("device"),
      revision: 0,
      serverRevision: 0,
      accountUserId: null,
      lastSavedAt: null,
      lastSyncedAt: null,
    };
  }
}

const syncProfile = readSyncProfile();
localStorage.setItem(CARDEDEX_SYNC_PROFILE_KEY, JSON.stringify(syncProfile));

const remoteSync = {
  userId: null,
  collectionId: null,
  revision: 0,
  serverSnapshot: {},
  ready: false,
  flushing: false,
  pending: false,
  retrying: false,
  conflict: false,
  retryTimer: null,
};
let syncApplyingRemote = false;

const syncDataDb = new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) return reject(new Error("IndexedDB unavailable"));
  const request = indexedDB.open("cardedex-user-data", 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("snapshots")) {
      db.createObjectStore("snapshots");
    }
    if (!db.objectStoreNames.contains("operations")) {
      db.createObjectStore("operations", { keyPath: "operationId" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function writeSyncProfile() {
  localStorage.setItem(CARDEDEX_SYNC_PROFILE_KEY, JSON.stringify(syncProfile));
}

function currentCollectionSnapshot() {
  try {
    return JSON.parse(localStorage.getItem("cardedex-user") || "{}");
  } catch {
    return {};
  }
}

function syncSnapshotHasData(snapshot = {}) {
  return Boolean(
    (snapshot.favorites || []).length ||
      Object.keys(snapshot.cardStates || {}).length ||
      (snapshot.trackedSeries || []).length ||
      (snapshot.trackedSets || []).length,
  );
}

function normalizeSyncSnapshot(snapshot = {}) {
  const settings = snapshot.settings && typeof snapshot.settings === "object"
    ? snapshot.settings
    : {};
  return {
    version: 6,
    favorites: Array.isArray(snapshot.favorites) ? snapshot.favorites : [],
    cardStates: snapshot.cardStates && typeof snapshot.cardStates === "object"
      ? snapshot.cardStates
      : {},
    cardCounts: snapshot.cardCounts && typeof snapshot.cardCounts === "object"
      ? snapshot.cardCounts
      : {},
    cardPrintVariants:
      snapshot.cardPrintVariants && typeof snapshot.cardPrintVariants === "object"
        ? snapshot.cardPrintVariants
        : {},
    cardOwnedVariants:
      snapshot.cardOwnedVariants && typeof snapshot.cardOwnedVariants === "object"
        ? snapshot.cardOwnedVariants
        : {},
    trackedSeries: Array.isArray(snapshot.trackedSeries)
      ? snapshot.trackedSeries
      : [],
    trackedSets: Array.isArray(snapshot.trackedSets) ? snapshot.trackedSets : [],
    completionMode: snapshot.completionMode === "master" ? "master" : "set",
    settings: {
      ...settings,
      valuationCurrency: normalizeValuationCurrency(
        settings.valuationCurrency,
      ),
    },
  };
}

function applyRemoteSnapshot(snapshot) {
  const clean = normalizeSyncSnapshot(snapshot);
  syncApplyingRemote = true;
  state.favorites = new Set(clean.favorites);
  state.cardStates = clean.cardStates;
  state.cardCounts = clean.cardCounts;
  state.cardPrintVariants = clean.cardPrintVariants;
  state.cardOwnedVariants = clean.cardOwnedVariants;
  state.trackedSeries = new Set(clean.trackedSeries);
  state.trackedSets = new Set(clean.trackedSets);
  state.completionMode = clean.completionMode;
  state.settings = { ...state.settings, ...clean.settings };
  state.settings.valuationCurrency = normalizeValuationCurrency(
    state.settings.valuationCurrency,
  );
  localStorage.setItem("cardedex-user", JSON.stringify(clean));
  syncApplyingRemote = false;
  if (typeof applySettings === "function") applySettings();
  if (typeof renderPokemon === "function") renderPokemon();
  if (collectionDialog?.open && typeof showCollection === "function") {
    showCollection();
  }
}

function syncStatusText() {
  const da = state.settings.language === "da";
  if (remoteSync.conflict) {
    return da
      ? "Synkronisering er sat på pause · vælg en samling nedenfor"
      : "Sync paused · choose a collection below";
  }
  if (remoteSync.flushing) return da ? "Synkroniserer…" : "Syncing…";
  if (remoteSync.retrying) {
    return da
      ? "Gemt lokalt · synkronisering prøver igen, når forbindelsen er klar"
      : "Saved locally · sync will retry when the connection is ready";
  }
  if (remoteSync.pending && remoteSync.ready) {
    return da ? "Gemt lokalt · venter på synkronisering" :
      "Saved locally · waiting to sync";
  }
  if (remoteSync.ready && remoteSync.userId) {
    return da
      ? `Synkroniseret med konto · serverrevision ${remoteSync.revision}`
      : `Synced with account · server revision ${remoteSync.revision}`;
  }
  const when = syncProfile.lastSavedAt
    ? new Intl.DateTimeFormat(da ? "da-DK" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(syncProfile.lastSavedAt))
    : null;
  if (da) {
    return when
      ? `Gemt lokalt kl. ${when} · log ind for at synkronisere`
      : "Gemt lokalt · log ind for at synkronisere";
  }
  return when
    ? `Saved locally at ${when} · sign in to sync`
    : "Saved locally · sign in to sync";
}

function renderSyncStatus() {
  const name = document.querySelector("#collectorName");
  const status = document.querySelector("#syncStatus");
  const dot = document.querySelector("#syncDot");
  if (name && name !== document.activeElement) name.value = syncProfile.displayName;
  if (status) status.textContent = syncStatusText();
  if (dot) {
    dot.classList.toggle("online", remoteSync.ready && !remoteSync.conflict);
    dot.classList.toggle("error", remoteSync.conflict);
  }
}

async function persistLocalSyncSnapshot(snapshot, operation) {
  try {
    const db = await syncDataDb;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["snapshots", "operations"], "readwrite");
      tx.objectStore("snapshots").put({
        schema: "cardedex-collection/v1",
        profileId: syncProfile.profileId,
        deviceId: syncProfile.deviceId,
        revision: syncProfile.revision,
        updatedAt: syncProfile.lastSavedAt,
        data: snapshot,
      }, syncProfile.profileId);
      tx.objectStore("operations").put(operation);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // localStorage remains the compatibility fallback when IndexedDB is unavailable.
  }
}

async function loadLocalSyncSnapshot() {
  try {
    const db = await syncDataDb;
    return await new Promise((resolve, reject) => {
      const request = db.transaction("snapshots").objectStore("snapshots")
        .get(syncProfile.profileId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function pendingSyncOperations() {
  try {
    const db = await syncDataDb;
    return await new Promise((resolve, reject) => {
      const request = db.transaction("operations").objectStore("operations")
        .getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function clearSyncOperations() {
  try {
    const db = await syncDataDb;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite");
      tx.objectStore("operations").clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

const cardedexSyncAdapter = Object.freeze({
  saveSnapshot: persistLocalSyncSnapshot,
  loadSnapshot: loadLocalSyncSnapshot,
});

function queueCollectionSync(snapshot) {
  if (syncApplyingRemote) return;
  const clean = normalizeSyncSnapshot(snapshot);
  syncProfile.revision += 1;
  syncProfile.lastSavedAt = new Date().toISOString();
  writeSyncProfile();
  const operation = {
    operationId: syncRandomId("op"),
    profileId: syncProfile.profileId,
    deviceId: syncProfile.deviceId,
    revision: syncProfile.revision,
    createdAt: syncProfile.lastSavedAt,
    kind: "replace-collection-snapshot",
    status: "pending",
    snapshot: clean,
  };
  remoteSync.pending = true;
  remoteSync.retrying = false;
  cardedexSyncAdapter.saveSnapshot(clean, operation).then(() => {
    scheduleRemoteSync();
  }).finally(renderSyncStatus);
  renderSyncStatus();
}

function scheduleRemoteSync(delay = 350) {
  if (!remoteSync.ready || remoteSync.conflict || !cardedexAccount?.client) return;
  clearTimeout(remoteSync.retryTimer);
  remoteSync.retryTimer = setTimeout(flushRemoteSync, delay);
}

async function flushRemoteSync() {
  if (
    remoteSync.flushing || remoteSync.conflict || !remoteSync.ready ||
    !cardedexAccount?.client
  ) return;
  const operations = (await pendingSyncOperations()).sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt))
  );
  const operation = operations.at(-1);
  if (!operation) return renderSyncStatus();
  remoteSync.flushing = true;
  renderSyncStatus();
  const { data, error } = await cardedexAccount.client.rpc(
    "sync_collection_snapshot",
    {
      p_operation_id: operation.operationId,
      p_device_id: syncProfile.deviceId,
      p_base_revision: remoteSync.revision,
      p_snapshot: operation.snapshot,
    },
  );
  remoteSync.flushing = false;
  if (error) {
    remoteSync.retrying = true;
    renderSyncStatus();
    scheduleRemoteSync(5000);
    return;
  }
  if (data?.status === "conflict") {
    remoteSync.conflict = true;
    remoteSync.revision = Number(data.revision) || 0;
    remoteSync.serverSnapshot = data.snapshot || {};
    showSyncChoice("conflict");
    return renderSyncStatus();
  }
  remoteSync.revision = Number(data?.revision) || remoteSync.revision;
  remoteSync.pending = false;
  remoteSync.retrying = false;
  syncProfile.serverRevision = remoteSync.revision;
  syncProfile.lastSyncedAt = new Date().toISOString();
  writeSyncProfile();
  await clearSyncOperations();
  renderSyncStatus();
}

function showSyncChoice(reason = "first-login") {
  const da = state.settings.language === "da";
  const choice = document.querySelector("#syncChoice");
  const title = document.querySelector("#syncChoiceTitle");
  const description = document.querySelector("#syncChoiceDescription");
  const device = document.querySelector("#syncUseDevice");
  const account = document.querySelector("#syncUseAccount");
  if (!choice) return;
  choice.hidden = false;
  title.textContent = da ? "Vælg hvilken samling der skal beholdes" :
    "Choose which collection to keep";
  description.textContent = reason === "conflict"
    ? (da
      ? "Både denne enhed og kontoen har ændringer. Intet overskrives, før du vælger."
      : "This device and the account both have changes. Nothing is overwritten until you choose.")
    : (da
      ? "Denne enhed har en lokal samling. Upload den, eller brug kopien på kontoen."
      : "This device has a local collection. Upload it or use the account copy.");
  device.textContent = da ? "Brug denne enhed" : "Use this device";
  account.textContent = da ? "Brug kontokopi" : "Use account copy";
}

function hideSyncChoice() {
  const choice = document.querySelector("#syncChoice");
  if (choice) choice.hidden = true;
}

async function chooseDeviceSnapshot() {
  remoteSync.conflict = false;
  remoteSync.ready = true;
  syncProfile.accountUserId = remoteSync.userId;
  syncProfile.serverRevision = remoteSync.revision;
  writeSyncProfile();
  hideSyncChoice();
  queueCollectionSync(currentCollectionSnapshot());
}

async function chooseAccountSnapshot() {
  applyRemoteSnapshot(remoteSync.serverSnapshot || {});
  await clearSyncOperations();
  remoteSync.conflict = false;
  remoteSync.ready = true;
  remoteSync.pending = false;
  remoteSync.retrying = false;
  syncProfile.accountUserId = remoteSync.userId;
  syncProfile.serverRevision = remoteSync.revision;
  syncProfile.lastSyncedAt = new Date().toISOString();
  writeSyncProfile();
  hideSyncChoice();
  renderSyncStatus();
}

async function handleSyncAccountChange(user) {
  if (!user) {
    remoteSync.userId = null;
    remoteSync.collectionId = null;
    remoteSync.ready = false;
    remoteSync.conflict = false;
    remoteSync.pending = false;
    remoteSync.retrying = false;
    hideSyncChoice();
    return renderSyncStatus();
  }
  if (remoteSync.userId === user.id && remoteSync.ready) return;
  remoteSync.userId = user.id;
  remoteSync.ready = false;
  remoteSync.conflict = false;
  remoteSync.retrying = false;
  renderSyncStatus();
  const { data, error } = await cardedexAccount.client.from("collections")
    .select("id,revision,snapshot")
    .eq("owner_id", user.id)
    .single();
  if (error || !data) {
    const node = document.querySelector("#syncStatus");
    if (node) node.textContent = state.settings.language === "da"
      ? "Kontoen er klar, men synkroniseringsmigreringen mangler"
      : "Account is ready, but the sync migration is not installed";
    return;
  }
  remoteSync.collectionId = data.id;
  remoteSync.revision = Number(data.revision) || 0;
  remoteSync.serverSnapshot = data.snapshot || {};
  const localSnapshot = currentCollectionSnapshot();
  const newAccount = syncProfile.accountUserId !== user.id;
  if (
    newAccount && syncSnapshotHasData(localSnapshot) &&
    JSON.stringify(normalizeSyncSnapshot(localSnapshot)) !==
      JSON.stringify(normalizeSyncSnapshot(remoteSync.serverSnapshot))
  ) {
    return showSyncChoice("first-login");
  }
  syncProfile.accountUserId = user.id;
  syncProfile.serverRevision = remoteSync.revision;
  writeSyncProfile();
  remoteSync.ready = true;
  if (syncSnapshotHasData(remoteSync.serverSnapshot)) {
    applyRemoteSnapshot(remoteSync.serverSnapshot);
  }
  renderSyncStatus();
  scheduleRemoteSync(0);
}

async function updateRemoteDisplayName() {
  if (!cardedexAccount?.user || !cardedexAccount.client) return;
  await cardedexAccount.client.from("profiles").update({
    display_name: collectorDisplayName(),
    updated_at: new Date().toISOString(),
  }).eq("id", cardedexAccount.user.id);
}

function collectorDisplayName() {
  return syncProfile.displayName.trim() ||
    (state.settings.language === "da" ? "Kort-samler" : "Card collector");
}

function applySyncLanguage() {
  const da = state.settings.language === "da";
  const values = {
    collectionStorageKicker: da ? "Min samling" : "My collection",
    syncTitle: da ? "Sikker kontosynkronisering" : "Secure account sync",
    collectorNameLabel: da ? "Samlernavn" : "Collector name",
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = value;
  });
  const name = document.querySelector("#collectorName");
  if (name) name.placeholder = da ? "Dit viste navn" : "Your display name";
  const intro = document.querySelector(".collection-intro");
  if (intro) intro.textContent = da
    ? "Din samling gemmes straks på enheden og synkroniseres sikkert, når du er logget ind."
    : "Your collection saves immediately on this device and syncs securely when you sign in.";
  if (typeof applyAccountLanguage === "function") applyAccountLanguage();
  if (!document.querySelector("#syncChoice")?.hidden) showSyncChoice(
    remoteSync.conflict ? "conflict" : "first-login",
  );
  renderSyncStatus();
}

function initializeSync() {
  const input = document.querySelector("#collectorName");
  if (!input || input.dataset.syncReady) return;
  input.dataset.syncReady = "true";
  input.value = syncProfile.displayName;
  input.addEventListener("change", () => {
    syncProfile.displayName = input.value.trim().slice(0, 40);
    writeSyncProfile();
    renderSyncStatus();
    updateRemoteDisplayName();
    if (typeof renderTradeBinder === "function") renderTradeBinder();
  });
  document.querySelector("#syncUseDevice")?.addEventListener(
    "click",
    chooseDeviceSnapshot,
  );
  document.querySelector("#syncUseAccount")?.addEventListener(
    "click",
    chooseAccountSnapshot,
  );
  globalThis.addEventListener?.("online", () => scheduleRemoteSync(0));
  applySyncLanguage();
  if (!syncProfile.lastSavedAt && syncSnapshotHasData(currentCollectionSnapshot())) {
    queueCollectionSync(currentCollectionSnapshot());
  }
  if (typeof cardedexAccount === "object" && cardedexAccount.user) {
    handleSyncAccountChange(cardedexAccount.user);
  }
}

initializeSync();
