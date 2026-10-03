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

function scannerMedian(values) {
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)] || 0;
}

function detectScannerCardBounds(bitmap) {
  const maximum = 320;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const borderSize = Math.max(2, Math.round(Math.min(width, height) * 0.035));
  const red = [];
  const green = [];
  const blue = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (
        x >= borderSize && x < width - borderSize &&
        y >= borderSize && y < height - borderSize
      ) continue;
      const offset = (y * width + x) * 4;
      red.push(pixels[offset]);
      green.push(pixels[offset + 1]);
      blue.push(pixels[offset + 2]);
    }
  }
  const background = [
    scannerMedian(red),
    scannerMedian(green),
    scannerMedian(blue),
  ];
  const borderDistances = [];
  for (let index = 0; index < red.length; index++) {
    borderDistances.push(Math.hypot(
      red[index] - background[0],
      green[index] - background[1],
      blue[index] - background[2],
    ));
  }
  borderDistances.sort((left, right) => left - right);
  const threshold = Math.min(
    95,
    Math.max(
      42,
      (borderDistances[Math.floor(borderDistances.length * 0.9)] || 0) + 18,
    ),
  );
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4;
    const distance = Math.hypot(
      pixels[offset] - background[0],
      pixels[offset + 1] - background[1],
      pixels[offset + 2] - background[2],
    );
    if (distance > threshold) mask[index] = 1;
  }

  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let minimumX = width;
    let minimumY = height;
    let maximumX = 0;
    let maximumY = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      area++;
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (!offsetX && !offsetY) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 || nextX >= width || nextY < 0 || nextY >= height
          ) continue;
          const next = nextY * width + nextX;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }
    const boxWidth = maximumX - minimumX + 1;
    const boxHeight = maximumY - minimumY + 1;
    if (
      area < mask.length * 0.03 || boxWidth < width * 0.2 ||
      boxHeight < height * 0.3
    ) continue;
    const score = area * Math.min(1, boxHeight / boxWidth);
    if (!best || score > best.score) {
      best = {
        score,
        x: minimumX / scale,
        y: minimumY / scale,
        width: boxWidth / scale,
        height: boxHeight / scale,
      };
    }
  }
  return best;
}

function scannerCardCrop(bitmap) {
  const cardRatio = 245 / 342;
  const detected = detectScannerCardBounds(bitmap);
  let sourceX = detected?.x || 0;
  let sourceY = detected?.y || 0;
  let sourceWidth = detected?.width || bitmap.width;
  let sourceHeight = detected?.height || bitmap.height;
  const padding = detected ? 0.018 : 0;
  sourceX -= sourceWidth * padding;
  sourceY -= sourceHeight * padding;
  sourceWidth *= 1 + padding * 2;
  sourceHeight *= 1 + padding * 2;
  if (sourceWidth / sourceHeight > cardRatio * 1.08) {
    const wantedWidth = sourceHeight * cardRatio;
    sourceX += (sourceWidth - wantedWidth) / 2;
    sourceWidth = wantedWidth;
  } else if (sourceWidth / sourceHeight > cardRatio) {
    const wantedHeight = sourceWidth / cardRatio;
    sourceY -= (wantedHeight - sourceHeight) / 2;
    sourceHeight = wantedHeight;
  } else {
    const wantedWidth = sourceHeight * cardRatio;
    sourceX -= (wantedWidth - sourceWidth) / 2;
    sourceWidth = wantedWidth;
  }
  sourceX = Math.max(0, Math.min(sourceX, bitmap.width - sourceWidth));
  sourceY = Math.max(0, Math.min(sourceY, bitmap.height - sourceHeight));
  sourceWidth = Math.min(sourceWidth, bitmap.width - sourceX);
  sourceHeight = Math.min(sourceHeight, bitmap.height - sourceY);
  return { sourceX, sourceY, sourceWidth, sourceHeight };
}

