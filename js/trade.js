const TRADE_BINDER_STORAGE_KEY = "cardedex-trade-binders";
const TRADE_PROFILE_STORAGE_KEY = "cardedex-trade-profile";
const APPLIED_TRADE_STORAGE_KEY = "cardedex-applied-trades";
const TRADE_BINDER_SCHEMA = "cardedex-trade-binder/v1";
const TRADE_PROPOSAL_SCHEMA = "cardedex-trade-proposal/v1";
const TRADE_SHARE_CODE_PREFIX = "CDX1.";
const TRADE_SHARE_CODE_LIMIT = 8000;
const TRADE_SHARE_INPUT_LIMIT = 1_000_000;
const tradeSelectedCards = new Set();
const tradeProposalCards = new Set();
let activeTradeBinderId = "";
let tradeRemoteQuery = "";
let tradeRemoteVisible = 36;
let tradeRemoteOpen = false;
let outgoingTradeBinder = null;
let activeTradeProposal = null;
let activeTradeProposalEditable = false;
let activeTradeSide = "";
let tradeReconcileOpen = false;
let tradeQrOpen = false;
const tradeCardDetails = new Map();
let tradeHydrationPromise = null;

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
    proposal: da ? "Gennemse handelsforslag" : "Review trade offer",
    remove: da ? "Fjern delt samling" : "Remove shared collection",
    selectCards: da ? "Vælg kort, der skal deles" : "Choose cards to share",
    nothingSelected: da ? "Vælg mindst ét kort først." : "Choose at least one card first.",
    exported: da ? "Trade Binder eksporteret. Send JSON-filen til den anden samler." : "Trade Binder exported. Send the JSON file to the other collector.",
    previewReady: da ? "Forhåndsvisningen er klar. Intet er blevet sendt endnu." : "Preview ready. Nothing has been sent yet.",
    shared: da ? "Den delte fil er sendt." : "Shared file sent.",
    codeShared: da ? "Importkoden er delt." : "Import code shared.",
    codeCopied: da ? "Importkoden er kopieret." : "Import code copied.",
    codeReady: da ? "Importkoden er klar til at kopiere." : "Import code ready to copy.",
    codeTooLarge: da ? "Samlingen er for stor til en pålidelig importkode. Del filen i stedet." : "This collection is too large for a reliable import code. Share the file instead.",
    showQr: da ? "Vis QR-kode" : "Show QR code",
    hideQr: da ? "Skjul QR-kode" : "Hide QR code",
    qrUnavailable: da ? "QR er ikke tilgængelig for dette forslag ({size}/{limit} bytes). Brug importkoden eller filen." : "QR is unavailable for this offer ({size}/{limit} bytes). Use the import code or file.",
    qrHint: da ? "Scan på den anden enhed · {size}/{limit} bytes" : "Scan on the other device · {size}/{limit} bytes",
    saved: da ? "Den delte fil er gemt på denne enhed." : "Shared file saved on this device.",
    imported: da ? "Trade Binder importeret som skrivebeskyttet samling." : "Trade Binder imported as a read-only collection.",
    offerImported: da ? "Handelsforslag åbnet som skrivebeskyttet forhåndsvisning." : "Trade offer opened as a read-only preview.",
    invalid: da ? "Filen er ikke en gyldig eller understøttet Trade Binder." : "That file is not a valid supported Trade Binder.",
    expired: da ? "Denne Trade Binder er udløbet." : "This Trade Binder has expired.",
    noProposal: da ? "Vælg mindst ét kort til handelsforslaget." : "Choose at least one card for the trade proposal.",
    offerDraft: da ? "Udkast · ingen kort eller antal er blevet ændret" : "Draft · no cards or quantities have been changed",
    collectionPreview: da ? "Skrivebeskyttet forhåndsvisning · din lokale samling ændres ikke" : "Read-only preview · your local collection is unchanged",
    gives: da ? "giver" : "gives",
    shareSave: da ? "Del eller gem fil" : "Share or save file",
    closePreview: da ? "Luk forhåndsvisning" : "Close preview",
    offerNote: da ? "Valgfri note" : "Optional note",
    afterTrade: da ? "Efter den fysiske handel" : "After the physical trade",
    whoAreYou: da ? "Hvem er du?" : "Which collector are you?",
    chooseCollector: da ? "Vælg dit navn" : "Choose your name",
    reviewChanges: da ? "Gennemse ændringer i min samling" : "Review my collection changes",
    removeCopies: da ? "Fjern {count}" : "Remove {count}",
    addCopies: da ? "Tilføj {count}" : "Add {count}",
    beforeAfter: da ? "{before} → {after} kopier" : "{before} → {after} copies",
    notEnough: da ? "Du har kun {have} af {name}, men forslaget kræver {need}." : "You only have {have} of {name}, but the offer requires {need}.",
    applyTrade: da ? "Opdatér min lokale samling" : "Update my local collection",
    applyConfirm: da ? "Er den fysiske handel afsluttet? Dette opdaterer kun din lokale samling." : "Has the physical trade happened? This updates only your local collection.",
    applied: da ? "Din lokale samling er opdateret efter handelen." : "Your local collection was updated after the trade.",
    alreadyApplied: da ? "Denne handel er allerede anvendt på denne enhed." : "This trade has already been applied on this device.",
    copies: da ? "kopier" : "copies",
    printing: da ? "tryk" : "printing",
  };
  return String(table[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function tradeRandomId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function readTradeProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(TRADE_PROFILE_STORAGE_KEY) || "{}");
    return { displayName: tradeSafeText(value.displayName || "", 40) };
  } catch {
    return { displayName: "" };
  }
}

