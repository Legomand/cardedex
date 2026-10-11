const TRADE_BINDER_STORAGE_KEY = "cardedex-trade-binders";
const TRADE_BINDER_SCHEMA = "cardedex-trade-binder/v1";
const TRADE_PROPOSAL_SCHEMA = "cardedex-trade-proposal/v1";
const tradeSelectedCards = new Set();
const tradeProposalCards = new Set();
let activeTradeBinderId = "";
let tradeRemoteQuery = "";

function tradeT(key, values = {}) {
  const da = state.settings.language === "da";
  const table = {
    noBinders: da ? "Importér en Trade Binder for at inspicere og sammenligne den." : "Import a Trade Binder to inspect and compare it.",
    noCards: da ? "Ingen kort passer til denne visning." : "No cards match this view.",
    owned: da ? "ejede kort" : "owned cards",
    wanted: da ? "ønsker" : "wishlist cards",
    receive: da ? "Kort du ønsker fra dem" : "Cards you want from them",
    give: da ? "Kort de ønsker fra dig" : "Cards they want from you",
    missing: da ? "Andre kort du mangler" : "Other cards missing from your collection",
    inspect: da ? "Inspicér deres samling" : "Inspect their collection",
    search: da ? "Søg i den delte samling…" : "Search the shared collection…",
    proposal: da ? "Eksportér handelsforslag" : "Export trade proposal",
    remove: da ? "Fjern delt samling" : "Remove shared collection",
    selectCards: da ? "Vælg kort, der skal deles" : "Choose cards to share",
    nothingSelected: da ? "Vælg mindst ét kort først." : "Choose at least one card first.",
    exported: da ? "Trade Binder eksporteret. Send JSON-filen til den anden samler." : "Trade Binder exported. Send the JSON file to the other collector.",
    imported: da ? "Trade Binder importeret som skrivebeskyttet samling." : "Trade Binder imported as a read-only collection.",
    invalid: da ? "Filen er ikke en gyldig eller understøttet Trade Binder." : "That file is not a valid supported Trade Binder.",
    expired: da ? "Denne Trade Binder er udløbet." : "This Trade Binder has expired.",
    noProposal: da ? "Vælg mindst ét kort til handelsforslaget." : "Choose at least one card for the trade proposal.",
    copies: da ? "kopier" : "copies",
    printing: da ? "tryk" : "printing",
  };
  return String(table[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function tradeSafeText(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function tradeSafeCardId(value) {
  const id = tradeSafeText(value, 100);
  return /^[\w.:-]+$/u.test(id) ? id : "";
}

function readTradeBinders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRADE_BINDER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

let tradeBinders = readTradeBinders();

function saveTradeBinders() {
  localStorage.setItem(TRADE_BINDER_STORAGE_KEY, JSON.stringify(tradeBinders));
}

function tradeCardMetadata(id) {
  const card = state.collectionCards.find((item) => item.id === id);
  return {
    id,
    name: tradeSafeText(card?.name || id),
    localId: tradeSafeText(card?.localId || "", 30),
    setName: tradeSafeText(card?.set?.name || card?.series || ""),
    series: tradeSafeText(card?.series || ""),
  };
}

function localTradeCollection(scope = "all", includeWishlist = true) {
  const owned = Object.entries(state.cardStates).filter(([id, status]) => {
    if (status !== "owned") return false;
    const count = Math.max(1, Number(state.cardCounts[id]) || 1);
    if (scope === "duplicates") return count > 1;
    if (scope === "selected") return tradeSelectedCards.has(id);
    return true;
  }).map(([id]) => ({
    ...tradeCardMetadata(id),
    quantity: Math.min(999, Math.max(1, Number(state.cardCounts[id]) || 1)),
    printings: (state.cardOwnedVariants[id] || [state.cardPrintVariants[id]])
      .filter(Boolean).map((value) => tradeSafeText(value, 30)).slice(0, 12),
  }));
  const wanted = includeWishlist
    ? Object.entries(state.cardStates).filter(([, status]) => status === "wanted")
      .map(([id]) => tradeCardMetadata(id))
    : [];
  return { owned, wanted };
}

function createTradeBinderSnapshot(scope, expiryDays, includeWishlist) {
  const collection = localTradeCollection(scope, includeWishlist);
  const createdAt = new Date();
  const expiresAt = expiryDays > 0
    ? new Date(createdAt.getTime() + expiryDays * 86400000).toISOString()
    : null;
  return {
    schema: TRADE_BINDER_SCHEMA,
    shareId: syncRandomId("share"),
    createdAt: createdAt.toISOString(),
    expiresAt,
    owner: { displayName: collectorDisplayName() },
    scope,
    collection,
  };
}

function sanitizeTradeCard(value, includeQuantity) {
  if (!value || typeof value !== "object") return null;
  const id = tradeSafeCardId(value.id);
  if (!id) return null;
  const result = {
    id,
    name: tradeSafeText(value.name || id),
    localId: tradeSafeText(value.localId, 30),
    setName: tradeSafeText(value.setName),
    series: tradeSafeText(value.series),
  };
  if (includeQuantity) {
    result.quantity = Math.min(999, Math.max(1, Number(value.quantity) || 1));
    result.printings = Array.isArray(value.printings)
      ? value.printings.map((item) => tradeSafeText(item, 30)).filter(Boolean).slice(0, 12)
      : [];
  }
  return result;
}

function sanitizeTradeBinder(value) {
  if (!value || value.schema !== TRADE_BINDER_SCHEMA || !value.collection) {
    throw new Error("schema");
  }
  const shareId = tradeSafeText(value.shareId, 100);
  if (!shareId) throw new Error("id");
  const expiresAt = value.expiresAt ? new Date(value.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt < new Date())) {
    throw new Error("expired");
  }
  const owned = Array.isArray(value.collection.owned)
    ? value.collection.owned.slice(0, 10000).map((card) => sanitizeTradeCard(card, true)).filter(Boolean)
    : [];
  const wanted = Array.isArray(value.collection.wanted)
    ? value.collection.wanted.slice(0, 10000).map((card) => sanitizeTradeCard(card, false)).filter(Boolean)
    : [];
  return {
    schema: TRADE_BINDER_SCHEMA,
    shareId,
    createdAt: Number.isFinite(new Date(value.createdAt).getTime())
      ? new Date(value.createdAt).toISOString()
      : new Date().toISOString(),
    expiresAt: expiresAt?.toISOString() || null,
    importedAt: new Date().toISOString(),
    owner: { displayName: tradeSafeText(value.owner?.displayName || "Card collector", 40) },
    scope: ["all", "duplicates", "selected"].includes(value.scope) ? value.scope : "all",
    collection: { owned, wanted },
  };
}

function compareTradeCollections(local, remote) {
  const localOwned = new Map((local.owned || []).map((card) => [card.id, card]));
  const localWanted = new Set((local.wanted || []).map((card) => card.id));
  const remoteOwned = new Map((remote.owned || []).map((card) => [card.id, card]));
  const remoteWanted = new Set((remote.wanted || []).map((card) => card.id));
  return {
    receiveWanted: [...remoteOwned.values()].filter((card) => localWanted.has(card.id)),
    giveWanted: [...localOwned.values()].filter((card) => remoteWanted.has(card.id)),
    receiveMissing: [...remoteOwned.values()].filter((card) => !localOwned.has(card.id)),
    localDuplicates: [...localOwned.values()].filter((card) => card.quantity > 1 && !remoteOwned.has(card.id)),
  };
}

function downloadTradeJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function setTradeMessage(key, error = false) {
  const node = document.querySelector("#tradeMessage");
  if (!node) return;
  node.textContent = key ? tradeT(key) : "";
  node.classList.toggle("error", error);
}

function renderTradeSelectedCards() {
  const container = document.querySelector("#tradeSelectedCards");
  const scope = document.querySelector("#tradeShareScope")?.value;
  if (!container) return;
  container.hidden = scope !== "selected";
  if (scope !== "selected") return;
  const owned = Object.entries(state.cardStates).filter(([, status]) => status === "owned");
  container.innerHTML = `<strong>${escapeHtml(tradeT("selectCards"))}</strong><div></div>`;
  const list = owned.map(([id]) => {
    const card = tradeCardMetadata(id);
    return `<label><input type="checkbox" data-trade-select="${escapeHtml(id)}" ${tradeSelectedCards.has(id) ? "checked" : ""}><span>${escapeHtml(card.name)}<small>${escapeHtml(card.setName || id)}</small></span></label>`;
  }).join("");
  container.lastElementChild.innerHTML = list || `<p>${escapeHtml(tradeT("noCards"))}</p>`;
}

function tradeCardRows(cards, direction = "", limit = 60) {
  return cards.slice(0, limit).map((card) => {
    const key = direction ? `${direction}:${card.id}` : "";
    const checkbox = direction
      ? `<input type="checkbox" data-proposal-card="${escapeHtml(key)}" ${tradeProposalCards.has(key) ? "checked" : ""}>`
      : "";
    const details = [card.setName, card.localId ? `#${card.localId}` : ""]
      .filter(Boolean).join(" · ");
    const quantity = card.quantity > 1 ? `<b>${card.quantity} ${escapeHtml(tradeT("copies"))}</b>` : "";
    return `<label class="trade-card-row">${checkbox}<span><strong>${escapeHtml(card.name || card.id)}</strong><small>${escapeHtml(details || card.id)}</small></span>${quantity}</label>`;
  }).join("") || `<p class="trade-empty">${escapeHtml(tradeT("noCards"))}</p>`;
}

function renderTradeInspector() {
  const container = document.querySelector("#tradeInspector");
  if (!container) return;
  if (!tradeBinders.length) {
    container.innerHTML = `<div class="trade-empty">${escapeHtml(tradeT("noBinders"))}</div>`;
    return;
  }
  if (!tradeBinders.some((binder) => binder.shareId === activeTradeBinderId)) {
    activeTradeBinderId = tradeBinders[0].shareId;
  }
  const binder = tradeBinders.find((item) => item.shareId === activeTradeBinderId);
  const local = localTradeCollection("all", true);
  const comparison = compareTradeCollections(local, binder.collection);
  const query = tradeRemoteQuery.trim().toLowerCase();
  const visible = binder.collection.owned.filter((card) => !query ||
    [card.name, card.id, card.localId, card.setName, card.series]
      .filter(Boolean).join(" ").toLowerCase().includes(query));
  const ownedCopies = binder.collection.owned.reduce((sum, card) => sum + card.quantity, 0);
  container.innerHTML = `<div class="trade-inspector-toolbar"><label><span class="sr-only">Trade Binder</span><select id="activeTradeBinder">${tradeBinders.map((item) => `<option value="${escapeHtml(item.shareId)}" ${item.shareId === binder.shareId ? "selected" : ""}>${escapeHtml(item.owner.displayName)}</option>`).join("")}</select></label><button type="button" data-remove-trade-binder>${escapeHtml(tradeT("remove"))}</button></div>
    <div class="trade-summary"><div><strong>${binder.collection.owned.length}</strong><span>${escapeHtml(tradeT("owned"))}</span></div><div><strong>${ownedCopies}</strong><span>${escapeHtml(tradeT("copies"))}</span></div><div><strong>${binder.collection.wanted.length}</strong><span>${escapeHtml(tradeT("wanted"))}</span></div><div><strong>${comparison.receiveWanted.length + comparison.giveWanted.length}</strong><span>direct matches</span></div></div>
    <div class="trade-match-grid"><section><h4>${escapeHtml(tradeT("receive"))}</h4>${tradeCardRows(comparison.receiveWanted, "receive")}</section><section><h4>${escapeHtml(tradeT("give"))}</h4>${tradeCardRows(comparison.giveWanted, "give")}</section></div>
    <button type="button" class="trade-proposal-button" data-export-proposal>${escapeHtml(tradeT("proposal"))}</button>
    <details class="trade-missing"><summary>${escapeHtml(tradeT("missing"))} · ${comparison.receiveMissing.length}</summary>${tradeCardRows(comparison.receiveMissing)}</details>
    <section class="trade-remote-list"><h4>${escapeHtml(tradeT("inspect"))}</h4><input id="tradeRemoteSearch" type="search" value="${escapeHtml(tradeRemoteQuery)}" placeholder="${escapeHtml(tradeT("search"))}"><div>${tradeCardRows(visible, "", 250)}</div>${visible.length > 250 ? `<p class="trade-limit">Showing 250 of ${visible.length} matching cards</p>` : ""}</section>`;
}

function renderTradeBinder() {
  renderTradeSelectedCards();
  renderTradeInspector();
}

function exportTradeBinder() {
  const scope = document.querySelector("#tradeShareScope").value;
  if (scope === "selected" && !tradeSelectedCards.size) {
    setTradeMessage("nothingSelected", true);
    return;
  }
  const expiry = Number(document.querySelector("#tradeShareExpiry").value) || 0;
  const includeWishlist = document.querySelector("#tradeIncludeWishlist").checked;
  const snapshot = createTradeBinderSnapshot(scope, expiry, includeWishlist);
  const owner = collectorDisplayName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "collector";
  downloadTradeJson(`cardedex-trade-binder-${owner}.json`, snapshot);
  setTradeMessage("exported");
}

async function importTradeBinder(file) {
  try {
    if (!file || file.size > 2_000_000) throw new Error("size");
    const binder = sanitizeTradeBinder(JSON.parse(await file.text()));
    tradeBinders = [binder, ...tradeBinders.filter((item) => item.shareId !== binder.shareId)].slice(0, 20);
    activeTradeBinderId = binder.shareId;
    tradeProposalCards.clear();
    saveTradeBinders();
    setTradeMessage("imported");
    renderTradeInspector();
  } catch (error) {
    setTradeMessage(error.message === "expired" ? "expired" : "invalid", true);
  }
}

function exportTradeProposal() {
  if (!tradeProposalCards.size) {
    setTradeMessage("noProposal", true);
    return;
  }
  const binder = tradeBinders.find((item) => item.shareId === activeTradeBinderId);
  if (!binder) return;
  const local = localTradeCollection("all", true);
  const localMap = new Map(local.owned.map((card) => [card.id, card]));
  const remoteMap = new Map(binder.collection.owned.map((card) => [card.id, card]));
  const cardsFromOwner = [];
  const cardsFromGuest = [];
  tradeProposalCards.forEach((key) => {
    const separator = key.indexOf(":");
    const direction = key.slice(0, separator);
    const id = key.slice(separator + 1);
    const card = direction === "receive" ? remoteMap.get(id) : localMap.get(id);
    if (!card) return;
    (direction === "receive" ? cardsFromGuest : cardsFromOwner).push({ ...card, quantity: 1 });
  });
  const proposal = {
    schema: TRADE_PROPOSAL_SCHEMA,
    proposalId: syncRandomId("proposal"),
    createdAt: new Date().toISOString(),
    status: "draft",
    parties: { owner: collectorDisplayName(), guest: binder.owner.displayName },
    sourceShareId: binder.shareId,
    cardsFromOwner,
    cardsFromGuest,
    note: "Draft only. No collection quantities have been changed.",
  };
  downloadTradeJson("cardedex-trade-proposal.json", proposal);
  setTradeMessage("");
}

function applyTradeLanguage() {
  const da = state.settings.language === "da";
  const labels = {
    tradeBinderKicker: da ? "Deling af samling" : "Collection sharing",
    tradeBinderTitle: "Trade Binder",
    tradeReadonlyLabel: da ? "Importerede samlinger er skrivebeskyttede" : "Imported binders stay read-only",
    tradeBinderIntro: da ? "Eksportér et privat øjebliksbillede, inspicér en anden samling, og find handler uden at sammenflette samlingerne." : "Export a private collection snapshot, inspect someone else's binder, and find useful trades without merging either collection.",
    tradeScopeLabel: da ? "Del" : "Share",
    tradeExpiryLabel: da ? "Udløber" : "Expires",
    tradeWishlistLabel: da ? "Medtag ønskeliste til matchning" : "Include wishlist for matching",
    tradeExportShare: da ? "Eksportér min Trade Binder" : "Export my Trade Binder",
    tradeImportShare: da ? "Inspicér en andens" : "Inspect someone else's",
  };
  Object.entries(labels).forEach(([id, value]) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = value;
  });
  renderTradeBinder();
}

function initializeTradeBinder() {
  const section = document.querySelector(".trade-binder");
  if (!section || section.dataset.ready) return;
  section.dataset.ready = "true";
  document.querySelector("#tradeShareScope").addEventListener("change", renderTradeSelectedCards);
  document.querySelector("#tradeExportShare").addEventListener("click", exportTradeBinder);
  document.querySelector("#tradeImportShare").addEventListener("click", () => document.querySelector("#tradeImportFile").click());
  document.querySelector("#tradeImportFile").addEventListener("change", (event) => {
    if (event.target.files[0]) importTradeBinder(event.target.files[0]);
    event.target.value = "";
  });
  section.addEventListener("change", (event) => {
    if (event.target.matches("[data-trade-select]")) {
      event.target.checked
        ? tradeSelectedCards.add(event.target.dataset.tradeSelect)
        : tradeSelectedCards.delete(event.target.dataset.tradeSelect);
    } else if (event.target.matches("#activeTradeBinder")) {
      activeTradeBinderId = event.target.value;
      tradeProposalCards.clear();
      renderTradeInspector();
    } else if (event.target.matches("[data-proposal-card]")) {
      event.target.checked
        ? tradeProposalCards.add(event.target.dataset.proposalCard)
        : tradeProposalCards.delete(event.target.dataset.proposalCard);
    }
  });
  section.addEventListener("input", (event) => {
    if (event.target.matches("#tradeRemoteSearch")) {
      tradeRemoteQuery = event.target.value;
      renderTradeInspector();
      const search = document.querySelector("#tradeRemoteSearch");
      search?.focus();
      search?.setSelectionRange(tradeRemoteQuery.length, tradeRemoteQuery.length);
    }
  });
  section.addEventListener("click", (event) => {
    if (event.target.closest("[data-remove-trade-binder]")) {
      tradeBinders = tradeBinders.filter((item) => item.shareId !== activeTradeBinderId);
      activeTradeBinderId = tradeBinders[0]?.shareId || "";
      tradeProposalCards.clear();
      saveTradeBinders();
      renderTradeInspector();
    } else if (event.target.closest("[data-export-proposal]")) {
      exportTradeProposal();
    }
  });
  applyTradeLanguage();
}

initializeTradeBinder();
