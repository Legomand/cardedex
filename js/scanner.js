const scannerDialog = document.querySelector("#scannerDialog");
const scannerOpen = document.querySelector("#cardScannerOpen");
const scannerCameraInput = document.querySelector("#scannerCameraInput");
const scannerGalleryInput = document.querySelector("#scannerGalleryInput");
const scannerWorkspace = document.querySelector("#scannerWorkspace");
const scannerPreview = document.querySelector("#scannerPreview");
const scannerProgress = document.querySelector("#scannerProgress");
const scannerResults = document.querySelector("#scannerResults");

let scannerLibraryPromise;
let scannerPreviewUrl;
let scannerMatches = [];

function applyScannerLanguage() {
  const text = (selector, key) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = t(key);
  };
  scannerOpen.setAttribute("aria-label", t("scanCard"));
  scannerOpen.title = t("scanCard");
  document.querySelector("#scannerClose").setAttribute(
    "aria-label",
    t("closeScanner"),
  );
  text("#scannerKicker", "scannerKicker");
  text("#scannerTitle", "scanCard");
  text("#scannerIntro", "scannerIntro");
  text("#scannerCameraLabel", "takePhoto");
  text("#scannerGalleryLabel", "choosePicture");
  text("#scannerPrivacy", "scannerPrivacy");
}

function openScanner() {
  applyScannerLanguage();
  if (!scannerDialog.open) scannerDialog.showModal();
}

function resetScannerInput(input) {
  input.value = "";
  input.click();
}

function loadScannerLibrary() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (scannerLibraryPromise) return scannerLibraryPromise;
  scannerLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Scanner library unavailable"));
    document.head.append(script);
  }).catch((error) => {
    scannerLibraryPromise = null;
    throw error;
  });
  return scannerLibraryPromise;
}