function collectorDisplayName() {
  return readTradeProfile().displayName || (state.settings.language === "da" ? "Kortsamler" : "Card collector");
}

function saveTradeProfile(displayName) {
  const profile = { displayName: tradeSafeText(displayName, 40) };
  localStorage.setItem(TRADE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

function readAppliedTradeIds() {
  try {
    const values = JSON.parse(localStorage.getItem(APPLIED_TRADE_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string").slice(-200) : []);
  } catch {
    return new Set();
  }
}

function rememberAppliedTrade(proposalId) {
  const values = [...readAppliedTradeIds(), proposalId].slice(-200);
  localStorage.setItem(APPLIED_TRADE_STORAGE_KEY, JSON.stringify([...new Set(values)]));
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
  const card = state.collectionCards.find((item) => item.id === id) || tradeCardDetails.get(id);
  return {
    id,
    name: tradeSafeText(card?.name || id),
    localId: tradeSafeText(card?.localId || "", 30),
    setName: tradeSafeText(card?.set?.name || card?.series || ""),
    series: tradeSafeText(card?.series || ""),
  };
}

function tradeDisplayCard(card) {
  const detail = tradeCardDetails.get(card.id) ||
    state.collectionCards.find((item) => item.id === card.id);
  if (!detail) return card;
  return {
    ...card,
    name: detail.name || card.name,
    localId: detail.localId || card.localId,
    setName: detail.set?.name || detail.setName || card.setName,
    series: detail.series || detail.set?.serie?.name || card.series,
  };
}

function tradeCardArtwork(card) {
  const detail = tradeCardDetails.get(card.id) ||
    state.collectionCards.find((item) => item.id === card.id) || card;
  const candidate = {
    ...detail,
    id: card.id,
    localId: detail.localId || card.localId,
    setCode: detail.setCode || detail.set?.id || setCode(card.id),
  };
  return cardImageUrl(candidate, "low");
}

function tradeCardVisual(card) {
  const display = tradeDisplayCard(card);
  const artwork = tradeCardArtwork(display);
  return `<button type="button" class="trade-card-visual" data-trade-card-open="${escapeHtml(display.id)}"><span class="trade-card-thumb">${artwork ? `<img loading="lazy" src="${escapeHtml(artwork)}" alt="${escapeHtml(display.name || display.id)}">` : ""}</span><span><strong>${escapeHtml(display.name || display.id)}</strong><small>${escapeHtml([display.setName, display.localId ? `#${display.localId}` : ""].filter(Boolean).join(" · ") || display.id)}</small></span></button>`;
}

function tradeCardsForHydration() {
  const cards = [
    ...Object.keys(state.cardStates).map((id) => ({ id })),
    ...tradeBinders.flatMap((binder) => [...binder.collection.owned, ...binder.collection.wanted]),
    ...(outgoingTradeBinder ? [...outgoingTradeBinder.collection.owned, ...outgoingTradeBinder.collection.wanted] : []),
    ...(activeTradeProposal ? [...activeTradeProposal.cardsFromOwner, ...activeTradeProposal.cardsFromGuest] : []),
  ];
  return [...new Map(cards.map((card) => [card.id, card])).values()].slice(0, 500);
}

async function hydrateTradeCardArtwork() {
  if (tradeHydrationPromise) return tradeHydrationPromise;
  const queue = tradeCardsForHydration().filter((card) =>
    !tradeCardDetails.has(card.id) &&
    !state.collectionCards.some((item) => item.id === card.id)
  );
  if (!queue.length) return;
  tradeHydrationPromise = Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const card = queue.shift();
      try {
        const detail = prepareCollectionCard(await getJson(
          `${TCG_API}/cards/${encodeURIComponent(card.id)}`,
          true,
          true,
        ));
        tradeCardDetails.set(card.id, detail);
      } catch {}
    }
  })).finally(() => {
    tradeHydrationPromise = null;
  });
  await tradeHydrationPromise;
  renderTradeBinder();
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
    shareId: tradeRandomId("share"),
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

function sanitizeTradeOfferCard(value) {
  const card = sanitizeTradeCard(value, true);
  if (card) delete card.printings;
  return card;
}

function sanitizeTradeProposal(value) {
  if (!value || value.schema !== TRADE_PROPOSAL_SCHEMA) throw new Error("schema");
  const proposalId = tradeSafeText(value.proposalId, 100);
  if (!proposalId) throw new Error("id");
  const createdAt = new Date(value.createdAt);
  const cardsFromOwner = Array.isArray(value.cardsFromOwner)
    ? value.cardsFromOwner.slice(0, 1000).map(sanitizeTradeOfferCard).filter(Boolean)
    : [];
  const cardsFromGuest = Array.isArray(value.cardsFromGuest)
    ? value.cardsFromGuest.slice(0, 1000).map(sanitizeTradeOfferCard).filter(Boolean)
    : [];
  if (!cardsFromOwner.length && !cardsFromGuest.length) throw new Error("cards");
  return {
    schema: TRADE_PROPOSAL_SCHEMA,
    proposalId,
    createdAt: Number.isFinite(createdAt.getTime())
      ? createdAt.toISOString()
      : new Date().toISOString(),
    status: "draft",
    parties: {
      owner: tradeSafeText(value.parties?.owner || "Card collector", 40),
      guest: tradeSafeText(value.parties?.guest || "Card collector", 40),
    },
    sourceShareId: tradeSafeText(value.sourceShareId, 100),
    cardsFromOwner,
    cardsFromGuest,
    note: tradeSafeText(value.note, 240),
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

function buildTradeReconciliation(proposal, side, collection = state, appliedIds = readAppliedTradeIds()) {
  if (!proposal || !["owner", "guest"].includes(side)) throw new Error("side");
  const outgoing = side === "owner" ? proposal.cardsFromOwner : proposal.cardsFromGuest;
  const incoming = side === "owner" ? proposal.cardsFromGuest : proposal.cardsFromOwner;
  const deltas = new Map();
  const metadata = new Map();
  outgoing.forEach((card) => {
    deltas.set(card.id, (deltas.get(card.id) || 0) - card.quantity);
    metadata.set(card.id, card);
  });
  incoming.forEach((card) => {
    deltas.set(card.id, (deltas.get(card.id) || 0) + card.quantity);
    metadata.set(card.id, card);
  });
  const errors = [];
  const changes = [...deltas].filter(([, delta]) => delta !== 0).map(([id, delta]) => {
    const before = collection.cardStates[id] === "owned"
      ? Math.max(1, Number(collection.cardCounts[id]) || 1)
      : 0;
    const card = metadata.get(id);
    if (before + delta < 0) {
      errors.push(tradeT("notEnough", {
        have: before,
        need: Math.abs(delta),
        name: card.name || id,
      }));
    }
    return {
      id,
      name: card.name || id,
      setName: card.setName || "",
      delta,
      before,
      after: Math.max(0, before + delta),
    };
  });
  return {
    proposalId: proposal.proposalId,
    side,
    collectorName: proposal.parties[side],
    changes,
    errors,
    alreadyApplied: appliedIds.has(proposal.proposalId),
  };
}

function applyTradeReconciliation(plan, collection = state) {
  if (!plan || plan.alreadyApplied || plan.errors.length) throw new Error("invalid-plan");
  plan.changes.forEach((change) => {
    if (change.after <= 0) {
      delete collection.cardStates[change.id];
      delete collection.cardCounts[change.id];
      delete collection.cardPrintVariants[change.id];
      delete collection.cardOwnedVariants[change.id];
      return;
    }
    if (change.before === 0) {
      delete collection.cardPrintVariants[change.id];
      delete collection.cardOwnedVariants[change.id];
    }
    collection.cardStates[change.id] = "owned";
    collection.cardCounts[change.id] = change.after;
  });
  return collection;
}

function tradeEpoch(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
}

function compactTradePayload(value) {
  if (value?.schema === TRADE_BINDER_SCHEMA) {
    return {
      v: 1,
      k: "b",
      i: value.shareId,
      c: tradeEpoch(value.createdAt),
      e: value.expiresAt ? tradeEpoch(value.expiresAt) : 0,
      n: value.owner?.displayName || "",
      s: value.scope === "duplicates" ? "d" : value.scope === "selected" ? "s" : "a",
      o: (value.collection?.owned || []).map((card) => [card.id, card.quantity || 1]),
      w: (value.collection?.wanted || []).map((card) => card.id),
    };
  }
  if (value?.schema === TRADE_PROPOSAL_SCHEMA) {
    return {
      v: 1,
      k: "o",
      i: value.proposalId,
      c: tradeEpoch(value.createdAt),
      n: [value.parties?.owner || "", value.parties?.guest || ""],
      a: (value.cardsFromOwner || []).map((card) => [card.id, card.quantity || 1]),
      b: (value.cardsFromGuest || []).map((card) => [card.id, card.quantity || 1]),
      m: value.note || "",
    };
  }
  throw new Error("schema");
}

function expandTradePayload(payload) {
  if (!payload || payload.v !== 1) throw new Error("schema");
  const date = (seconds) => seconds ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
  const card = (entry) => ({
    id: Array.isArray(entry) ? entry[0] : entry,
    name: Array.isArray(entry) ? entry[0] : entry,
    quantity: Array.isArray(entry) ? entry[1] : 1,
  });
  if (payload.k === "b") {
    return {
      schema: TRADE_BINDER_SCHEMA,
      shareId: payload.i,
      createdAt: date(payload.c),
      expiresAt: payload.e ? date(payload.e) : null,
      owner: { displayName: payload.n },
      scope: payload.s === "d" ? "duplicates" : payload.s === "s" ? "selected" : "all",
      collection: {
        owned: Array.isArray(payload.o) ? payload.o.slice(0, 10000).map(card) : [],
        wanted: Array.isArray(payload.w) ? payload.w.slice(0, 10000).map(card) : [],
      },
    };
  }
  if (payload.k === "o") {
    return {
      schema: TRADE_PROPOSAL_SCHEMA,
      proposalId: payload.i,
      createdAt: date(payload.c),
      status: "draft",
      parties: {
        owner: Array.isArray(payload.n) ? payload.n[0] : "",
        guest: Array.isArray(payload.n) ? payload.n[1] : "",
      },
      sourceShareId: payload.s,
      cardsFromOwner: Array.isArray(payload.a) ? payload.a.slice(0, 1000).map(card) : [],
      cardsFromGuest: Array.isArray(payload.b) ? payload.b.slice(0, 1000).map(card) : [],
      note: payload.m,
    };
  }
  throw new Error("schema");
}

function tradeBase64Encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function tradeBase64Decode(value) {
  const encoded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeTradeShareCode(value) {
  return `${TRADE_SHARE_CODE_PREFIX}${tradeBase64Encode(JSON.stringify(compactTradePayload(value)))}`;
}

function decodeTradeShareCode(input) {
  const text = String(input || "").trim();
  if (!text || text.length > TRADE_SHARE_INPUT_LIMIT) throw new Error("size");
  const marker = text.includes("#trade/share/") ? text.split("#trade/share/").pop() : text;
  const code = decodeURIComponent(marker.trim());
  if (!code.startsWith(TRADE_SHARE_CODE_PREFIX)) throw new Error("schema");
  return expandTradePayload(JSON.parse(tradeBase64Decode(code.slice(TRADE_SHARE_CODE_PREFIX.length))));
}

function createTradeShareLink(value, base = globalThis.location?.href || "") {
  const root = String(base).split("#")[0];
  return `${root}#trade/share/${encodeTradeShareCode(value)}`;
}

function tradeOfferQrData(offer) {
  const code = encodeTradeShareCode(offer);
  const byteLength = new TextEncoder().encode(code).length;
  const maxBytes = globalThis.CardedexQr?.MAX_BYTES || 0;
  return {
    code,
    byteLength,
    maxBytes,
    available: Boolean(maxBytes && byteLength <= maxBytes),
  };
}

function updateTradeQrAvailability() {
  if (!activeTradeProposal) return;
  const qr = tradeOfferQrData(activeTradeProposal);
  const button = document.querySelector("[data-show-offer-qr]");
  const status = document.querySelector(".trade-qr-unavailable");
  tradeQrOpen = false;
  document.querySelector(".trade-offer-qr")?.remove();
  if (button) {
    button.hidden = !qr.available;
    button.setAttribute("aria-expanded", "false");
    button.textContent = tradeT("showQr");
  }
  if (status) {
    status.hidden = qr.available;
    status.textContent = tradeT("qrUnavailable", { size: qr.byteLength, limit: qr.maxBytes || 0 });
  }
}

function downloadTradeJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function shareOrDownloadTradeJson(filename, value) {
  const content = JSON.stringify(value, null, 2);
  if (typeof File === "function" && navigator.share) {
    const file = new File([content], filename, { type: "application/json" });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Cardédex" });
        setTradeMessage("shared");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
  }
  downloadTradeJson(filename, value);
  setTradeMessage("saved");
}

async function copyTradeText(text) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function showTradeShareDialog(code) {
  const dialog = document.querySelector("#tradeShareDialog");
  const output = document.querySelector("#tradeShareOutput");
  if (!dialog || !output) return;
  output.value = code;
  if (!dialog.open) dialog.showModal();
  output.focus();
  output.select();
}

async function shareTradeCode(value) {
  const code = encodeTradeShareCode(value);
  if (code.length > TRADE_SHARE_CODE_LIMIT) {
    setTradeMessage("codeTooLarge", true);
    return false;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "Cardédex import code", text: code });
      setTradeMessage("codeShared");
      return true;
    } catch (error) {
      if (error?.name === "AbortError") return false;
    }
  }
  if (await copyTradeText(code)) {
    setTradeMessage("codeCopied");
    return true;
  }
  showTradeShareDialog(code);
  setTradeMessage("codeReady");
  return true;
}

function acceptTradeValue(value) {
  if (value.schema === TRADE_BINDER_SCHEMA) {
    const binder = sanitizeTradeBinder(value);
    tradeBinders = [binder, ...tradeBinders.filter((item) => item.shareId !== binder.shareId)].slice(0, 20);
    activeTradeBinderId = binder.shareId;
    tradeRemoteQuery = "";
    tradeRemoteVisible = 36;
    tradeRemoteOpen = false;
    tradeProposalCards.clear();
    saveTradeBinders();
    setTradeMessage("imported");
    renderTradeInspector();
    hydrateTradeCardArtwork();
    return binder;
  }
  if (value.schema === TRADE_PROPOSAL_SCHEMA) {
    activeTradeProposal = sanitizeTradeProposal(value);
    activeTradeProposalEditable = false;
    activeTradeSide = inferredTradeSide(activeTradeProposal);
    tradeReconcileOpen = false;
    tradeQrOpen = false;
    setTradeMessage("offerImported");
    renderTradeOffer();
    hydrateTradeCardArtwork();
    return activeTradeProposal;
  }
  throw new Error("schema");
}

function importTradeCode(input) {
  try {
    const result = acceptTradeValue(decodeTradeShareCode(input));
    const field = document.querySelector("#tradeImportCode");
    if (field) field.value = "";
    return result;
  } catch (error) {
    setTradeMessage(error.message === "expired" ? "expired" : "invalid", true);
    return null;
  }
}

function consumeTradeShareHash() {
  if (!globalThis.location?.hash?.startsWith("#trade/share/")) return false;
  const result = importTradeCode(globalThis.location.hash);
  if (result && globalThis.history?.replaceState) {
    globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${globalThis.location.search}#trade`);
  }
  return Boolean(result);
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
    return `<div class="trade-select-row"><input type="checkbox" data-trade-select="${escapeHtml(id)}" ${tradeSelectedCards.has(id) ? "checked" : ""}>${tradeCardVisual(card)}</div>`;
  }).join("");
  container.lastElementChild.innerHTML = list || `<p>${escapeHtml(tradeT("noCards"))}</p>`;
}