async function prepareScannerImage(file) {
  const bitmap = await createImageBitmap(file);
  const { sourceX, sourceY, sourceWidth, sourceHeight } = scannerCardCrop(
    bitmap,
  );
  const cardRatio = 245 / 342;
  const canvas = document.createElement("canvas");
  canvas.width = 1500;
  canvas.height = Math.round(canvas.width / cardRatio);
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const fullScale = Math.min(1, 1800 / bitmap.height, 1800 / bitmap.width);
  const fullImage = document.createElement("canvas");
  fullImage.width = Math.max(1, Math.round(bitmap.width * fullScale));
  fullImage.height = Math.max(1, Math.round(bitmap.height * fullScale));
  fullImage.getContext("2d", { alpha: false }).drawImage(
    bitmap,
    0,
    0,
    fullImage.width,
    fullImage.height,
  );
  canvas.scannerFullImage = fullImage;
  bitmap.close();
  return canvas;
}

function scannerImageRegion(source, start, end, contrast = 1.45) {
  const sourceY = Math.round(source.height * start);
  const sourceHeight = Math.round(source.height * (end - start));
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = Math.round(sourceHeight * (canvas.width / source.width));
  const context = canvas.getContext("2d", { alpha: false });
  context.filter = `grayscale(1) contrast(${contrast})`;
  context.drawImage(
    source,
    0,
    sourceY,
    source.width,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function scannerImageTile(source, left, top, right, bottom) {
  const sourceX = Math.round(source.width * left);
  const sourceY = Math.round(source.height * top);
  const sourceWidth = Math.round(source.width * (right - left));
  const sourceHeight = Math.round(source.height * (bottom - top));
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = Math.round(sourceHeight * (canvas.width / sourceWidth));
  const context = canvas.getContext("2d", { alpha: false });
  context.filter = "grayscale(1) contrast(1.3)";
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function scannerRotateImage(source, degrees) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(degrees * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
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

function findScannedPokemon(rawText, tolerance = 0.16) {
  const text = normalizeCardName(rawText);
  const aliases = [...state.pokemonAliases].sort(
    (left, right) => right.name.length - left.name.length,
  );
  const exact = aliases.find((pokemon) =>
    new RegExp(`(^| )${pokemon.name.replaceAll(" ", " +")}( |$)`).test(text)
  );
  if (exact) return exact;
  if (tolerance <= 0) return null;

  const words = text.split(" ").filter(Boolean);
  let best = null;
  for (const pokemon of aliases) {
    if (pokemon.name.length < 5) continue;
    const wordCount = pokemon.name.split(" ").length;
    const allowed = Math.max(1, Math.floor(pokemon.name.length * tolerance));
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

function findCollectorNumbers(text, includeStandalone = false) {
  const numbers = [];
  const pattern =
    /\b([A-Z]{0,5}[ \t-]*\d{1,4})[ \t]*[\/|][ \t]*([A-Z]{0,5}[ \t-]*\d{1,4})\b/gi;
  for (const match of text.matchAll(pattern)) {
    numbers.push(normalizeCollectorNumber(match[1]));
  }
  if (!numbers.length && includeStandalone) {
    const knownPrefix =
      /\b(?:TG|GG|SV|SVP|RC|SWSH|SMP|SM|XY|DP|BW|PR)[ \t-]*\d{1,4}\b/gi;
    for (const match of text.matchAll(knownPrefix)) {
      numbers.push(normalizeCollectorNumber(match[0]));
    }
    const packedNumber = /[\[(](\d{2,3})\d{3,4}[\])]/g;
    for (const match of text.matchAll(packedNumber)) {
      numbers.push(normalizeCollectorNumber(match[1]));
    }
    const slashAsDigit = /\b(\d{3})[17]\d{3}\b/g;
    for (const match of text.matchAll(slashAsDigit)) {
      numbers.push(normalizeCollectorNumber(match[1]));
    }
  }
  return [...new Set(numbers)];
}

function findScannedHp(text) {
  const match = text.match(/\b(?:HP[ \t:]*)?(\d{2,3})[ \t]*HP\b/i) ||
    text.match(/\bHP[ \t:]*(\d{2,3})\b/i);
  if (match) return Number(match[1]);
  const candidates = [...text.matchAll(/\d{2,3}/g)].map((value) =>
    Number(value[0])
  ).filter((value) => value >= 30 && value <= 400);
  const plausible = candidates.filter((value) => value % 10 === 0);
  return plausible.length ? Math.max(...plausible) : null;
}

function findScannedPokedexPokemon(text) {
  for (
    const match of text.matchAll(
      /\bN[O0][.\s:]*(\d(?:[\s-]*\d){0,3})/gi,
    )
  ) {
    const id = Number(match[1].replace(/\D/g, ""));
    const pokemon = state.pokemonAliases.find((value) => value.id === id);
    if (pokemon) return pokemon;
  }
  return null;
}

function findScannedAttackPhrases(text) {
  const phrases = [];
  const ignoredSingles = new Set([
    "ability",
    "basic",
    "damage",
    "pokemon",
    "search",
  ]);
  for (const line of String(text).split(/\r?\n/)) {
    const single = line.trim().match(/^[A-Z][a-z]{3,}$/)?.[0];
    if (single && !ignoredSingles.has(single.toLowerCase())) {
      phrases.push(single);
    }
    for (
      const match of line.matchAll(
        /\b[A-Z][a-z]{2,}(?:['’-][A-Za-z]+)?(?:\s+[A-Z][a-z]{2,}(?:['’-][A-Za-z]+)?){1,3}\b/g,
      )
    ) {
      phrases.push(match[0].replaceAll("’", "'"));
    }
  }
  return [...new Set(phrases)].slice(0, 6);
}

async function findCardsByScannedAttack(text) {
  let bestCards = [];
  for (const phrase of findScannedAttackPhrases(text)) {
    for (let index = 0; index < 3; index++) {
      let cards = [];
      try {
        cards = await getJson(
          `${TCG_API}/cards?attacks.${index}.name=${
            encodeURIComponent(`eq:${phrase}`)
          }`,
        );
      } catch {}
      if (
        cards.length && cards.length <= 120 &&
        (!bestCards.length || cards.length < bestCards.length)
      ) bestCards = cards;
      const pokemon = [...new Map(
        cards.map((card) => {
          const match = findScannedPokemon(card.name, 0);
          return [match?.id, match];
        }).filter(([id]) => id),
      ).values()];
      if (pokemon.length === 1) return { pokemon: pokemon[0], cards };
    }
  }
  return { pokemon: null, cards: bestCards };
}

function scannerWordMatches(words, expected) {
  if (words.has(expected)) return true;
  if (expected.length < 5) return false;
  return [...words].some((word) =>
    Math.abs(word.length - expected.length) <= 1 &&
    scannerDistance(word, expected) <= 1
  );
}

function scannerCardTextScore(
  card,
  rawText,
  collectorNumbers,
  scanDetails = {},
) {
  const text = normalizeCardName(rawText);
  const words = new Set(text.split(" ").filter(Boolean));
  const localId = normalizeCollectorNumber(card.localId);
  const normalizedName = normalizeCardName(card.name);
  let score = 0;
  if (collectorNumbers.includes(localId)) score += 300;
  if (scanDetails.hp && Number(card.hp) === scanDetails.hp) score += 90;
  if (text.includes(normalizedName)) score += 60;
  normalizedName.split(" ").forEach((word) => {
    if (word.length > 1 && scannerWordMatches(words, word)) score += 4;
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
      if (word.length >= 4 && scannerWordMatches(words, word)) score += 4;
    });
  }
  return score;
}

function rankScannedCards(cards, rawText, collectorNumbers, scanDetails = {}) {
  const hasExactNumber = cards.some((card) =>
    collectorNumbers.includes(normalizeCollectorNumber(card.localId))
  );
  return cards.map((card) => {
    const localId = normalizeCollectorNumber(card.localId);
    return {
      card,
      score: scannerCardTextScore(
        card,
        rawText,
        collectorNumbers,
        scanDetails,
      ),
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

function scannerFingerprint(source, inset = 0, rotation = 0) {
  const width = 25;
  const height = 35;
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
  sourceX += sourceWidth * inset;
  sourceY += sourceHeight * inset;
  sourceWidth *= 1 - inset * 2;
  sourceHeight *= 1 - inset * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.filter = "grayscale(1) contrast(1.25)";
  context.translate(width / 2, height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -width / 2,
    -height / 2,
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

function scannerSourceFingerprints(source) {
  return [0, 0.035, 0.06, 0.085].flatMap((inset) =>
    [-4, -2, 0, 2, 4].map((rotation) =>
      scannerFingerprint(source, inset, rotation)
    )
  );
}

function scannerFingerprintSimilarity(left, right) {
  if (!left || !right || left.length !== right.length) return 0;
  const difference = left.reduce(
    (sum, value, index) => sum + (value - right[index]) ** 2,
    0,
  ) / left.length;
  return Math.max(0, 90 - difference * 45);
}

function scannerBestFingerprintSimilarity(sources, target) {
  return Math.max(
    0,
    ...sources.map((source) => scannerFingerprintSimilarity(source, target)),
  );
}

async function scannerCardFingerprint(card) {
  const response = await fetch(cardImageUrl(card, "low"));
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob());
  const fingerprint = scannerFingerprint(bitmap);
  bitmap.close();
  return fingerprint;
}

async function scannerMapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function refineScannedMatches(
  matches,
  rawText,
  collectorNumbers,
  scannedImage,
  scanDetails = {},
  onProgress = () => {},
) {
  const sourceFingerprints = scannerSourceFingerprints(scannedImage);
  let completed = 0;
  const visuallyRanked = await scannerMapConcurrent(
    matches,
    8,
    async (card, index) => {
      let visualScore = 0;
      try {
        visualScore = scannerBestFingerprintSimilarity(
          sourceFingerprints,
          await scannerCardFingerprint(card),
        );
      } catch {}
      completed++;
      onProgress(completed, matches.length);
      return {
        card,
        visualScore,
        score: scannerCardTextScore(
          card,
          rawText,
          collectorNumbers,
          scanDetails,
        ) + visualScore - index * 0.0001,
      };
    },
  );
  visuallyRanked.sort((left, right) => right.score - left.score);

  const shortlist = visuallyRanked.slice(0, 36);
  const refined = await scannerMapConcurrent(shortlist, 6, async (match) => {
    const card = match.card;
    let full = card;
    try {
      full = { ...card, ...await getJson(`${TCG_API}/cards/${card.id}`) };
    } catch {}
    return {
      card: {
        ...full,
        variant: full.suffix || full.variant || deriveVariant(full.name),
        setCode: full.setCode || setCode(full.id),
      },
      score: scannerCardTextScore(
        full,
        rawText,
        collectorNumbers,
        scanDetails,
      ) + match.visualScore,
    };
  });
  return refined.sort((left, right) => right.score - left.score).map((match) =>
    match.card
  ).concat(visuallyRanked.slice(shortlist.length).map((match) => match.card));
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

async function recognizeScannerImage(Tesseract, image) {
  const regions = [
    scannerImageRegion(image, 0, 0.17, 1.35),
    scannerImageRegion(image, 0.16, 0.5, 1.3),
    scannerImageRegion(image, 0.4, 0.83, 1.4),
    scannerImageRegion(image, 0.74, 1, 1.7),
  ];
  let pass = 0;
  const worker = await Tesseract.createWorker("eng", 1, {
    logger(message) {
      if (message.status !== "recognizing text") return;
      const progress = Math.round(
        (pass + Math.min(1, message.progress || 0)) / regions.length * 100,
      );
      scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
        t("scannerReading", { progress })
      }`;
    },
  });
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
    });
    const topTexts = [];
    const top = await worker.recognize(regions[0]);
    topTexts.push(top.data.text || "");
    pass = 1;
    const caption = await worker.recognize(regions[1]);
    pass = 2;
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const attacks = await worker.recognize(regions[2]);
    // Perspective photos often leave the name line tilted even after the card
    // is cropped. If neither the name nor the printed Pokédex number survived,
    // retry the header at several angles and stop on the first useful result.
    if (
      !findScannedPokemon(topTexts[0], 0.36) &&
      !findScannedPokedexPokemon(
        `${caption.data.text || ""}\n${attacks.data.text || ""}`,
      ) &&
      !findScannedAttackPhrases(attacks.data.text || "").length
    ) {
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
      for (const angle of [-8, 8, -14, 14]) {
        const retry = await worker.recognize(
          scannerRotateImage(regions[0], angle),
        );
        topTexts.push(retry.data.text || "");
        if (findScannedPokemon(topTexts.at(-1), 0.36)) break;
      }
    }
    pass = 3;
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/- ",
    });
    const bottom = await worker.recognize(regions[3]);
    const bottomTexts = [bottom.data.text || ""];
    if (
      !findCollectorNumbers(
        `${attacks.data.text || ""}\n${bottomTexts[0]}`,
        true,
      ).length
    ) {
      const footer = scannerImageTile(image, 0, 0.78, 0.7, 1);
      const focused = await worker.recognize(footer);
      bottomTexts.push(focused.data.text || "");
      if (
        !findCollectorNumbers(bottomTexts.join("\n"), true).length &&
        image.scannerFullImage
      ) {
        const tightFooter = scannerImageTile(image, 0, 0.85, 0.58, 1);
        for (const angle of [0, -6, 6]) {
          const source = angle
            ? scannerRotateImage(tightFooter, angle)
            : tightFooter;
          const result = await worker.recognize(source);
          bottomTexts.push(result.data.text || "");
          if (findCollectorNumbers(bottomTexts.join("\n"), true).length) {
            break;
          }
        }
        for (
          const bounds of [
            [0, 0.55, 0.75, 0.86],
            [0.05, 0.8, 0.62, 0.97],
          ]
        ) {
          if (findCollectorNumbers(bottomTexts.join("\n"), true).length) {
            break;
          }
          const originalFooter = scannerImageTile(
            image.scannerFullImage,
            ...bounds,
          );
          const result = await worker.recognize(originalFooter);
          bottomTexts.push(result.data.text || "");
          if (findCollectorNumbers(bottomTexts.join("\n"), true).length) {
            break;
          }
        }
      }
    }
    let fullText = "";
    const croppedText = [
      ...topTexts,
      caption.data.text || "",
      attacks.data.text || "",
      ...bottomTexts,
    ].join("\n");
    if (
      !findScannedPokemon(croppedText, 0.26) &&
      !findScannedPokedexPokemon(croppedText) &&
      !findScannedAttackPhrases(attacks.data.text || "").length &&
      image.scannerFullImage
    ) {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "11",
        tessedit_char_whitelist: "",
      });
      const tiles = [
        [0, 0.12, 0.72, 0.55],
        [0.28, 0.12, 1, 0.55],
        [0, 0.35, 0.72, 0.82],
        [0.28, 0.35, 1, 0.82],
        [0, 0.58, 0.72, 1],
        [0.28, 0.58, 1, 1],
      ];
      for (const tileBounds of tiles) {
        const tile = scannerImageTile(
          image.scannerFullImage,
          ...tileBounds,
        );
        for (const angle of [0, -10, 10]) {
          const source = angle ? scannerRotateImage(tile, angle) : tile;
          const result = await worker.recognize(source);
          fullText += `\n${result.data.text || ""}`;
          if (
            findScannedPokemon(fullText, 0) ||
            findScannedPokedexPokemon(fullText)
          ) break;
        }
        if (
          findScannedPokemon(fullText, 0) ||
          findScannedPokedexPokemon(fullText)
        ) break;
      }
    }
    return {
      topText: topTexts.join("\n"),
      captionText: caption.data.text || "",
      attackText: attacks.data.text || "",
      bottomText: bottomTexts.join("\n"),
      fullText,
    };
  } finally {
    await worker.terminate();
  }
}

async function scanCardPicture(file) {
  if (!file?.type.startsWith("image/")) return;
  scannerDialog.setAttribute("aria-busy", "true");
  scannerDialog.querySelectorAll(".scanner-actions button").forEach(
    (button) => {
      button.disabled = true;
    },
  );
  scannerMatches = [];
  if (scannerPreviewUrl) URL.revokeObjectURL(scannerPreviewUrl);
  scannerPreviewUrl = URL.createObjectURL(file);
  scannerPreview.src = scannerPreviewUrl;
  scannerWorkspace.hidden = false;
  scannerResults.innerHTML = "";
  scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
    t("scannerPreparing")
  }`;
  requestAnimationFrame(() => {
    scannerWorkspace.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  try {
    const [Tesseract, image] = await Promise.all([
      loadScannerLibrary(),
      prepareScannerImage(file),
    ]);
    scannerPreview.src = image.toDataURL("image/jpeg", 0.86);
    const recognized = await recognizeScannerImage(Tesseract, image);
    const rawText = [
      recognized.topText,
      recognized.captionText,
      recognized.attackText,
      recognized.bottomText,
      recognized.fullText,
    ].join("\n");
    let pokemon = findScannedPokedexPokemon(rawText) ||
      findScannedPokemon(recognized.topText, 0.36) ||
      findScannedPokemon(recognized.fullText || "", 0) ||
      findScannedPokemon(recognized.bottomText);
    let attackCards = [];
    if (!pokemon) {
      const recovered = await findCardsByScannedAttack(
        `${recognized.captionText}\n${recognized.attackText}`,
      );
      pokemon = recovered.pokemon;
      attackCards = recovered.cards;
    }
    if (!pokemon && !attackCards.length) {
      scannerProgress.textContent = t("scannerNoPokemon");
      return;
    }

    scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
      t("scannerSearching")
    }`;
    let candidates = attackCards.filter((card) =>
      card.image || cardImageOverrides[card.id]
    );
    if (pokemon) {
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
      candidates = cards.filter((card) =>
        (card.image || cardImageOverrides[card.id]) && exactName.test(card.name)
      );
    }
    const collectorNumbers = findCollectorNumbers(rawText, true);
    const scanDetails = {
      hp: findScannedHp(recognized.topText),
      topText: recognized.topText,
      attackText: recognized.attackText,
      bottomText: recognized.bottomText,
    };
    let matches = rankScannedCards(
      candidates,
      rawText,
      collectorNumbers,
      scanDetails,
    );
    if (!matches.length) {
      scannerProgress.textContent = t("scannerNoCards", {
        name: pokemon ? titleCase(pokemon.slug) : t("scanCard"),
      });
      return;
    }
    if (matches.length > 1) {
      matches = await refineScannedMatches(
        matches,
        rawText,
        collectorNumbers,
        image,
        scanDetails,
        (done, total) => {
          scannerProgress.innerHTML = `<span class="scanner-spinner"></span>${
            t("scannerComparing", { done, total })
          }`;
        },
      );
    }
    const matchedName = pokemon
      ? titleCase(pokemon.slug)
      : matches[0]?.name || t("scanCard");
    scannerProgress.textContent = `${matchedName} · ${
      matches.length === 1 ? t("cardFound") : t("cards")
    }`;
    renderScannerResults(matches);
  } catch (error) {
    console.error("Card scan failed", error);
    scannerProgress.textContent = t("scannerUnavailable");
  } finally {
    scannerDialog.removeAttribute("aria-busy");
    scannerDialog.querySelectorAll(".scanner-actions button").forEach(
      (button) => {
        button.disabled = false;
      },
    );
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