async function prepareScannerImage(file) {
  const bitmap = await createImageBitmap(file);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(2, 1800 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d", { alpha: false });
  context.filter = "grayscale(1) contrast(1.35)";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function scannerDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(left[i - 1] !== right[j - 1]),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function findScannedPokemon(rawText) {
  const text = normalizeCardName(rawText);
  const aliases = [...state.pokemonAliases].sort(
    (left, right) => right.name.length - left.name.length,
  );
  const exact = aliases.find((pokemon) =>
    new RegExp(`(^| )${pokemon.name.replaceAll(" ", " +")}( |$)`).test(text)
  );
  if (exact) return exact;

  const words = text.split(" ").filter(Boolean);
  let best = null;
  for (const pokemon of aliases) {
    if (pokemon.name.length < 5) continue;
    const wordCount = pokemon.name.split(" ").length;
    const allowed = Math.max(1, Math.floor(pokemon.name.length * 0.16));
    for (let index = 0; index <= words.length - wordCount; index++) {
      const candidate = words.slice(index, index + wordCount).join(" ");
      const distance = scannerDistance(pokemon.name, candidate);
      if (distance <= allowed && (!best || distance < best.distance)) {
        best = { ...pokemon, distance };
      }
    }
  }
  return best;
}

function normalizeCollectorNumber(value) {
  const compact = String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^([A-Z]*)(\d+)$/);
  return match ? `${match[1]}${Number(match[2])}` : compact;
}

function findCollectorNumbers(text) {
  const numbers = [];
  const pattern =
    /\b([A-Z]{0,3}\d{1,4})[ \t]*[\/|][ \t]*([A-Z]{0,3}\d{1,4})\b/gi;
  for (const match of text.matchAll(pattern)) {
    numbers.push(normalizeCollectorNumber(match[1]));
  }
  return [...new Set(numbers)];
}

function scannerCardTextScore(card, rawText, collectorNumbers) {
  const text = normalizeCardName(rawText);
  const words = new Set(text.split(" ").filter(Boolean));
  const localId = normalizeCollectorNumber(card.localId);
  const normalizedName = normalizeCardName(card.name);
  let score = 0;
  if (collectorNumbers.includes(localId)) score += 200;
  if (text.includes(normalizedName)) score += 60;
  normalizedName.split(" ").forEach((word) => {
    if (word.length > 1 && words.has(word)) score += 4;
  });

  const phrases = [
    card.set?.name,
    card.illustrator,
    card.rarity,
    card.description,
    ...(card.attacks || []).flatMap((attack) => [attack.name, attack.effect]),
  ].filter(Boolean).map(normalizeCardName);
  for (const phrase of phrases) {
    if (phrase.length >= 4 && text.includes(phrase)) {
      score += Math.min(55, 12 + phrase.length * 1.4);
    }
    phrase.split(" ").forEach((word) => {
      if (word.length >= 4 && words.has(word)) score += 3;
    });
  }
  return score;
}

function rankScannedCards(cards, rawText, collectorNumbers) {
  const hasExactNumber = cards.some((card) =>
    collectorNumbers.includes(normalizeCollectorNumber(card.localId))
  );
  return cards.map((card) => {
    const localId = normalizeCollectorNumber(card.localId);
    return {
      card,
      score: scannerCardTextScore(card, rawText, collectorNumbers),
      localId,
    };
  }).filter((match) =>
    !hasExactNumber || collectorNumbers.includes(match.localId)
  )
    .sort((left, right) =>
      right.score - left.score ||
      String(left.card.id).localeCompare(String(right.card.id), undefined, {
        numeric: true,
      })
    )
    .map((match) => match.card);
}

function scannerFingerprint(source) {
  const width = 18;
  const height = 25;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = source.width;
  let sourceHeight = source.height;
  if (sourceWidth / sourceHeight > targetRatio) {
    sourceWidth = sourceHeight * targetRatio;
    sourceX = (source.width - sourceWidth) / 2;
  } else {
    sourceHeight = sourceWidth / targetRatio;
    sourceY = (source.height - sourceHeight) / 2;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.filter = "grayscale(1) contrast(1.25)";
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
  const pixels = context.getImageData(0, 0, width, height).data;
  const values = [];
  for (let index = 0; index < pixels.length; index += 4) {
    values.push(pixels[index] / 255);
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / values.length;
  const deviation = Math.sqrt(variance) || 1;
  return values.map((value) => (value - mean) / deviation);
}

function scannerFingerprintSimilarity(left, right) {
  if (!left || !right || left.length !== right.length) return 0;
  const difference = left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0,
  ) / left.length;
  return Math.max(0, 90 - difference * 45);
}

async function scannerCardFingerprint(card) {
  const response = await fetch(cardImageUrl(card, "low"));
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob());
  const fingerprint = scannerFingerprint(bitmap);
  bitmap.close();
  return fingerprint;
}

async function refineScannedMatches(
  matches,
  rawText,
  collectorNumbers,
  scannedImage,
) {
  const sourceFingerprint = scannerFingerprint(scannedImage);
  const shortlist = matches.slice(0, 14);
  const refined = await Promise.all(shortlist.map(async (card, index) => {
    let full = card;
    try {
      full = { ...card, ...await getJson(`${TCG_API}/cards/${card.id}`) };
    } catch {}
    let visualScore = 0;
    try {
      visualScore = scannerFingerprintSimilarity(
        sourceFingerprint,
        await scannerCardFingerprint(full),
      );
    } catch {}
    return {
      card: {
        ...full,
        variant: full.suffix || full.variant || deriveVariant(full.name),
        setCode: full.setCode || setCode(full.id),
      },
      score: scannerCardTextScore(full, rawText, collectorNumbers) +
        visualScore - index * 0.01,
    };
  }));
  return refined.sort((left, right) => right.score - left.score).map((match) =>
    match.card
  ).concat(matches.slice(shortlist.length));
}

function scannerStatus(card) {
  const status = state.cardStates[card.id];
  if (status === "owned") {
    return {
      className: "owned",
      label: t("scannerOwned", {
        count: Math.max(1, Number(state.cardCounts[card.id]) || 1),
      }),
    };
  }
  if (status === "wanted") {
    return { className: "wanted", label: t("scannerWanted") };
  }
  return { className: "missing", label: t("scannerNotSaved") };
}

function renderScannerResults(cards) {
  scannerMatches = cards.slice(0, 8).map((card) => ({
    ...card,
    variant: card.variant || deriveVariant(card.name),
    setCode: card.setCode || setCode(card.id),
  }));
  scannerResults.innerHTML = `<h3>${
    t("scannerMatches")
  }</h3><div class="scanner-match-grid">${
    scannerMatches.map((card) => {
      const status = scannerStatus(card);
      return `<button type="button" class="scanner-match" data-scanner-card="${
        escapeHtml(card.id)
      }"><img src="${cardImageUrl(card, "low")}" alt=""><span><strong>${
        escapeHtml(card.name)
      }</strong><small>${escapeHtml(card.set?.name || card.setCode)} · #${
        escapeHtml(card.localId)
      }</small><i class="${status.className}">${
        escapeHtml(status.label)
      }</i></span><b>${t("scannerOpenCard")} →</b></button>`;
    }).join("")
  }</div>`;
}