function tradeCardRows(cards, direction = "", limit = 60) {
  return cards.slice(0, limit).map((card) => {
    const key = direction ? `${direction}:${card.id}` : "";
    const checkbox = direction
      ? `<input type="checkbox" data-proposal-card="${escapeHtml(key)}" ${tradeProposalCards.has(key) ? "checked" : ""}>`
      : "";
    const quantity = card.quantity > 1 ? `<b>${card.quantity} ${escapeHtml(tradeT("copies"))}</b>` : "";
    return `<div class="trade-card-row">${checkbox}${tradeCardVisual(card)}${quantity}</div>`;
  }).join("") || `<p class="trade-empty">${escapeHtml(tradeT("noCards"))}</p>`;
}

function tradeCardGrid(cards, direction = "", limit = 36) {
  return `<div class="trade-card-grid">${tradeCardRows(cards, direction, limit)}</div>`;
}

function tradeOfferCardRows(cards, side, editable) {
  return cards.map((card) => {
    const quantity = editable
      ? `<label class="trade-offer-quantity"><span class="sr-only">${escapeHtml(tradeT("copies"))}</span><input type="number" min="1" max="999" value="${card.quantity}" data-offer-quantity data-offer-side="${side}" data-card-id="${escapeHtml(card.id)}"></label>`
      : `<b>${card.quantity} ×</b>`;
    return `<div class="trade-card-row">${tradeCardVisual(card)}${quantity}</div>`;
  }).join("") || `<p class="trade-empty">${escapeHtml(tradeT("noCards"))}</p>`;
}

