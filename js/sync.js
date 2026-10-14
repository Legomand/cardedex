const CARDEDEX_SYNC_PROFILE_KEY = "cardedex-sync-profile";
const CARDEDEX_SYNC_BASE_PREFIX = "cardedex-sync-base:";
const SYNC_CARD_FIELDS = [
  "cardStates",
  "cardCounts",
  "cardPrintVariants",
  "cardOwnedVariants",
];
const SYNC_SET_FIELDS = ["favorites", "trackedSeries", "trackedSets"];

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
  refreshing: false,
  pending: false,
  retrying: false,
  retryAttempt: 0,
  retryOperationId: null,
  conflict: false,
  conflictData: null,
  error: null,
  retryTimer: null,
  pollTimer: null,
  memoryOperation: null,
};
let syncApplyingRemote = false;

const syncDataDb = new Promise((resolve) => {
  if (!globalThis.indexedDB) return resolve(null);
  let blocked = false;
  const request = indexedDB.open("cardedex-user-data", 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots");
    if (!db.objectStoreNames.contains("operations")) {
      db.createObjectStore("operations", { keyPath: "operationId" });
    }
    if (!db.objectStoreNames.contains("bases")) {
      db.createObjectStore("bases", { keyPath: "accountUserId" });
    }
  };
  request.onsuccess = () => {
    if (blocked) request.result.close();
    else resolve(request.result);
  };
  request.onerror = () => resolve(null);
  request.onblocked = () => {
    blocked = true;
    resolve(null);
  };
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
  const clean = {
    version: 7,
    favorites: Array.isArray(snapshot.favorites) ? [...new Set(snapshot.favorites)] : [],
    cardStates: snapshot.cardStates && typeof snapshot.cardStates === "object"
      ? { ...snapshot.cardStates }
      : {},
    cardCounts: snapshot.cardCounts && typeof snapshot.cardCounts === "object"
      ? { ...snapshot.cardCounts }
      : {},
    cardPrintVariants:
      snapshot.cardPrintVariants && typeof snapshot.cardPrintVariants === "object"
        ? structuredClone(snapshot.cardPrintVariants)
        : {},
    cardOwnedVariants:
      snapshot.cardOwnedVariants && typeof snapshot.cardOwnedVariants === "object"
        ? structuredClone(snapshot.cardOwnedVariants)
        : {},
    trackedSeries: Array.isArray(snapshot.trackedSeries)
      ? [...new Set(snapshot.trackedSeries)]
      : [],
    trackedSets: Array.isArray(snapshot.trackedSets)
      ? [...new Set(snapshot.trackedSets)]
      : [],
    completionMode: snapshot.completionMode === "master" ? "master" : "set",
  };
  const cardIds = new Set(SYNC_CARD_FIELDS.flatMap((field) => Object.keys(clean[field])));
  for (const cardId of cardIds) {
    applySyncCardRecord(clean, cardId, syncCardRecord(clean, cardId));
  }
  return clean;
}

function syncComparable(value) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  if (value && typeof value === "object") {
    return JSON.stringify(Object.keys(value).sort().reduce((result, key) => {
      result[key] = JSON.parse(syncComparable(value[key]));
      return result;
    }, {}));
  }
  return JSON.stringify(value);
}

function syncValuesEqual(left, right) {
  return syncComparable(left) === syncComparable(right);
}

function syncCollectionChanged(previousSnapshot, nextSnapshot) {
  return !syncValuesEqual(
    normalizeSyncSnapshot(previousSnapshot),
    normalizeSyncSnapshot(nextSnapshot),
  );
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
  localStorage.setItem("cardedex-user", JSON.stringify({
    ...clean,
    version: 6,
    settings: state.settings,
  }));
  syncApplyingRemote = false;
  if (typeof renderPokemon === "function") renderPokemon();
  if (collectionDialog?.open && typeof showCollection === "function") showCollection();
}