async function scanCardPicture(file) {
  if (!file?.type.startsWith("image/")) return;
  if (scannerPreviewUrl) URL.revokeObjectURL(scannerPreviewUrl);
  scannerPreviewUrl = URL.createObjectURL(file);
  scannerPreview.src = scannerPreviewUrl;
  scannerWorkspace.hidden = false;
  scannerResults.innerHTML = "";
  scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
    t("scannerPreparing")
  }`;

  try {
    const [Tesseract, image] = await Promise.all([
      loadScannerLibrary(),
      prepareScannerImage(file),
    ]);
    const result = await Tesseract.recognize(image, "eng", {
      logger(message) {
        if (message.status !== "recognizing text") return;
        scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
          t("scannerReading", { progress: Math.round(message.progress * 100) })
        }`;
      },
    });
    const rawText = result.data.text || "";
    const pokemon = findScannedPokemon(rawText);
    if (!pokemon) {
      scannerProgress.textContent = t("scannerNoPokemon");
      return;
    }

    scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
      t("scannerSearching")
    }`;
    const printedName = tcgNameOverrides[pokemon.slug] ||
      titleCase(pokemon.slug);
    const cards = await getJson(
      `${TCG_API}/cards?name=${encodeURIComponent(printedName)}`,
    );
    const exactName = new RegExp(
      `(^|[^a-z0-9])${
        printedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }([^a-z0-9]|$)`,
      "i",
    );
    const candidates = cards.filter((card) =>
      (card.image || cardImageOverrides[card.id]) && exactName.test(card.name)
    );
    let matches = rankScannedCards(
      candidates,
      rawText,
      findCollectorNumbers(rawText),
    );
    if (!matches.length) {
      scannerProgress.textContent = t("scannerNoCards", {
        name: titleCase(pokemon.slug),
      });
      return;
    }
    if (matches.length > 1) {
      const collectorNumbers = findCollectorNumbers(rawText);
      matches = await refineScannedMatches(
        matches,
        rawText,
        collectorNumbers,
        image,
      );
    }
    scannerProgress.textContent = `${titleCase(pokemon.slug)} · ${
      matches.length === 1 ? t("cardFound") : t("cards")
    }`;
    renderScannerResults(matches);
  } catch (error) {
    console.error("Card scan failed", error);
    scannerProgress.textContent = t("scannerUnavailable");
  }
}

scannerOpen.addEventListener("click", openScanner);
document.querySelector("#scannerClose").addEventListener(
  "click",
  () => scannerDialog.close(),
);
document.querySelector("#scannerCamera").addEventListener(
  "click",
  () => resetScannerInput(scannerCameraInput),
);
document.querySelector("#scannerGallery").addEventListener(
  "click",
  () => resetScannerInput(scannerGalleryInput),
);
[scannerCameraInput, scannerGalleryInput].forEach((input) =>
  input.addEventListener("change", () => scanCardPicture(input.files[0]))
);
scannerResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scanner-card]");
  if (!button) return;
  const card = scannerMatches.find((value) =>
    value.id === button.dataset.scannerCard
  );
  if (!card) return;
  scannerDialog.close();
  openCard(card);
});
scannerDialog.addEventListener("click", (event) => {
  if (event.target === scannerDialog) scannerDialog.close();
});