function inferredTradeSide(offer) {
  const localName = collectorDisplayName().trim().toLowerCase();
  if (!localName) return "";
  const matches = ["owner", "guest"].filter((side) =>
    offer.parties[side].trim().toLowerCase() === localName
  );
  return matches.length === 1 ? matches[0] : "";
}

function tradeReconciliationMarkup(offer) {
  if (!activeTradeSide || !tradeReconcileOpen) return "";
  const plan = buildTradeReconciliation(offer, activeTradeSide);
  if (plan.alreadyApplied) {
    return `<p class="trade-reconcile-result">${escapeHtml(tradeT("alreadyApplied"))}</p>`;
  }
  const rows = plan.changes.map((change) => `<li class="${change.delta < 0 ? "remove" : "add"}"><strong>${escapeHtml(change.name)}</strong><span>${escapeHtml(tradeT(change.delta < 0 ? "removeCopies" : "addCopies", { count: Math.abs(change.delta) }))} · ${escapeHtml(tradeT("beforeAfter", { before: change.before, after: change.after }))}</span></li>`).join("");
  const errors = plan.errors.map((message) => `<p class="trade-reconcile-error">${escapeHtml(message)}</p>`).join("");
  return `<div class="trade-reconcile-preview"><ul>${rows}</ul>${errors}<button type="button" data-apply-trade ${plan.errors.length || !plan.changes.length ? "disabled" : ""}>${escapeHtml(tradeT("applyTrade"))}</button></div>`;
}