function syncStatusText() {
  const da = state.settings.language === "da";
  if (remoteSync.conflict) {
    return da
      ? "Synkronisering er sat på pause · gennemgå begge samlinger nedenfor"
      : "Sync paused · review both collections below";
  }
  if (remoteSync.error) return da
    ? "Synkronisering kræver handling · se meddelelsen nedenfor"
    : "Sync needs attention · see the message below";
  if (remoteSync.flushing || remoteSync.refreshing) return da ? "Synkroniserer…" : "Syncing…";
  if (remoteSync.retrying) return da
    ? "Gemt lokalt · prøver synkronisering igen"
    : "Saved locally · retrying sync";
  if (remoteSync.pending && remoteSync.ready) return da
    ? "Gemt lokalt · venter på synkronisering"
    : "Saved locally · waiting to sync";
  if (remoteSync.ready && remoteSync.userId) {
    const when = syncProfile.lastSyncedAt
      ? new Intl.DateTimeFormat(da ? "da-DK" : "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(syncProfile.lastSyncedAt))
      : null;
    return da
      ? `Synkroniseret${when ? ` kl. ${when}` : ""} · serverrevision ${remoteSync.revision}`
      : `Synced${when ? ` at ${when}` : ""} · server revision ${remoteSync.revision}`;
  }
  return da ? "Gemt lokalt · log ind for at synkronisere" :
    "Saved locally · sign in to sync";
}

function renderSyncStatus() {
  const name = document.querySelector("#collectorName");
  const status = document.querySelector("#syncStatus");
  const dot = document.querySelector("#syncDot");
  if (name && name !== document.activeElement) name.value = syncProfile.displayName;
  if (status) status.textContent = remoteSync.error || syncStatusText();
  if (dot) {
    dot.classList.toggle("online", remoteSync.ready && !remoteSync.conflict && !remoteSync.error);
    dot.classList.toggle("error", remoteSync.conflict || Boolean(remoteSync.error));
  }
}

async function persistLocalSyncSnapshot(snapshot, operation) {
  try {
    const db = await syncDataDb;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["snapshots", "operations"], "readwrite");
      tx.objectStore("snapshots").put({
        schema: "cardedex-collection/v7",
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
    remoteSync.memoryOperation = operation;
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

function operationBelongsToAccount(operation, accountUserId) {
  return operation.profileId === syncProfile.profileId &&
    (operation.accountUserId === accountUserId ||
      (!operation.accountUserId && syncProfile.accountUserId === accountUserId));
}

async function pendingSyncOperations(accountUserId = syncProfile.accountUserId) {
  let operations = [];
  try {
    const db = await syncDataDb;
    operations = await new Promise((resolve, reject) => {
      const request = db.transaction("operations").objectStore("operations").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {}
  if (remoteSync.memoryOperation) operations.push(remoteSync.memoryOperation);
  return operations.filter((operation) => operationBelongsToAccount(operation, accountUserId));
}

async function deleteSyncOperations(operationIds) {
  const ids = new Set(operationIds);
  if (!ids.size) return;
  try {
    const db = await syncDataDb;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite");
      ids.forEach((id) => tx.objectStore("operations").delete(id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
  if (ids.has(remoteSync.memoryOperation?.operationId)) remoteSync.memoryOperation = null;
}

async function clearAccountSyncOperations(accountUserId = remoteSync.userId) {
  const operations = await pendingSyncOperations(accountUserId);
  await deleteSyncOperations(operations.map((operation) => operation.operationId));
}

function syncBaseFallbackKey(accountUserId) {
  return `${CARDEDEX_SYNC_BASE_PREFIX}${accountUserId}`;
}

async function saveSyncBase(accountUserId, revision, snapshot) {
  if (!accountUserId) return;
  const record = {
    accountUserId,
    revision: Math.max(0, Number(revision) || 0),
    snapshot: normalizeSyncSnapshot(snapshot),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(syncBaseFallbackKey(accountUserId), JSON.stringify(record));
  try {
    const db = await syncDataDb;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("bases", "readwrite");
      tx.objectStore("bases").put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function loadSyncBase(accountUserId) {
  if (!accountUserId) return null;
  try {
    const db = await syncDataDb;
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction("bases").objectStore("bases").get(accountUserId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (record) return record;
  } catch {}
  try {
    return JSON.parse(localStorage.getItem(syncBaseFallbackKey(accountUserId)) || "null");
  } catch {
    return null;
  }
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
    accountUserId: syncProfile.accountUserId,
    deviceId: syncProfile.deviceId,
    revision: syncProfile.revision,
    createdAt: syncProfile.lastSavedAt,
    kind: "replace-collection-snapshot",
    status: "pending",
    snapshot: clean,
  };
  remoteSync.pending = true;
  remoteSync.retrying = false;
  remoteSync.error = null;
  if (remoteSync.conflict && remoteSync.conflictData) {
    remoteSync.conflictData.local = clean;
    remoteSync.conflictData.merge = remoteSync.conflictData.base
      ? buildSyncMerge(remoteSync.conflictData.base, clean, remoteSync.conflictData.remote)
      : null;
    showSyncChoice(remoteSync.conflictData.reason);
  }
  cardedexSyncAdapter.saveSnapshot(clean, operation).then(() => scheduleRemoteSync())
    .finally(renderSyncStatus);
  renderSyncStatus();
}

function scheduleRemoteSync(delay = 350) {
  if (!remoteSync.ready || remoteSync.conflict || remoteSync.error ||
      !cardedexAccount?.client) return;
  clearTimeout(remoteSync.retryTimer);
  remoteSync.retryTimer = setTimeout(flushRemoteSync, delay);
}

function transientSyncError(error) {
  const status = Number(error?.status) || 0;
  const code = String(error?.code || "");
  if (/^(PGRST|22|23|28|42|P0002)/.test(code)) return false;
  return !navigator.onLine || status === 408 || status === 429 || status >= 500 ||
    (!status && !code && /fetch|network|timeout/i.test(String(error?.message || "")));
}

function handleRemoteError(error) {
  const da = state.settings.language === "da";
  if (transientSyncError(error)) {
    remoteSync.retrying = true;
    remoteSync.retryAttempt += 1;
    const delay = Math.min(60000, 2000 * (2 ** Math.min(remoteSync.retryAttempt, 5)));
    clearTimeout(remoteSync.retryTimer);
    remoteSync.retryTimer = setTimeout(() => {
      if (!cardedexAccount?.user) return;
      if (remoteSync.ready && remoteSync.retryOperationId) flushRemoteSync();
      else if (remoteSync.ready) refreshRemoteSync();
      else handleSyncAccountChange(cardedexAccount.user);
    }, delay);
  } else {
    remoteSync.retryOperationId = null;
    remoteSync.retrying = false;
    remoteSync.error = da
      ? "Synkronisering blev afvist. Log ind igen, eller kontrollér backend-migreringen."
      : "Sync was rejected. Sign in again or check the backend migration.";
  }
  renderSyncStatus();
}

function selectSyncUploadBatch(operations) {
  if (!operations.length) return { operation: null, sentIds: [] };
  const retryIndex = remoteSync.retryOperationId
    ? operations.findIndex((item) => item.operationId === remoteSync.retryOperationId)
    : -1;
  const operationIndex = retryIndex >= 0 ? retryIndex : operations.length - 1;
  return {
    operation: operations[operationIndex],
    sentIds: operations.slice(0, operationIndex + 1).map((item) => item.operationId),
  };
}

async function flushRemoteSync() {
  if (remoteSync.flushing || remoteSync.conflict || !remoteSync.ready || !cardedexAccount?.client) return;
  const operations = (await pendingSyncOperations(remoteSync.userId)).sort((a, b) =>
    (Number(a.revision) || 0) - (Number(b.revision) || 0) ||
    String(a.createdAt).localeCompare(String(b.createdAt))
  );
  const { operation, sentIds } = selectSyncUploadBatch(operations);
  if (!operation) {
    remoteSync.pending = false;
    return renderSyncStatus();
  }
  remoteSync.retryOperationId = operation.operationId;
  remoteSync.flushing = true;
  renderSyncStatus();
  const { data, error } = await cardedexAccount.client.rpc("sync_collection_snapshot", {
    p_operation_id: operation.operationId,
    p_device_id: syncProfile.deviceId,
    p_base_revision: remoteSync.revision,
    p_snapshot: operation.snapshot,
  });
  remoteSync.flushing = false;
  if (error) return handleRemoteError(error);
  if (data?.status === "conflict") {
    remoteSync.retryOperationId = null;
    remoteSync.revision = Number(data.revision) || 0;
    remoteSync.serverSnapshot = normalizeSyncSnapshot(data.snapshot || {});
    const base = await loadSyncBase(remoteSync.userId);
    return beginSyncConflict("conflict", base?.snapshot || null,
      currentCollectionSnapshot(), remoteSync.serverSnapshot);
  }
  remoteSync.revision = Number(data?.revision) || remoteSync.revision;
  remoteSync.retryOperationId = null;
  remoteSync.serverSnapshot = normalizeSyncSnapshot(operation.snapshot);
  remoteSync.retrying = false;
  remoteSync.retryAttempt = 0;
  remoteSync.error = null;
  syncProfile.serverRevision = remoteSync.revision;
  syncProfile.lastSyncedAt = new Date().toISOString();
  writeSyncProfile();
  await saveSyncBase(remoteSync.userId, remoteSync.revision, operation.snapshot);
  await deleteSyncOperations(sentIds);
  const remaining = await pendingSyncOperations(remoteSync.userId);
  remoteSync.pending = remaining.length > 0;
  renderSyncStatus();
  if (remaining.length) scheduleRemoteSync(0);
}

function syncCardRecord(snapshot, cardId) {
  const status = snapshot.cardStates[cardId];
  if (status !== "owned" && status !== "wanted") return undefined;
  if (status === "wanted") return { status };
  const record = {
    status,
    count: Math.max(1, Number(snapshot.cardCounts[cardId]) || 1),
  };
  if (snapshot.cardPrintVariants[cardId] !== undefined) {
    record.printVariant = structuredClone(snapshot.cardPrintVariants[cardId]);
  }
  if (Array.isArray(snapshot.cardOwnedVariants[cardId]) &&
      snapshot.cardOwnedVariants[cardId].length) {
    record.ownedVariants = structuredClone(snapshot.cardOwnedVariants[cardId]);
  }
  return record;
}

function applySyncCardRecord(snapshot, cardId, record) {
  for (const field of SYNC_CARD_FIELDS) delete snapshot[field][cardId];
  if (!record || (record.status !== "owned" && record.status !== "wanted")) return;
  snapshot.cardStates[cardId] = record.status;
  if (record.status !== "owned") return;
  snapshot.cardCounts[cardId] = Math.max(1, Number(record.count) || 1);
  if (record.printVariant !== undefined) {
    snapshot.cardPrintVariants[cardId] = structuredClone(record.printVariant);
  }
  if (Array.isArray(record.ownedVariants) && record.ownedVariants.length) {
    snapshot.cardOwnedVariants[cardId] = structuredClone(record.ownedVariants);
  }
}

function buildSyncMerge(baseSnapshot, localSnapshot, remoteSnapshot) {
  const base = normalizeSyncSnapshot(baseSnapshot);
  const local = normalizeSyncSnapshot(localSnapshot);
  const remote = normalizeSyncSnapshot(remoteSnapshot);
  const merged = structuredClone(remote);
  const conflicts = [];
  const cardIds = new Set(SYNC_CARD_FIELDS.flatMap((field) => [
    ...Object.keys(base[field]),
    ...Object.keys(local[field]),
    ...Object.keys(remote[field]),
  ]));
  for (const cardId of cardIds) {
    const baseValue = syncCardRecord(base, cardId);
    const localValue = syncCardRecord(local, cardId);
    const remoteValue = syncCardRecord(remote, cardId);
    const localChanged = !syncValuesEqual(localValue, baseValue);
    const remoteChanged = !syncValuesEqual(remoteValue, baseValue);
    if (localChanged && remoteChanged && !syncValuesEqual(localValue, remoteValue)) {
      conflicts.push({
        field: "cardRecord",
        key: cardId,
        base: baseValue,
        local: localValue,
        remote: remoteValue,
      });
    } else if (localChanged) {
      applySyncCardRecord(merged, cardId, localValue);
    }
  }
  for (const field of SYNC_SET_FIELDS) {
    const baseSet = new Set(base[field]);
    const localSet = new Set(local[field]);
    const remoteSet = new Set(remote[field]);
    const keys = new Set([...baseSet, ...localSet, ...remoteSet]);
    for (const key of keys) {
      const baseValue = baseSet.has(key);
      const localValue = localSet.has(key);
      const remoteValue = remoteSet.has(key);
      const localChanged = localValue !== baseValue;
      const remoteChanged = remoteValue !== baseValue;
      if (localChanged && remoteChanged && localValue !== remoteValue) {
        conflicts.push({ field, key, base: baseValue, local: localValue, remote: remoteValue });
      } else if (localChanged) {
        if (localValue) remoteSet.add(key);
        else remoteSet.delete(key);
      }
    }
    merged[field] = [...remoteSet];
  }
  const baseMode = base.completionMode;
  const localChanged = local.completionMode !== baseMode;
  const remoteChanged = remote.completionMode !== baseMode;
  if (localChanged && remoteChanged && local.completionMode !== remote.completionMode) {
    conflicts.push({
      field: "completionMode",
      key: "completionMode",
      base: baseMode,
      local: local.completionMode,
      remote: remote.completionMode,
    });
  } else if (localChanged) merged.completionMode = local.completionMode;
  return { merged, conflicts };
}

function syncConflictFieldLabel(conflict, da) {
  const labels = {
    cardRecord: da ? "kort" : "card",
    favorites: da ? "favorit" : "favorite",
    trackedSeries: da ? "fulgt serie" : "tracked series",
    trackedSets: da ? "fulgt sæt" : "tracked set",
    completionMode: da ? "samlingstilstand" : "completion mode",
  };
  return `${conflict.key} · ${labels[conflict.field] || conflict.field}`;
}

function syncConflictValue(value, da) {
  if (value === undefined) return da ? "Fjernet" : "Removed";
  if (value === true) return da ? "Ja" : "Yes";
  if (value === false) return da ? "Nej" : "No";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (value && typeof value === "object" && value.status) {
    if (value.status === "wanted") return da ? "Ønsket" : "Wanted";
    const parts = [da ? `Ejet ×${value.count || 1}` : `Owned ×${value.count || 1}`];
    if (value.printVariant !== undefined) parts.push(String(value.printVariant));
    if (Array.isArray(value.ownedVariants) && value.ownedVariants.length) {
      parts.push(value.ownedVariants.join(", "));
    }
    return parts.join(" · ");
  }
  return String(value);
}

function showSyncChoice(reason = "first-login") {
  const da = state.settings.language === "da";
  const choice = document.querySelector("#syncChoice");
  const title = document.querySelector("#syncChoiceTitle");
  const description = document.querySelector("#syncChoiceDescription");
  const list = document.querySelector("#syncConflictList");
  const device = document.querySelector("#syncUseDevice");
  const account = document.querySelector("#syncUseAccount");
  const combined = document.querySelector("#syncUseCombined");
  const download = document.querySelector("#syncDownloadCopies");
  if (!choice) return;
  choice.hidden = false;
  title.textContent = da ? "Gennemgå samlingerne" : "Review the collections";
  const conflictData = remoteSync.conflictData;
  const conflicts = conflictData?.merge?.conflicts || [];
  if (reason === "first-login") {
    description.textContent = da
      ? "Denne enhed og kontoen har forskellige samlinger. Vælg eksplicit, hvilken der skal bruges."
      : "This device and the account have different collections. Explicitly choose which one to use.";
  } else if (!conflicts.length && conflictData?.merge) {
    description.textContent = da
      ? "Enhederne ændrede forskellige dele. Gennemgå og godkend den foreslåede kombination."
      : "The devices changed different items. Review and approve the proposed combination.";
  } else {
    description.textContent = da
      ? `${conflicts.length} ændring${conflicts.length === 1 ? "" : "er"} kræver et valg. Intet overskrives, før du godkender.`
      : `${conflicts.length} change${conflicts.length === 1 ? "" : "s"} require a choice. Nothing is overwritten until you approve.`;
  }
  if (list) {
    list.innerHTML = conflicts.map((conflict, index) =>
      `<fieldset data-sync-conflict="${index}"><legend>${escapeHtml(syncConflictFieldLabel(conflict, da))}</legend>` +
      `<label><input type="radio" name="syncConflict${index}" value="local">` +
      `<span>${da ? "Denne enhed" : "This device"}<small>${escapeHtml(syncConflictValue(conflict.local, da))}</small></span></label>` +
      `<label><input type="radio" name="syncConflict${index}" value="remote">` +
      `<span>${da ? "Konto" : "Account"}<small>${escapeHtml(syncConflictValue(conflict.remote, da))}</small></span></label></fieldset>`
    ).join("");
  }
  device.textContent = da ? "Brug hele denne enhed" : "Use this entire device";
  account.textContent = da ? "Brug hele kontokopien" : "Use entire account copy";
  combined.textContent = conflicts.length
    ? (da ? "Brug mine gennemgåede valg" : "Use my reviewed choices")
    : (da ? "Brug foreslået kombination" : "Use proposed combination");
  combined.hidden = !conflictData?.merge;
  combined.disabled = conflicts.length > 0;
  download.textContent = da ? "Download begge kopier" : "Download both copies";
  list?.querySelectorAll("input[type=radio]").forEach((input) => {
    input.addEventListener("change", () => {
      combined.disabled = conflicts.some((_item, index) =>
        !list.querySelector(`input[name=syncConflict${index}]:checked`)
      );
    });
  });
}

function hideSyncChoice() {
  const choice = document.querySelector("#syncChoice");
  if (choice) choice.hidden = true;
}

function beginSyncConflict(reason, baseSnapshot, localSnapshot, remoteSnapshot) {
  const local = normalizeSyncSnapshot(localSnapshot);
  const remote = normalizeSyncSnapshot(remoteSnapshot);
  remoteSync.conflict = true;
  remoteSync.ready = false;
  remoteSync.pending = true;
  remoteSync.conflictData = {
    reason,
    base: baseSnapshot ? normalizeSyncSnapshot(baseSnapshot) : null,
    local,
    remote,
    merge: baseSnapshot ? buildSyncMerge(baseSnapshot, local, remote) : null,
  };
  showSyncChoice(reason);
  renderSyncStatus();
}

async function finishConflictWithSnapshot(snapshot) {
  await clearAccountSyncOperations(remoteSync.userId);
  await saveSyncBase(remoteSync.userId, remoteSync.revision, remoteSync.serverSnapshot);
  remoteSync.conflict = false;
  remoteSync.conflictData = null;
  remoteSync.ready = true;
  remoteSync.pending = false;
  hideSyncChoice();
  applyRemoteSnapshot(snapshot);
  queueCollectionSync(snapshot);
}

async function chooseDeviceSnapshot() {
  await finishConflictWithSnapshot(currentCollectionSnapshot());
}

async function chooseAccountSnapshot() {
  const snapshot = remoteSync.conflictData?.remote || remoteSync.serverSnapshot || {};
  await clearAccountSyncOperations(remoteSync.userId);
  applyRemoteSnapshot(snapshot);
  await saveSyncBase(remoteSync.userId, remoteSync.revision, snapshot);
  remoteSync.conflict = false;
  remoteSync.conflictData = null;
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

async function chooseCombinedSnapshot() {
  const data = remoteSync.conflictData;
  if (!data?.merge) return;
  const snapshot = structuredClone(data.merge.merged);
  const list = document.querySelector("#syncConflictList");
  data.merge.conflicts.forEach((conflict, index) => {
    const selection = list?.querySelector(`input[name=syncConflict${index}]:checked`)?.value;
    if (!selection) return;
    const value = conflict[selection === "local" ? "local" : "remote"];
    if (conflict.field === "cardRecord") {
      applySyncCardRecord(snapshot, conflict.key, value);
    } else if (SYNC_SET_FIELDS.includes(conflict.field)) {
      const values = new Set(snapshot[conflict.field]);
      if (value) values.add(conflict.key);
      else values.delete(conflict.key);
      snapshot[conflict.field] = [...values];
    } else snapshot.completionMode = value;
  });
  await finishConflictWithSnapshot(snapshot);
}

function downloadSyncConflictCopies() {
  const data = remoteSync.conflictData;
  if (!data) return;
  const payload = {
    schema: "cardedex-sync-conflict/v1",
    exportedAt: new Date().toISOString(),
    deviceId: syncProfile.deviceId,
    serverRevision: remoteSync.revision,
    base: data.base,
    thisDevice: data.local,
    account: data.remote,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "cardedex-sync-conflict-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function fetchRemoteCollection() {
  return cardedexAccount.client.from("collections")
    .select("id,revision,snapshot")
    .eq("owner_id", remoteSync.userId)
    .single();
}

async function reconcileRemoteCollection(data, newAccount = false) {
  remoteSync.collectionId = data.id;
  remoteSync.revision = Number(data.revision) || 0;
  remoteSync.serverSnapshot = normalizeSyncSnapshot(data.snapshot || {});
  const local = normalizeSyncSnapshot(currentCollectionSnapshot());
  const base = await loadSyncBase(remoteSync.userId);
  const operations = await pendingSyncOperations(remoteSync.userId);
  const localMatchesRemote = syncValuesEqual(local, remoteSync.serverSnapshot);
  const localHasWork = operations.length > 0 || (!newAccount &&
    (base ? !syncValuesEqual(local, normalizeSyncSnapshot(base.snapshot)) :
      syncSnapshotHasData(local) && !localMatchesRemote));

  if (newAccount && syncSnapshotHasData(local) && !localMatchesRemote) {
    return beginSyncConflict("first-login", null, local, remoteSync.serverSnapshot);
  }
  if (localHasWork) {
    if (!base || Number(base.revision) !== remoteSync.revision) {
      return beginSyncConflict("conflict", base?.snapshot || null, local, remoteSync.serverSnapshot);
    }
    remoteSync.ready = true;
    remoteSync.pending = true;
    if (!operations.length) queueCollectionSync(local);
    else scheduleRemoteSync(0);
    return renderSyncStatus();
  }
  applyRemoteSnapshot(remoteSync.serverSnapshot);
  await saveSyncBase(remoteSync.userId, remoteSync.revision, remoteSync.serverSnapshot);
  syncProfile.accountUserId = remoteSync.userId;
  syncProfile.serverRevision = remoteSync.revision;
  syncProfile.lastSyncedAt = new Date().toISOString();
  writeSyncProfile();
  remoteSync.ready = true;
  remoteSync.pending = false;
  remoteSync.retrying = false;
  remoteSync.retryAttempt = 0;
  remoteSync.error = null;
  renderSyncStatus();
}

async function refreshRemoteSync() {
  if (!remoteSync.userId || remoteSync.refreshing || remoteSync.flushing ||
      remoteSync.conflict || remoteSync.error || !cardedexAccount?.client) return;
  remoteSync.refreshing = true;
  renderSyncStatus();
  const { data, error } = await fetchRemoteCollection();
  remoteSync.refreshing = false;
  if (error || !data) return handleRemoteError(error || new Error("Collection unavailable"));
  await reconcileRemoteCollection(data, false);
}

async function handleSyncAccountChange(user) {
  clearTimeout(remoteSync.retryTimer);
  clearInterval(remoteSync.pollTimer);
  if (!user) {
    remoteSync.userId = null;
    remoteSync.collectionId = null;
    remoteSync.ready = false;
    remoteSync.conflict = false;
    remoteSync.conflictData = null;
    remoteSync.pending = false;
    remoteSync.retrying = false;
    remoteSync.retryOperationId = null;
    remoteSync.error = null;
    hideSyncChoice();
    return renderSyncStatus();
  }
  remoteSync.userId = user.id;
  remoteSync.ready = false;
  remoteSync.conflict = false;
  remoteSync.conflictData = null;
  remoteSync.retrying = false;
  remoteSync.retryOperationId = null;
  remoteSync.error = null;
  renderSyncStatus();
  const { data, error } = await fetchRemoteCollection();
  if (error || !data) return handleRemoteError(error || new Error("Collection unavailable"));
  const newAccount = syncProfile.accountUserId !== user.id;
  syncProfile.accountUserId = user.id;
  writeSyncProfile();
  await reconcileRemoteCollection(data, newAccount);
  remoteSync.pollTimer = setInterval(refreshRemoteSync, 60000);
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
    syncTitle: da ? "Sikker kontosynkronisering" : "Secure account sync",
    collectorNameLabel: da ? "Samlernavn" : "Collector name",
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = value;
  });
  const name = document.querySelector("#collectorName");
  if (name) name.placeholder = da ? "Dit viste navn" : "Your display name";
  if (typeof applyAccountLanguage === "function") applyAccountLanguage();
  if (!document.querySelector("#syncChoice")?.hidden) {
    showSyncChoice(remoteSync.conflictData?.reason || "conflict");
  }
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
  document.querySelector("#syncUseDevice")?.addEventListener("click", chooseDeviceSnapshot);
  document.querySelector("#syncUseAccount")?.addEventListener("click", chooseAccountSnapshot);
  document.querySelector("#syncUseCombined")?.addEventListener("click", chooseCombinedSnapshot);
  document.querySelector("#syncDownloadCopies")?.addEventListener("click", downloadSyncConflictCopies);
  globalThis.addEventListener?.("online", () => refreshRemoteSync());
  globalThis.addEventListener?.("focus", () => refreshRemoteSync());
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshRemoteSync();
  });
  applySyncLanguage();
  if (!syncProfile.lastSavedAt && syncSnapshotHasData(currentCollectionSnapshot())) {
    queueCollectionSync(currentCollectionSnapshot());
  }
  if (typeof cardedexAccount === "object" && cardedexAccount.user) {
    handleSyncAccountChange(cardedexAccount.user);
  }
}

initializeSync();
