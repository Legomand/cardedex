const CARDEDEX_SYNC_PROFILE_KEY = "cardedex-sync-profile";

function syncRandomId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function readSyncProfile() {
  try {
    const stored = JSON.parse(localStorage.getItem(CARDEDEX_SYNC_PROFILE_KEY) || "{}");
    return {
      profileId: stored.profileId || syncRandomId("local"),
      displayName: String(stored.displayName || "").slice(0, 40),
      deviceId: stored.deviceId || syncRandomId("device"),
      revision: Math.max(0, Number(stored.revision) || 0),
      lastSavedAt: stored.lastSavedAt || null,
    };
  } catch {
    return {
      profileId: syncRandomId("local"),
      displayName: "",
      deviceId: syncRandomId("device"),
      revision: 0,
      lastSavedAt: null,
    };
  }
}

const syncProfile = readSyncProfile();
localStorage.setItem(CARDEDEX_SYNC_PROFILE_KEY, JSON.stringify(syncProfile));

const syncDataDb = new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) return reject(new Error("IndexedDB unavailable"));
  const request = indexedDB.open("cardedex-user-data", 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots");
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

function syncStatusText() {
  const when = syncProfile.lastSavedAt
    ? new Intl.DateTimeFormat(
      state.settings.language === "da" ? "da-DK" : "en-GB",
      { hour: "2-digit", minute: "2-digit" },
    ).format(new Date(syncProfile.lastSavedAt))
    : null;
  if (state.settings.language === "da") {
    return when
      ? `Lokal revision ${syncProfile.revision} gemt kl. ${when} · serversynkronisering er ikke tilsluttet`
      : "Gemt lokalt · serversynkronisering er ikke tilsluttet";
  }
  return when
    ? `Local revision ${syncProfile.revision} saved at ${when} · server sync is not connected`
    : "Saved locally · server sync is not connected";
}

function renderSyncStatus() {
  const name = document.querySelector("#collectorName");
  const status = document.querySelector("#syncStatus");
  if (name && name !== document.activeElement) name.value = syncProfile.displayName;
  if (status) status.textContent = syncStatusText();
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
    // localStorage remains the compatibility fallback in browsers without IndexedDB.
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

const cardedexSyncAdapter = Object.freeze({
  mode: "local-preview",
  saveSnapshot: persistLocalSyncSnapshot,
  loadSnapshot: loadLocalSyncSnapshot,
});

function queueCollectionSync(snapshot) {
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
    status: "local-only",
  };
  cardedexSyncAdapter.saveSnapshot(snapshot, operation).finally(renderSyncStatus);
  renderSyncStatus();
}

function collectorDisplayName() {
  return syncProfile.displayName.trim() ||
    (state.settings.language === "da" ? "Kort-samler" : "Card collector");
}

function applySyncLanguage() {
  const da = state.settings.language === "da";
  const values = {
    collectionStorageKicker: da ? "Lokal samlingsforhåndsvisning" : "Local collection preview",
    syncTitle: da ? "Lokal synkroniseringsforhåndsvisning" : "Local sync preview",
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
    ? "Denne udviklingsversion beholder en holdbar lokal cache, mens konto-backenden bliver gjort klar."
    : "This development build keeps a durable local cache while the managed account backend is prepared.";
  renderSyncStatus();
}

function initializeSyncPreview() {
  const input = document.querySelector("#collectorName");
  if (!input || input.dataset.syncReady) return;
  input.dataset.syncReady = "true";
  input.value = syncProfile.displayName;
  input.addEventListener("change", () => {
    syncProfile.displayName = input.value.trim().slice(0, 40);
    writeSyncProfile();
    renderSyncStatus();
    if (typeof renderTradeBinder === "function") renderTradeBinder();
  });
  applySyncLanguage();
  if (!syncProfile.lastSavedAt && Object.keys(state.cardStates).length) {
    try {
      queueCollectionSync(JSON.parse(localStorage.getItem("cardedex-user") || "{}"));
    } catch {}
  }
}

initializeSyncPreview();