function renderOutgoingTradeBinder() {
  const container = document.querySelector("#tradeOutgoing");
  if (!container) return;
  container.hidden = !outgoingTradeBinder;
  if (!outgoingTradeBinder) {
    container.innerHTML = "";
    return;
  }
  const binder = outgoingTradeBinder;
  const copies = binder.collection.owned.reduce((sum, card) => sum + card.quantity, 0);
  const expiry = binder.expiresAt
    ? new Date(binder.expiresAt).toLocaleDateString(state.settings.language)
    : (state.settings.language === "da" ? "Udløber ikke" : "No expiry");
  container.innerHTML = `<div class="trade-preview-heading"><div><span>${escapeHtml(state.settings.language === "da" ? "Din delte samling" : "Your shared collection")}</span><h4>${escapeHtml(binder.owner.displayName)}</h4></div><button type="button" data-close-binder-preview aria-label="${escapeHtml(tradeT("closePreview"))}">×</button></div>
    <p class="trade-preview-note">${escapeHtml(expiry)} · ${escapeHtml(tradeT("collectionPreview"))}</p>
    <div class="trade-summary"><div><strong>${binder.collection.owned.length}</strong><span>${escapeHtml(tradeT("owned"))}</span></div><div><strong>${copies}</strong><span>${escapeHtml(tradeT("copies"))}</span></div><div><strong>${binder.collection.wanted.length}</strong><span>${escapeHtml(tradeT("wanted"))}</span></div></div>
    <div class="trade-preview-columns"><section><h4>${escapeHtml(state.settings.language === "da" ? "Kort du deler" : "Cards you share")}</h4>${tradeCardGrid(binder.collection.owned, "", 12)}${binder.collection.owned.length > 12 ? `<p class="trade-limit">12 / ${binder.collection.owned.length}</p>` : ""}</section><section><h4>${escapeHtml(state.settings.language === "da" ? "Ønskeliste" : "Wishlist")}</h4>${tradeCardGrid(binder.collection.wanted, "", 12)}${binder.collection.wanted.length > 12 ? `<p class="trade-limit">12 / ${binder.collection.wanted.length}</p>` : ""}</section></div>
    <div class="trade-preview-actions"><button type="button" class="trade-proposal-button" data-share-binder>${escapeHtml(state.settings.language === "da" ? "Del importkode" : "Share import code")}</button><button type="button" data-download-binder>${escapeHtml(state.settings.language === "da" ? "Download fil" : "Download file")}</button></div>`;
}

