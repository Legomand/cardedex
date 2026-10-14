// QR-paired Android LAN transfer. Transport never imports or changes collections.
const nearbyDialog = document.querySelector("#nearbyDialog");
let nearbyOperation = 0;
let nearbyRole = "";
let nearbyPollTimer;
let nearbyScanTimer;
let nearbyCameraStream;
let nearbyPending = null;
let nearbyBusy = false;
let nearbyConnectionState = "";
let nearbyContext = "trade"; // Fail closed: restoring is available only from Backup.

function nearbyPlugin() {
  const capacitor = window.Capacitor;
  return capacitor?.isNativePlatform?.() ? capacitor.Plugins?.Nearby : null;
}

function nearbyT(key, values = {}) {
  const da = state.settings.language === "da";
  const table = {
    title: da ? "Overfør i nærheden" : "Nearby transfer",
    tradeTitle: da ? "Del kort i nærheden" : "Nearby card sharing",
    backupTitle: da ? "Overfør sikkerhedskopi" : "Nearby backup transfer",
    tradeScope: da ? "Kun læsning og gennemgang af kort. Din egen samling kan ikke erstattes her." : "Card inspection and trade review only. Your own collection cannot be replaced here.",
    backupScope: da ? "Kun fulde sikkerhedskopier. Gendannelse kan erstatte din samling efter bekræftelse." : "Full backups only. Restoring can replace your collection after confirmation.",
    inspection: da ? "Del min samling til inspektion" : "Share my collection for inspection",
    inspectionHint: da ? "Deler alle ejede kort uden at oprette en Trade Binder først. Ønskelisten medtages kun, hvis den er aktiveret på Handel-skærmen. Favoritter, mål og indstillinger deles ikke." : "Shares all owned cards without preparing a Trade Binder. Includes your wishlist only if enabled on the Trades screen. Favorites, goals and settings are not shared.",
    inspectionOwner: da ? "Delt samling" : "Shared collection",
    inspectReceived: da ? "Inspicér samlingen" : "Inspect collection",
    wrongMode: da ? "Dette indhold hører ikke til denne overførsel. Brug Handel til inspektion eller Backup til gendannelse." : "This item does not belong in this transfer. Use Trades for inspection or Backup for restoring.",
    intro: da ? "Begge enheder skal være på samme Wi-Fi eller telefon-hotspot. Hold denne skærm åben. Internet og LocalSend-appen er ikke nødvendige." : "Both devices must be on the same Wi-Fi or phone hotspot. Keep this screen open. No internet or LocalSend app is needed.",
    send: da ? "Send" : "Send", receive: da ? "Modtag" : "Receive",
    qrHint: da ? "Lad modtageren scanne denne QR. Parring udløber efter 10 minutter. Del ikke koden eller et skærmbillede af den." : "Ask the receiver to scan this QR. Pairing expires after 10 minutes. Do not share or screenshot it.",
    binder: da ? "Send min Trade Binder" : "Send my Trade Binder",
    binderHint: da ? "Bruger delingsvalg og ønskeliste fra Handel-skærmen." : "Uses the share scope and wishlist settings on the Trades screen.",
    offer: da ? "Send aktuelt handelsforslag" : "Send current trade offer",
    collection: da ? "Send fuld sikkerhedskopi af samlingen" : "Send full collection backup",
    collectionHint: da ? "En fuld sikkerhedskopi indeholder kort, favoritter, mål og indstillinger. Den bruges til gendannelse, ikke til sammenligning af handler." : "A full backup includes your cards, favorites, goals and settings. It is for restoring a collection, not comparing trades.",
    received: da ? "Modtaget indhold" : "Received item",
    discard: da ? "Kassér" : "Discard",
    opening: da ? "Forbereder sikker forbindelse…" : "Preparing secure connection…",
    waiting: da ? "Venter på, at den anden person scanner QR-koden…" : "Waiting for the other person to scan the QR…",
    scanning: da ? "Peg kameraet mod afsenderens parrings-QR." : "Point the camera at the sender’s pairing QR.",
    connecting: da ? "Opretter krypteret forbindelse…" : "Establishing encrypted connection…",
    connectedSender: da ? "Forbundet. Vælg, hvad du vil sende." : "Connected. Choose what to send.",
    connectedReceiver: da ? "Forbundet. Venter på en trade- eller samlingsstreng…" : "Connected. Waiting for a trade or collection string…",
    connectedTradeReceiver: da ? "Forbundet. Venter på kort til inspektion eller et handelsforslag…" : "Connected. Waiting for a collection to inspect or a trade offer…",
    connectedBackupReceiver: da ? "Forbundet. Venter på en fuld sikkerhedskopi…" : "Connected. Waiting for a full collection backup…",
    sending: da ? "Sender…" : "Sending…",
    delivered: da ? "Leveret til den anden enhed til gennemgang. Deres samling er ikke automatisk ændret." : "Delivered to the other device for review. Their collection has not been changed automatically.",
    awaitingReview: da ? "Modtaget. Gennemgå indholdet nedenfor." : "Received. Review the item below.",
    backupSummary: da ? "Fuld sikkerhedskopi: {owned} ejede kort-ID’er, {wanted} ønsker og {favorites} favoritter." : "Full backup: {owned} owned card IDs, {wanted} wishlist entries and {favorites} favorites.",
    binderSummary: da ? "Trade Binder fra {name}: {owned} ejede kort-ID’er og {wanted} ønsker." : "Trade Binder from {name}: {owned} owned card IDs and {wanted} wishlist entries.",
    offerSummary: da ? "Handelsforslag: {owner} ↔ {guest}, {cards} kort-ID’er." : "Trade offer: {owner} ↔ {guest}, {cards} card IDs.",
    backupWarning: da ? "Gendannelse erstatter denne enheds samling, favoritter, mål og indstillinger. Eksportér din egen sikkerhedskopi først, hvis du vil beholde dem." : "Restoring replaces this device’s collection, favorites, goals and settings. Export your own backup first if you want to keep them.",
    tradeWarning: da ? "Åbner kun indholdet til gennemgang. Antal og ejerskab ændres ikke, før du bekræfter en afsluttet handel." : "Opens for review only. Quantities and ownership do not change until you confirm a completed trade.",
    restore: da ? "Erstat min samling med denne sikkerhedskopi" : "Replace my collection with this backup",
    open: da ? "Åbn til gennemgang" : "Open for review",
    replaceConfirm: da ? "Erstat din nuværende samling, favoritter, mål og indstillinger med den modtagne sikkerhedskopi? Dette kan ikke fortrydes uden din egen sikkerhedskopi." : "Replace your current collection, favorites, goals and settings with the received backup? This cannot be undone without your own backup.",
    imported: da ? "Indholdet er åbnet. Du kan modtage mere på samme forbindelse." : "Item opened. You can receive more through the same connection.",
    restored: da ? "Sikkerhedskopien er gendannet. Din samling er erstattet." : "Backup restored. Your collection has been replaced.",
    discarded: da ? "Indholdet er kasseret. Venter på det næste…" : "Item discarded. Waiting for the next one…",
    noOffer: da ? "Opret eller åbn et handelsforslag på Handel-skærmen først." : "Create or open a trade offer on the Trades screen first.",
    noSelection: da ? "Vælg kort på Handel-skærmen først." : "Select cards on the Trades screen first.",
    NO_LOCAL_NETWORK: da ? "Intet lokalt IPv4-netværk fundet. Forbind begge enheder til samme Wi-Fi eller hotspot, og slå VPN fra." : "No local IPv4 network found. Connect both devices to the same Wi-Fi or hotspot and turn off VPN.",
    INVALID_QR: da ? "Dette er ikke en gyldig parrings-QR fra appen." : "This is not a valid app pairing QR.",
    EXPIRED_QR: da ? "Parrings-QR’en er udløbet. Tryk Send igen på afsenderen, og scan den nye kode." : "Pairing QR expired. Tap Send again on the sender and scan the new code.",
    invalidItem: da ? "Den modtagne streng er ugyldig, for stor eller udløbet. Intet er importeret." : "The received string is invalid, oversized or expired. Nothing was imported.",
    RECEIVER_BUSY: da ? "Modtageren skal åbne eller kassere det forrige indhold, før du sender mere." : "The receiver must open or discard the previous item before you send more.",
    TLS_IDENTITY_FAILED: da ? "TLS_IDENTITY_FAILED: Telefonen kunne ikke bruge sin sikre parringsnøgle. Installér seneste build på begge telefoner." : "TLS_IDENTITY_FAILED: This phone could not use its secure pairing key. Install the latest build on both phones.",
    PAIRING_NETWORK_FAILED: da ? "PAIRING_NETWORK_FAILED: Kunne ikke nå afsenderen. Hold Send-skærmen åben; kontrollér samme Wi-Fi/hotspot, VPN og gæstenetværksisolering." : "PAIRING_NETWORK_FAILED: Could not reach the sender. Keep its Send screen open; check the same Wi-Fi/hotspot, VPN and guest-network isolation.",
    PAIRING_TLS_FAILED: da ? "PAIRING_TLS_FAILED: Den krypterede håndtryksfase mislykkedes. Installér seneste build på begge telefoner, og prøv en ny QR." : "PAIRING_TLS_FAILED: The encrypted handshake failed. Install the latest build on both phones and try a fresh QR.",
    PAIRING_AUTH_FAILED: da ? "PAIRING_AUTH_FAILED: Parringen blev ikke godkendt. Tryk Send igen, og scan den nye QR." : "PAIRING_AUTH_FAILED: Pairing was not accepted. Tap Send again and scan the fresh QR.",
    CONNECTION_FAILED: da ? "Forbindelsen mislykkedes. Kontrollér samme Wi-Fi/hotspot, slå VPN fra, og undgå gæstenetværk med enhedsisolering. Prøv en ny QR." : "Connection failed. Check the same Wi-Fi/hotspot, turn off VPN, and avoid guest networks with device isolation. Try a new QR.",
    cameraError: da ? "Kameraet kunne ikke åbnes. Tillad kameraadgang, og tryk Modtag igen." : "Camera could not open. Allow camera access, then tap Receive again.",
    disconnected: da ? "Forbindelsen er lukket. Opret en ny parrings-QR for at overføre mere." : "Connection closed. Create a new pairing QR to transfer more.",
  };
  return String(table[key] || table.CONNECTION_FAILED).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function applyNearbyLanguage() {
  const labels = {
    nearbyTradeOpen: "title", nearbyCollectionOpen: "title", nearbyTitle: "title", nearbyIntro: "intro",
    nearbySend: "send", nearbyReceive: "receive", nearbyQrHint: "qrHint", nearbySendBinder: "binder",
    nearbyBinderHint: "binderHint", nearbySendOffer: "offer", nearbySendCollection: "collection",
    nearbyCollectionHint: "collectionHint", nearbyReceivedTitle: "received", nearbyReject: "discard",
    nearbySendInspection: "inspection", nearbyInspectionHint: "inspectionHint",
  };
  for (const [id, key] of Object.entries(labels)) document.querySelector("#" + id).textContent = nearbyT(key);
  for (const id of ["nearbyTradeOpen", "nearbyCollectionOpen"]) document.querySelector("#" + id).hidden = !nearbyPlugin();
  document.querySelector("#nearbyClose").setAttribute("aria-label", t("closePreview"));
  document.querySelector("#nearbyTitle").textContent = nearbyT(nearbyContext === "backup" ? "backupTitle" : "tradeTitle");
  document.querySelector("#nearbyScope").textContent = nearbyT(nearbyContext === "backup" ? "backupScope" : "tradeScope");
  for (const id of ["nearbySendBinder", "nearbyBinderHint", "nearbySendOffer", "nearbySendInspection", "nearbyInspectionHint"]) document.querySelector("#" + id).hidden = nearbyContext !== "trade";
  for (const id of ["nearbySendCollection", "nearbyCollectionHint"]) document.querySelector("#" + id).hidden = nearbyContext !== "backup";
}

function nearbyStatus(key, values) { document.querySelector("#nearbyStatus").textContent = nearbyT(key, values); }
function nearbySetBusy(busy) {
  nearbyBusy = busy;
  nearbyDialog.querySelectorAll(".nearby-actions button, .nearby-send-controls button").forEach(button => { button.disabled = busy; });
}
function stopNearbyCamera() {
  clearTimeout(nearbyScanTimer);
  nearbyCameraStream?.getTracks().forEach(track => track.stop());
  nearbyCameraStream = null;
  document.querySelector("#nearbyVideo").srcObject = null;
  document.querySelector("#nearbyCamera").hidden = true;
}
function resetNearbyView() {
  clearTimeout(nearbyPollTimer);
  stopNearbyCamera();
  nearbyPending = null;
  nearbyConnectionState = "";
  for (const id of ["nearbyQr", "nearbyQrHint", "nearbySenderControls", "nearbyReceived"]) document.querySelector("#" + id).hidden = true;
  document.querySelector("#nearbyQr").innerHTML = "";
}
function closeNearbySession() {
  const active = Boolean(nearbyRole || nearbyBusy || nearbyCameraStream);
  nearbyOperation++;
  resetNearbyView();
  nearbyRole = "";
  nearbyContext = "trade";
  nearbySetBusy(false);
  if (active) nearbyPlugin()?.stop().catch(() => {});
}
function openNearby(context = "trade") {
  if (!nearbyPlugin()) return;
  closeNearbySession(); // Never carry a pending item/connection across entry points.
  nearbyContext = context === "backup" ? "backup" : "trade";
  applyNearbyLanguage();
  document.querySelector("#nearbyStatus").textContent = "";
  if (!nearbyDialog.open) nearbyDialog.showModal();
}

function validateNearbyCollection(value) {
  const record = item => item && typeof item === "object" && !Array.isArray(item);
  const safeId = id => typeof id === "string" && /^[\w.:-]{1,100}$/u.test(id) && !["__proto__", "constructor", "prototype"].includes(id);
  if (!record(value) || value.version !== 6) throw new Error("invalidItem");
  const checkMap = (map, check) => {
    if (!record(map) || Object.keys(map).length > 100_000 || Object.entries(map).some(([id, item]) => !safeId(id) || !check(item))) throw new Error("invalidItem");
  };
  checkMap(value.cardStates, item => ["owned", "wanted"].includes(item));
  checkMap(value.cardCounts, item => Number.isSafeInteger(item) && item >= 0 && item <= 1_000_000);
  checkMap(value.cardPrintVariants, item => typeof item === "string" && item.length <= 100);
  checkMap(value.cardOwnedVariants, item => Array.isArray(item) && item.length <= 100 && item.every(v => typeof v === "string" && v.length <= 100));
  if (!Array.isArray(value.favorites) || value.favorites.length > 2000 || value.favorites.some(id => !Number.isInteger(id) || id < 1 || id > 10000)) throw new Error("invalidItem");
  for (const key of ["trackedSeries", "trackedSets"]) {
    if (!Array.isArray(value[key]) || value[key].length > 10000 || value[key].some(id => !safeId(id))) throw new Error("invalidItem");
  }
  if (!["set", "master"].includes(value.completionMode) || !record(value.settings)) throw new Error("invalidItem");
  for (const [key, item] of Object.entries(value.settings)) {
    if (["dark", "shiny", "hidePocket"].includes(key) ? typeof item !== "boolean" :
      key === "language" ? !["en", "da"].includes(item) : key === "valuationCurrency" ? !["market", "dkk"].includes(item) : true) throw new Error("invalidItem");
  }
  // Keep only the backup contract: no unknown properties enter live state.
  return Object.fromEntries(["version", "exportedAt", "favorites", "cardStates", "cardCounts", "cardPrintVariants", "cardOwnedVariants", "trackedSeries", "trackedSets", "completionMode", "settings"].map(key => [key, value[key]]));
}

function parseNearbyItem(code) {
  if (typeof code !== "string" || code.length > COLLECTION_IMPORT_STRING_LIMIT || !/^(CDXC1|CDX1)\.[A-Za-z0-9_-]+$/u.test(code)) throw new Error("invalidItem");
  if (code.startsWith("CDXC1.")) return { kind: "collection", value: validateNearbyCollection(decodeCollectionImportString(code)) };
  const value = decodeTradeShareCode(code);
  if (value.schema === TRADE_BINDER_SCHEMA) return { kind: "binder", value: sanitizeTradeBinder(value) };
  if (value.schema === TRADE_PROPOSAL_SCHEMA) return { kind: "offer", value: sanitizeTradeProposal(value) };
  throw new Error("invalidItem");
}

function nearbyCollectionInspection(snapshot) {
  const owned = [], wanted = [];
  for (const [id, status] of Object.entries(snapshot.cardStates)) {
    const card = tradeCardMetadata(id);
    if (status === "owned") owned.push({ ...card,
      quantity: snapshot.cardCounts[id] || 1,
      printings: snapshot.cardOwnedVariants[id] || (snapshot.cardPrintVariants[id] ? [snapshot.cardPrintVariants[id]] : []),
    });
    else if (status === "wanted") wanted.push(card);
  }
  // Only card data enters the inspector. Never retain backup preferences/favorites.
  return sanitizeTradeBinder({
    schema: TRADE_BINDER_SCHEMA, shareId: tradeRandomId("inspection"),
    createdAt: new Date().toISOString(), expiresAt: null,
    owner: { displayName: nearbyT("inspectionOwner") }, scope: "all", collection: { owned, wanted },
  });
}

function prepareNearbyItem(code) {
  const item = parseNearbyItem(code);
  if (nearbyContext === "backup") {
    if (item.kind !== "collection") throw new Error("wrongMode");
    return item;
  }
  if (item.kind === "collection") return { kind: "inspection", value: nearbyCollectionInspection(item.value) };
  return item;
}

function showNearbyReceived(id, code) {
  const item = prepareNearbyItem(code);
  // Strip a legacy full backup down to a read-only share before retaining it.
  const retainedCode = item.kind === "inspection" ? encodeTradeShareCode(item.value) : code;
  nearbyPending = { id, code: retainedCode, context: nearbyContext, ...item };
  const value = item.value;
  let summary;
  if (item.kind === "collection") summary = nearbyT("backupSummary", {
    owned: Object.values(value.cardStates).filter(v => v === "owned").length,
    wanted: Object.values(value.cardStates).filter(v => v === "wanted").length, favorites: value.favorites.length,
  });
  else if (["binder", "inspection"].includes(item.kind)) summary = nearbyT("binderSummary", { name: value.owner.displayName, owned: value.collection.owned.length, wanted: value.collection.wanted.length });
  else summary = nearbyT("offerSummary", { owner: value.parties.owner, guest: value.parties.guest, cards: value.cardsFromOwner.length + value.cardsFromGuest.length });
  document.querySelector("#nearbyReceivedSummary").textContent = summary;
  document.querySelector("#nearbyReceivedWarning").textContent = nearbyT(item.kind === "collection" ? "backupWarning" : "tradeWarning");
  document.querySelector("#nearbyAccept").textContent = nearbyT(item.kind === "collection" ? "restore" : ["binder", "inspection"].includes(item.kind) ? "inspectReceived" : "open");
  document.querySelector("#nearbyReceived").hidden = false;
  nearbyStatus("awaitingReview");
}

async function pollNearby(operation) {
  if (operation !== nearbyOperation || !nearbyDialog.open) return;
  try {
    const result = await nearbyPlugin().poll({ seenId: nearbyPending?.id || 0 });
    if (operation !== nearbyOperation) return;
    const connected = result.state === "connected";
    document.querySelector("#nearbySenderControls").hidden = !(connected && nearbyRole === "sender");
    if (connected) {
      document.querySelector("#nearbyQr").hidden = true;
      document.querySelector("#nearbyQrHint").hidden = true;
      document.querySelector("#nearbyQr").innerHTML = "";
    }
    if (result.state !== nearbyConnectionState && !nearbyBusy) {
      nearbyConnectionState = result.state;
      nearbyStatus(connected ? nearbyRole === "sender" ? "connectedSender" : nearbyContext === "backup" ? "connectedBackupReceiver" : "connectedTradeReceiver" : result.state === "waiting" ? "waiting" : result.state === "expired" ? "EXPIRED_QR" : "disconnected");
    }
    if (nearbyRole === "sender" && result.state === "waiting" && result.error && !nearbyBusy) nearbyStatus(result.error);
    if (nearbyRole === "receiver" && result.code && !nearbyPending) {
      try { showNearbyReceived(result.id, result.code); }
      catch (error) { await nearbyPlugin().clearReceived({ id: result.id }); if (operation === nearbyOperation) nearbyStatus(error.message === "wrongMode" ? "wrongMode" : "invalidItem"); }
    }
  } catch { if (operation === nearbyOperation) nearbyStatus("CONNECTION_FAILED"); }
  if (operation === nearbyOperation && nearbyDialog.open) nearbyPollTimer = setTimeout(() => pollNearby(operation), 700);
}

async function startNearbySender() {
  if (nearbyBusy) return;
  const operation = ++nearbyOperation;
  resetNearbyView(); nearbyRole = "sender"; nearbySetBusy(true); nearbyStatus("opening");
  try {
    const result = await nearbyPlugin().startSender();
    if (operation !== nearbyOperation) return;
    document.querySelector("#nearbyQr").innerHTML = CardedexQr.toSvg(result.qr, { label: nearbyT("title") });
    document.querySelector("#nearbyQr").hidden = false;
    document.querySelector("#nearbyQrHint").hidden = false;
    nearbyStatus("waiting");
    pollNearby(operation);
  } catch (error) { if (operation === nearbyOperation) nearbyStatus(error.code || "CONNECTION_FAILED"); }
  finally { if (operation === nearbyOperation) nearbySetBusy(false); }
}

async function startNearbyReceiver() {
  if (nearbyBusy) return;
  const operation = ++nearbyOperation;
  resetNearbyView(); nearbyRole = "receiver"; nearbySetBusy(true); nearbyStatus("scanning");
  try {
    await nearbyPlugin().stop();
    if (operation !== nearbyOperation) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (operation !== nearbyOperation) { stream.getTracks().forEach(track => track.stop()); return; }
    nearbyCameraStream = stream;
    const video = document.querySelector("#nearbyVideo"); video.srcObject = stream;
    document.querySelector("#nearbyCamera").hidden = false;
    await video.play();
    if (operation !== nearbyOperation) return;
    const scan = async () => {
      if (operation !== nearbyOperation || !nearbyCameraStream) return;
      let qr = "";
      try {
        if (video.videoWidth && video.videoHeight) {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
          canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
          const result = await nearbyPlugin().decodeQr({ jpeg: canvas.toDataURL("image/jpeg", .85).split(",")[1] });
          qr = result.qr; canvas.width = 1; canvas.height = 1;
        }
      } catch { /* A frame may be blurred; the next frame can still decode. */ }
      if (operation !== nearbyOperation) return;
      if (qr?.startsWith("CDXP1|")) {
        stopNearbyCamera(); nearbySetBusy(true); nearbyStatus("connecting");
        try {
          await nearbyPlugin().connect({ qr });
          if (operation === nearbyOperation) { nearbyStatus("connectedReceiver"); pollNearby(operation); }
        } catch (error) { if (operation === nearbyOperation) nearbyStatus(error.code || "CONNECTION_FAILED"); }
        finally { if (operation === nearbyOperation) nearbySetBusy(false); }
      } else nearbyScanTimer = setTimeout(scan, 400);
    };
    scan();
  } catch { if (operation === nearbyOperation) { stopNearbyCamera(); nearbyStatus("cameraError"); } }
  finally { if (operation === nearbyOperation) nearbySetBusy(false); }
}

async function sendNearbyItem(kind) {
  if (nearbyBusy || nearbyRole !== "sender" || nearbyConnectionState !== "connected") return;
  if (nearbyContext === "backup" ? kind !== "collection" : !["binder", "offer", "inspection"].includes(kind)) {
    nearbyStatus("wrongMode"); return;
  }
  let code;
  try {
    if (kind === "collection") code = encodeCollectionImportString();
    else {
      const value = kind === "offer" ? activeTradeProposal : kind === "inspection"
        ? createTradeBinderSnapshot("all", 1, document.querySelector("#tradeIncludeWishlist").checked)
        : currentTradeBinderSnapshot();
      if (!value) { nearbyStatus(kind === "offer" ? "noOffer" : "noSelection"); return; }
      code = encodeTradeShareCode(value);
    }
    parseNearbyItem(code);
  } catch { nearbyStatus("invalidItem"); return; }
  const operation = nearbyOperation;
  nearbySetBusy(true); nearbyStatus("sending");
  try { await nearbyPlugin().send({ code }); if (operation === nearbyOperation) nearbyStatus("delivered"); }
  catch (error) { if (operation === nearbyOperation) nearbyStatus(error.code || "CONNECTION_FAILED"); }
  finally { if (operation === nearbyOperation) nearbySetBusy(false); }
}

async function acceptNearbyItem() {
  if (!nearbyPending || nearbyBusy) return;
  const pending = nearbyPending;
  const operation = nearbyOperation;
  if (pending.context !== nearbyContext || (pending.kind === "collection" && nearbyContext !== "backup")) {
    nearbyStatus("wrongMode"); return;
  }
  if (pending.kind === "collection" && !confirm(nearbyT("replaceConfirm"))) return;
  nearbySetBusy(true);
  try {
    const item = prepareNearbyItem(pending.code); // Recheck context/expiry/schema at acceptance.
    if (item.kind === "collection") {
      if (nearbyContext !== "backup") throw new Error("wrongMode");
      const wasOpen = collectionDialog.open;
      restoreCollectionBackup(item.value);
      // Keep the transfer/review screen above a collection dialog newly opened by restore.
      if (!wasOpen && collectionDialog.open) collectionDialog.close();
    }
    else acceptTradeValue(item.value); // Opens review; never applies a trade.
    nearbyPending = null;
    document.querySelector("#nearbyReceived").hidden = true;
    await nearbyPlugin().clearReceived({ id: pending.id });
    if (operation === nearbyOperation) nearbyStatus(item.kind === "collection" ? "restored" : "imported");
  } catch { if (operation === nearbyOperation) nearbyStatus("invalidItem"); }
  finally { if (operation === nearbyOperation) nearbySetBusy(false); }
}
async function rejectNearbyItem() {
  if (!nearbyPending || nearbyBusy) return;
  const pending = nearbyPending; nearbyPending = null;
  const operation = nearbyOperation;
  document.querySelector("#nearbyReceived").hidden = true;
  await nearbyPlugin().clearReceived({ id: pending.id }).catch(() => {});
  if (operation === nearbyOperation) nearbyStatus("discarded");
}

document.querySelector("#nearbyTradeOpen").addEventListener("click", () => openNearby("trade"));
document.querySelector("#nearbyCollectionOpen").addEventListener("click", () => openNearby("backup"));
document.querySelector("#nearbyClose").addEventListener("click", () => { closeNearbySession(); nearbyDialog.close(); });
nearbyDialog.addEventListener("close", closeNearbySession);
document.querySelector("#nearbySend").addEventListener("click", startNearbySender);
document.querySelector("#nearbyReceive").addEventListener("click", startNearbyReceiver);
document.querySelector("#nearbySendBinder").addEventListener("click", () => sendNearbyItem("binder"));
document.querySelector("#nearbySendOffer").addEventListener("click", () => sendNearbyItem("offer"));
document.querySelector("#nearbySendCollection").addEventListener("click", () => sendNearbyItem("collection"));
document.querySelector("#nearbySendInspection").addEventListener("click", () => sendNearbyItem("inspection"));
document.querySelector("#nearbyAccept").addEventListener("click", acceptNearbyItem);
document.querySelector("#nearbyReject").addEventListener("click", rejectNearbyItem);
window.addEventListener("pagehide", closeNearbySession);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && nearbyDialog.open) { closeNearbySession(); nearbyDialog.close(); }
});