function renderTradeOffer() {
  const container = document.querySelector("#tradeOfferInspector");
  if (!container) return;
  container.hidden = !activeTradeProposal;
  if (!activeTradeProposal) {
    container.innerHTML = "";
    return;
  }
  const offer = activeTradeProposal;
  if (!activeTradeSide) activeTradeSide = inferredTradeSide(offer);
  const note = activeTradeProposalEditable
    ? `<label class="trade-offer-note"><span>${escapeHtml(tradeT("offerNote"))}</span><textarea maxlength="240" data-offer-note placeholder="${escapeHtml(tradeT("offerNote"))}">${escapeHtml(offer.note)}</textarea></label>`
    : (offer.note ? `<p class="trade-offer-note-readonly">${escapeHtml(offer.note)}</p>` : "");
  const qr = tradeOfferQrData(offer);
  if (!qr.available) tradeQrOpen = false;
  const qrButton = `<button type="button" data-show-offer-qr aria-expanded="${tradeQrOpen}" ${qr.available ? "" : "hidden"}>${escapeHtml(tradeT(tradeQrOpen ? "hideQr" : "showQr"))}</button>`;
  const qrStatus = `<p class="trade-qr-unavailable" ${qr.available ? "hidden" : ""}>${escapeHtml(tradeT("qrUnavailable", { size: qr.byteLength, limit: qr.maxBytes || 0 }))}</p>`;
  const qrMarkup = tradeQrOpen && qr.available
    ? `<div class="trade-offer-qr"><div>${globalThis.CardedexQr.toSvg(qr.code)}</div><p>${escapeHtml(tradeT("qrHint", { size: qr.byteLength, limit: qr.maxBytes }))}</p></div>`
    : "";
  container.innerHTML = `<div class="trade-preview-heading"><div><span>${escapeHtml(state.settings.language === "da" ? "Handelsforslag" : "Trade offer")}</span><h4>${escapeHtml(offer.parties.owner)} ↔ ${escapeHtml(offer.parties.guest)}</h4></div><button type="button" data-close-offer-preview aria-label="${escapeHtml(tradeT("closePreview"))}">×</button></div>
    <p class="trade-preview-note">${escapeHtml(tradeT("offerDraft"))}</p>
    <div class="trade-preview-columns"><section><h4>${escapeHtml(offer.parties.owner)} ${escapeHtml(tradeT("gives"))}</h4><div class="trade-card-grid trade-offer-grid">${tradeOfferCardRows(offer.cardsFromOwner, "owner", activeTradeProposalEditable)}</div></section><section><h4>${escapeHtml(offer.parties.guest)} ${escapeHtml(tradeT("gives"))}</h4><div class="trade-card-grid trade-offer-grid">${tradeOfferCardRows(offer.cardsFromGuest, "guest", activeTradeProposalEditable)}</div></section></div>
    ${note}
    <div class="trade-preview-actions"><button type="button" class="trade-proposal-button" data-share-offer>${escapeHtml(state.settings.language === "da" ? "Del importkode" : "Share import code")}</button>${qrButton}<button type="button" data-download-offer>${escapeHtml(state.settings.language === "da" ? "Download fil" : "Download file")}</button></div>${qrStatus}${qrMarkup}
    <section class="trade-reconcile"><h4>${escapeHtml(tradeT("afterTrade"))}</h4><p>${escapeHtml(tradeT("offerDraft"))}</p><label><span>${escapeHtml(tradeT("whoAreYou"))}</span><select id="tradeReconcileSide"><option value="">${escapeHtml(tradeT("chooseCollector"))}</option><option value="owner" ${activeTradeSide === "owner" ? "selected" : ""}>${escapeHtml(offer.parties.owner)}</option><option value="guest" ${activeTradeSide === "guest" ? "selected" : ""}>${escapeHtml(offer.parties.guest)}</option></select></label><button type="button" data-review-trade ${activeTradeSide ? "" : "disabled"}>${escapeHtml(tradeT("reviewChanges"))}</button>${tradeReconciliationMarkup(offer)}</section>`;
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
    <div class="trade-match-grid"><section><h4>${escapeHtml(tradeT("receive"))}</h4>${tradeCardGrid(comparison.receiveWanted, "receive", 24)}</section><section><h4>${escapeHtml(tradeT("give"))}</h4>${tradeCardGrid(comparison.giveWanted, "give", 24)}</section></div>
    <button type="button" class="trade-proposal-button" data-export-proposal>${escapeHtml(tradeT("proposal"))}</button>
    <details class="trade-missing"><summary>${escapeHtml(tradeT("missing"))} · ${comparison.receiveMissing.length}</summary>${tradeCardGrid(comparison.receiveMissing, "", 36)}</details>
    <details class="trade-remote-list" ${tradeRemoteOpen ? "open" : ""}><summary>${escapeHtml(tradeT("inspect"))} · ${binder.collection.owned.length}</summary><input id="tradeRemoteSearch" type="search" value="${escapeHtml(tradeRemoteQuery)}" placeholder="${escapeHtml(tradeT("search"))}">${tradeCardGrid(visible, "", tradeRemoteVisible)}${visible.length > tradeRemoteVisible ? `<button type="button" class="trade-show-more" data-trade-more>${escapeHtml(state.settings.language === "da" ? "Vis 36 mere" : "Show 36 more")}</button>` : ""}<p class="trade-limit">${Math.min(visible.length, tradeRemoteVisible)} / ${visible.length}</p></details>`;
}

function renderTradeBinder() {
  renderTradeSelectedCards();
  renderOutgoingTradeBinder();
  renderTradeInspector();
  renderTradeOffer();
}

function openTradePage() {
  renderTradeBinder();
  hydrateTradeCardArtwork();
}

function currentTradeBinderSnapshot() {
  const scope = document.querySelector("#tradeShareScope").value;
  if (scope === "selected" && !tradeSelectedCards.size) {
    setTradeMessage("nothingSelected", true);
    return null;
  }
  const expiry = Number(document.querySelector("#tradeShareExpiry").value) || 0;
  const includeWishlist = document.querySelector("#tradeIncludeWishlist").checked;
  return createTradeBinderSnapshot(scope, expiry, includeWishlist);
}

async function shareCurrentTradeBinder() {
  const binder = currentTradeBinderSnapshot();
  if (binder) await shareTradeCode(binder);
}

function previewTradeBinder() {
  const binder = currentTradeBinderSnapshot();
  if (!binder) return;
  outgoingTradeBinder = binder;
  renderOutgoingTradeBinder();
  hydrateTradeCardArtwork();
  setTradeMessage("previewReady");
}
async function importTradeFile(file) {
  try {
    if (!file || file.size > 2_000_000) throw new Error("size");
    acceptTradeValue(JSON.parse(await file.text()));
  } catch (error) {
    setTradeMessage(error.message === "expired" ? "expired" : "invalid", true);
  }
}

function previewTradeProposal() {
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
    proposalId: tradeRandomId("proposal"),
    createdAt: new Date().toISOString(),
    status: "draft",
    parties: { owner: collectorDisplayName(), guest: binder.owner.displayName },
    sourceShareId: binder.shareId,
    cardsFromOwner,
    cardsFromGuest,
    note: "",
  };
  activeTradeProposal = sanitizeTradeProposal(proposal);
  activeTradeProposalEditable = true;
  activeTradeSide = "owner";
  tradeReconcileOpen = false;
  tradeQrOpen = false;
  renderTradeOffer();
  hydrateTradeCardArtwork();
  setTradeMessage("previewReady");
}

function completeActiveTrade() {
  if (!activeTradeProposal || !activeTradeSide) return false;
  const plan = buildTradeReconciliation(activeTradeProposal, activeTradeSide);
  if (plan.alreadyApplied || plan.errors.length || !plan.changes.length) return false;
  if (!confirm(tradeT("applyConfirm"))) return false;
  applyTradeReconciliation(plan);
  rememberAppliedTrade(activeTradeProposal.proposalId);
  saveUser();
  plan.changes.filter((change) => change.delta > 0).forEach((change) => {
    if (typeof hydrateOwnedCard === "function") hydrateOwnedCard(change.id);
  });
  if (typeof renderCards === "function") renderCards();
  if (collectionDialog?.open && typeof showCollection === "function") showCollection();
  setTradeMessage("applied");
  renderTradeOffer();
  return true;
}

function applyTradeLanguage() {
  const da = state.settings.language === "da";
  const labels = {
    tradeNav: da ? "Byt" : "Trade",
    tradeBinderKicker: da ? "Deling af samling" : "Collection sharing",
    tradeBinderTitle: "Trade Binder",
    tradeReadonlyLabel: da ? "Importerede samlinger er skrivebeskyttede" : "Imported binders stay read-only",
    tradeBinderIntro: da ? "Eksportér et privat øjebliksbillede, inspicér en anden samling, og find handler uden at sammenflette samlingerne." : "Export a private collection snapshot, inspect someone else's binder, and find useful trades without merging either collection.",
    tradeCollectorNameLabel: da ? "Dit navn i delte filer" : "Your name in shared files",
    tradeScopeLabel: da ? "Del" : "Share",
    tradeExpiryLabel: da ? "Udløber" : "Expires",
    tradeWishlistLabel: da ? "Medtag ønskeliste til matchning" : "Include wishlist for matching",
    tradeShareCode: da ? "Del importkode" : "Share import code",
    tradeExportShare: da ? "Forhåndsvis min Trade Binder" : "Preview my Trade Binder",
    tradeImportShare: da ? "Åbn en delt fil" : "Open a shared file",
    tradeImportCodeSummary: da ? "Åbn en delt importkode" : "Open a shared import code",
    tradeImportCodeButton: da ? "Åbn delt indhold" : "Open shared item",
    tradeShareDialogTitle: da ? "Del importkode" : "Share import code",
    tradeShareDialogIntro: da ? "Send kun koden til den anden samler. Alle med koden kan åbne de delte kort." : "Send only this code to the other collector. Anyone with the code can open the shared cards.",
  };
  Object.entries(labels).forEach(([id, value]) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = value;
  });
  const name = document.querySelector("#tradeCollectorName");
  if (name) name.placeholder = da ? "Kortsamler" : "Card collector";
  const importCode = document.querySelector("#tradeImportCode");
  if (importCode) importCode.placeholder = da ? "Indsæt en CDX1-importkode" : "Paste a CDX1 import code";
  renderTradeBinder();
}

function initializeTradeBinder() {
  const section = document.querySelector(".trade-binder");
  if (!section || section.dataset.ready) return;
  section.dataset.ready = "true";
  const collectorName = document.querySelector("#tradeCollectorName");
  collectorName.value = readTradeProfile().displayName;
  collectorName.addEventListener("change", () => saveTradeProfile(collectorName.value));
  document.querySelector("#tradeShareScope").addEventListener("change", renderTradeSelectedCards);
  document.querySelector("#tradeShareCode").addEventListener("click", shareCurrentTradeBinder);
  document.querySelector("#tradeExportShare").addEventListener("click", previewTradeBinder);
  document.querySelector("#tradeImportShare").addEventListener("click", () => document.querySelector("#tradeImportFile").click());
  document.querySelector("#tradeImportFile").addEventListener("change", (event) => {
    if (event.target.files[0]) importTradeFile(event.target.files[0]);
    event.target.value = "";
  });
  document.querySelector("#tradeImportCodeButton").addEventListener("click", () => {
    importTradeCode(document.querySelector("#tradeImportCode").value);
  });
  document.querySelector("#tradeImportCode").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      importTradeCode(event.currentTarget.value);
    }
  });
  section.addEventListener("change", (event) => {
    if (event.target.matches("[data-trade-select]")) {
      event.target.checked
        ? tradeSelectedCards.add(event.target.dataset.tradeSelect)
        : tradeSelectedCards.delete(event.target.dataset.tradeSelect);
    } else if (event.target.matches("#activeTradeBinder")) {
      activeTradeBinderId = event.target.value;
      tradeRemoteQuery = "";
      tradeRemoteVisible = 36;
      tradeRemoteOpen = false;
      tradeProposalCards.clear();
      renderTradeInspector();
    } else if (event.target.matches("[data-proposal-card]")) {
      event.target.checked
        ? tradeProposalCards.add(event.target.dataset.proposalCard)
        : tradeProposalCards.delete(event.target.dataset.proposalCard);
    } else if (event.target.matches("[data-offer-quantity]") && activeTradeProposalEditable) {
      const cards = event.target.dataset.offerSide === "owner"
        ? activeTradeProposal.cardsFromOwner
        : activeTradeProposal.cardsFromGuest;
      const card = cards.find((item) => item.id === event.target.dataset.cardId);
      if (card) card.quantity = Math.min(999, Math.max(1, Number(event.target.value) || 1));
      renderTradeOffer();
    } else if (event.target.matches("#tradeReconcileSide")) {
      activeTradeSide = event.target.value;
      tradeReconcileOpen = false;
      renderTradeOffer();
    }
  });
  section.addEventListener("input", (event) => {
    if (event.target.matches("#tradeRemoteSearch")) {
      tradeRemoteQuery = event.target.value;
      tradeRemoteVisible = 36;
      tradeRemoteOpen = true;
      renderTradeInspector();
      const search = document.querySelector("#tradeRemoteSearch");
      search?.focus();
      search?.setSelectionRange(tradeRemoteQuery.length, tradeRemoteQuery.length);
    } else if (event.target.matches("[data-offer-note]") && activeTradeProposalEditable) {
      activeTradeProposal.note = tradeSafeText(event.target.value, 240);
      updateTradeQrAvailability();
    }
  });
  section.addEventListener("click", async (event) => {
    const cardButton = event.target.closest("[data-trade-card-open]");
    if (cardButton) {
      const card = tradeCardDetails.get(cardButton.dataset.tradeCardOpen) ||
        state.collectionCards.find((item) => item.id === cardButton.dataset.tradeCardOpen);
      if (card && typeof openCard === "function") openCard(card);
      return;
    }
    if (event.target.closest("[data-remove-trade-binder]")) {
      tradeBinders = tradeBinders.filter((item) => item.shareId !== activeTradeBinderId);
      activeTradeBinderId = tradeBinders[0]?.shareId || "";
      tradeRemoteQuery = "";
      tradeRemoteVisible = 36;
      tradeRemoteOpen = false;
      tradeProposalCards.clear();
      saveTradeBinders();
      renderTradeInspector();
    } else if (event.target.closest("[data-trade-more]")) {
      tradeRemoteVisible += 36;
      tradeRemoteOpen = true;
      renderTradeInspector();
    } else if (event.target.closest("[data-export-proposal]")) {
      previewTradeProposal();
    } else if (event.target.closest("[data-close-binder-preview]")) {
      outgoingTradeBinder = null;
      renderOutgoingTradeBinder();
    } else if (event.target.closest("[data-close-offer-preview]")) {
      activeTradeProposal = null;
      activeTradeProposalEditable = false;
      activeTradeSide = "";
      tradeReconcileOpen = false;
      tradeQrOpen = false;
      renderTradeOffer();
    } else if (event.target.closest("[data-share-binder]") && outgoingTradeBinder) {
      await shareTradeCode(outgoingTradeBinder);
    } else if (event.target.closest("[data-download-binder]") && outgoingTradeBinder) {
      const owner = outgoingTradeBinder.owner.displayName.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "collector";
      await shareOrDownloadTradeJson(`cardedex-trade-binder-${owner}.json`, outgoingTradeBinder);
    } else if (event.target.closest("[data-share-offer]") && activeTradeProposal) {
      await shareTradeCode(activeTradeProposal);
    } else if (event.target.closest("[data-show-offer-qr]") && activeTradeProposal) {
      const qr = tradeOfferQrData(activeTradeProposal);
      if (qr.available) {
        tradeQrOpen = !tradeQrOpen;
        renderTradeOffer();
      }
    } else if (event.target.closest("[data-download-offer]") && activeTradeProposal) {
      await shareOrDownloadTradeJson("cardedex-trade-offer.json", activeTradeProposal);
    } else if (event.target.closest("[data-copy-trade-share]")) {
      const output = document.querySelector("#tradeShareOutput");
      if (output && await copyTradeText(output.value)) {
        setTradeMessage("codeCopied");
        document.querySelector("#tradeShareDialog")?.close();
      } else {
        output?.focus();
        output?.select();
      }
    } else if (event.target.closest("[data-close-trade-share]")) {
      document.querySelector("#tradeShareDialog")?.close();
    } else if (event.target.closest("[data-review-trade]") && activeTradeProposal && activeTradeSide) {
      tradeReconcileOpen = true;
      renderTradeOffer();
    } else if (event.target.closest("[data-apply-trade]")) {
      completeActiveTrade();
    }
  });
  section.addEventListener("error", (event) => {
    const image = event.target.closest?.(".trade-card-thumb img");
    const id = image?.closest("[data-trade-card-open]")?.dataset.tradeCardOpen;
    const card = id && (tradeCardDetails.get(id) ||
      state.collectionCards.find((item) => item.id === id));
    if (image && card && typeof recoverCardImage === "function") {
      recoverCardImage(image, card, "low");
    }
  }, true);
  section.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".trade-remote-list")) {
      tradeRemoteOpen = event.target.open;
    }
  }, true);
  applyTradeLanguage();
  consumeTradeShareHash();
}

initializeTradeBinder();
