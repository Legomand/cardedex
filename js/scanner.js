const scannerDialog = document.querySelector("#scannerDialog");
const scannerOpen = document.querySelector("#cardScannerOpen");
const scannerCameraInput = document.querySelector("#scannerCameraInput");
const scannerGalleryInput = document.querySelector("#scannerGalleryInput");
const scannerWorkspace = document.querySelector("#scannerWorkspace");
const scannerPreview = document.querySelector("#scannerPreview");
const scannerProgress = document.querySelector("#scannerProgress");
const scannerResults = document.querySelector("#scannerResults");
const scannerCameraDialog = document.querySelector("#scannerCameraDialog");
const scannerCameraVideo = document.querySelector("#scannerCameraVideo");
const scannerCameraCapture = document.querySelector("#scannerCameraCapture");
const scannerCameraStatus = document.querySelector("#scannerCameraStatus");

let scannerLibraryPromise;
let scannerPreviewUrl;
let scannerMatches = [];
let scannerBinderSession = null;
let scannerPhotoQueue = [];
let scannerNextPhotoId = 1;
let scannerBatchBusy = false;
let scannerBatchRunning = false;
let scannerBatchCancelled = false;
let scannerActiveBatchWorker = null;
const SCANNER_PHOTO_LIMIT = 20;
let scannerCameraStream = null;
let scannerCameraSession = 0;
let scannerCameraCapturing = false;
let scannerOcrProgress = null;
let scannerNativeCameraBusy = false;
let scannerReviewBusy = false;
let scannerBrowserWorker = null;
let scannerBrowserWorkerPromise = null;
let scannerBrowserWorkerGeneration = 0;
let scannerBrowserIdleTimer = null;
const scannerLookupCache = new Map();
const scannerLookupControllers = new Set();

function scannerNativePlugin() {
  const capacitor = window.Capacitor;
  return capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === "android"
    ? capacitor.Plugins?.CardScanner : null;
}

function scannerDeadline(promise, milliseconds = 15000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("Scan timed out"), { code: "SCAN_TIMEOUT" })), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

async function openNativeScannerCamera(plugin) {
  if (scannerNativeCameraBusy || scannerPhotoQueue.length >= SCANNER_PHOTO_LIMIT) return;
  scannerNativeCameraBusy = true;
  try {
    const result = await plugin.capturePhotos({
      limit: SCANNER_PHOTO_LIMIT - scannerPhotoQueue.length, language: state.settings.language,
    });
    for (const photo of result.photos || []) {
      try {
        const response = await fetch(window.Capacitor.convertFileSrc(photo.uri));
        if (!response.ok) throw new Error("Photo unavailable");
        const file = new File([await response.blob()], photo.name, { type: "image/jpeg" });
        await queueScannerPhotos([file]);
      } finally {
        // The queue now owns a Blob; release only this private native temporary file.
        await plugin.releasePhoto({ name: photo.name }).catch(() => {});
      }
    }
  } catch (error) {
    console.warn("Native camera unavailable", error.code || "CAMERA_FAILED");
    scannerProgress.textContent = t("scannerCameraUnavailable");
  } finally { scannerNativeCameraBusy = false; }
}

function setScannerCurrentProgress(key, values = {}, percentage = null) {
  scannerProgress.textContent = t(key, values);
  const bar = document.querySelector("#scannerCurrentProgress");
  bar.hidden = false;
  if (percentage === null) bar.removeAttribute("value");
  else bar.value = Math.max(0, Math.min(100, percentage));
  bar.setAttribute("aria-label", t(key, values));
}

function stopScannerCamera() {
  scannerCameraSession++;
  scannerCameraStream?.getTracks().forEach((track) => track.stop());
  scannerCameraStream = null;
  scannerCameraVideo.srcObject = null;
  scannerCameraCapture.disabled = true;
}

function finishScannerCamera() {
  stopScannerCamera();
  if (scannerCameraDialog.open) scannerCameraDialog.close();
}

async function openScannerCamera() {
  if (scannerBatchBusy || scannerCameraCapturing) return;
  const native = scannerNativePlugin();
  if (native) return openNativeScannerCamera(native);
  if (!navigator.mediaDevices?.getUserMedia) {
    // Ordinary browsers without live-camera support retain file capture.
    resetScannerInput(scannerCameraInput);
    return;
  }
  stopScannerCamera();
  const session = scannerCameraSession;
  scannerCameraStatus.textContent = t("scannerCameraStarting");
  scannerCameraDialog.showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    if (session !== scannerCameraSession || !scannerCameraDialog.open) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    scannerCameraStream = stream;
    scannerCameraVideo.srcObject = stream;
    await scannerCameraVideo.play();
    if (session !== scannerCameraSession) return;
    scannerCameraStatus.textContent = t("scannerCameraCount", { count: scannerPhotoQueue.length });
    scannerCameraCapture.disabled = scannerPhotoQueue.length >= SCANNER_PHOTO_LIMIT;
  } catch (error) {
    if (session !== scannerCameraSession) return;
    stopScannerCamera();
    console.warn("Camera could not start", error);
    scannerCameraStatus.textContent = t("scannerCameraUnavailable");
  }
}

async function captureScannerPhoto() {
  if (!scannerCameraStream || scannerCameraCapturing || scannerBatchBusy) return;
  if (scannerPhotoQueue.length >= SCANNER_PHOTO_LIMIT) {
    scannerCameraStatus.textContent = t("scannerBatchLimit");
    scannerCameraCapture.disabled = true;
    return;
  }
  if (!scannerCameraVideo.videoWidth || !scannerCameraVideo.videoHeight) return;
  scannerCameraCapturing = true;
  scannerCameraCapture.disabled = true;
  const session = scannerCameraSession;
  const canvas = document.createElement("canvas");
  try {
    canvas.width = scannerCameraVideo.videoWidth;
    canvas.height = scannerCameraVideo.videoHeight;
    canvas.getContext("2d", { alpha: false }).drawImage(scannerCameraVideo, 0, 0);
    const file = await scannerCanvasFile(canvas, `card-photo-${scannerNextPhotoId}.jpg`);
    // Back/Done during JPEG encoding discards this unqueued frame safely.
    if (session !== scannerCameraSession) return;
    await queueScannerPhotos([file]);
    if (session !== scannerCameraSession) return;
    scannerCameraStatus.textContent = t("scannerCameraCount", { count: scannerPhotoQueue.length });
  } catch (error) {
    console.warn("Camera photo could not be captured", error);
    if (session === scannerCameraSession) scannerCameraStatus.textContent = t("scannerCameraCaptureFailed");
  } finally {
    canvas.width = 1;
    canvas.height = 1;
    scannerCameraCapturing = false;
    scannerCameraCapture.disabled = !scannerCameraStream || scannerPhotoQueue.length >= SCANNER_PHOTO_LIMIT;
  }
}

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
  text("#scannerTipsTitle", "scannerTipsTitle");
  text("#scannerTips", "scannerTips");
  text("#scannerBatchIntro", "scannerBatchIntro");
  text("#scannerBatchStart", "scannerBatchStart");
  text("#scannerBatchClear", "scannerBatchClear");
  text("#scannerCameraTitle", "scannerCameraTitle");
  text("#scannerCameraDone", "scannerCameraDone");
  text("#scannerCameraHint", "scannerCameraHint");
  text("#scannerCameraCapture", "takePhoto");
  renderScannerPhotoQueue();
  text("#scannerPrivacy", scannerNativePlugin() ? "scannerNativePrivacy" : "scannerPrivacy");
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

async function disposeBrowserScannerWorker() {
  clearTimeout(scannerBrowserIdleTimer);
  scannerBrowserIdleTimer = null;
  scannerBrowserWorkerGeneration++;
  const worker = scannerBrowserWorker;
  scannerBrowserWorker = null;
  scannerBrowserWorkerPromise = null;
  if (worker) await worker.terminate().catch(() => {});
}

async function acquireBrowserScannerWorker(Tesseract) {
  clearTimeout(scannerBrowserIdleTimer);
  scannerBrowserIdleTimer = null;
  if (scannerBrowserWorker) return scannerBrowserWorker;
  if (scannerBrowserWorkerPromise) return scannerBrowserWorkerPromise;
  const generation = scannerBrowserWorkerGeneration;
  const pending = (async () => {
    const worker = await Tesseract.createWorker("eng", 1, {
      logger(message) {
        if (scannerBatchCancelled) return;
        if (message.status === "recognizing text") scannerOcrProgress?.(message.progress || 0);
        else if (!scannerOcrProgress && message.status) {
          setScannerCurrentProgress("scannerEngineLoading", {
            progress: Math.round(Math.max(0, Math.min(1, message.progress || 0)) * 100),
          });
        }
      },
    });
    // Closing while the model initializes must not resurrect an abandoned worker.
    if (generation !== scannerBrowserWorkerGeneration || scannerBatchCancelled) {
      await worker.terminate().catch(() => {});
      throw new Error("cancelled");
    }
    scannerBrowserWorker = worker;
    return worker;
  })();
  scannerBrowserWorkerPromise = pending;
  try { return await pending; }
  finally { if (scannerBrowserWorkerPromise === pending) scannerBrowserWorkerPromise = null; }
}

function releaseBrowserScannerWorker(worker) {
  if (!worker || worker !== scannerBrowserWorker) return;
  clearTimeout(scannerBrowserIdleTimer);
  // Reuse between batches/rescans, but bound idle WASM memory and release on close.
  scannerBrowserIdleTimer = setTimeout(() => { void disposeBrowserScannerWorker(); }, 60000);
  scannerBrowserIdleTimer.unref?.();
}

function browserScannerNameBand(image) {
  const canvas = scannerImageTile(image, 0.15, 0.075, 0.9, 0.18);
  const context = canvas.getContext("2d");
  context.filter = "invert(1)";
  context.drawImage(canvas, 0, 0);
  context.filter = "none";
  return canvas;
}

async function recognizeBrowserScannerImage(worker, image, focused = false) {
  const started = Date.now();
  const header = focused ? browserScannerNameBand(image) : scannerImageRegion(image, 0, 0.125, 1);
  const footer = focused
    ? scannerImageTile(image, 0, 0.78, 0.7, 1)
    : scannerImageTile(image, 0, 0.88, 0.7, 0.98);
  let retry, footerRetry;
  const read = async (canvas, key, start, end, whitelist, psm, threshold, invert = 1) => {
    if (scannerBatchCancelled) throw new Error("cancelled");
    await worker.setParameters({
      preserve_interword_spaces: "1", tessedit_pageseg_mode: String(psm),
      thresholding_method: String(threshold), tessedit_do_invert: String(invert),
      // Reset for every read: a footer whitelist must never leak into the next name.
      tessedit_char_whitelist: whitelist,
    });
    const report = (progress) => {
      if (scannerBatchCancelled) return;
      const value = Math.max(0, Math.min(1, progress));
      setScannerCurrentProgress(key, { progress: Math.round(value * 100) }, start + value * (end - start));
    };
    scannerOcrProgress = report;
    report(0);
    const result = await scannerDeadline(worker.recognize(canvas, {}, {
      text: true, blocks: false, hocr: false, tsv: false,
    }), Math.max(1, 15000 - (Date.now() - started)));
    if (scannerBatchCancelled) throw new Error("cancelled");
    report(1);
    return result.data.text || "";
  };
  try {
    // Two primary reads, at most one name retry and one footer retry. Attack-text/rotation sweeps and artwork downloads are
    // not part of the fast path; uncertain results get manual review / Scan again.
    let topText = await read(header, "scannerBrowserName", 0, 20, "", 6, 0);
    if (!focused && !scannerNativeNameEvidence({ topText }).strong && Date.now() - started < 10000) {
      // A tighter, inverted title band also handles white names on dark cards.
      retry = browserScannerNameBand(image);
      topText += "\n" + await read(retry, "scannerBrowserName", 20, 30, "", 6, 0);
    }
    let bottomText = await read(footer, "scannerBrowserNumber", 30, 45, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/|- ", 11, focused ? 0 : 2, focused ? 1 : 0);
    let collectorEvidence = browserScannerCollectorEvidence(bottomText);
    if (!focused && (!collectorEvidence.numbers.length || (!collectorEvidence.totals.length &&
      !collectorEvidence.numbers.some((number) => /^[A-Z]+\d+$/.test(number)))) && Date.now() - started < 10000) {
      footerRetry = scannerImageTile(image, 0, 0.78, 0.7, 1);
      const alternate = await read(footerRetry, "scannerBrowserNumber", 45, 55, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/|- ", 11, 0);
      bottomText += "\n" + alternate;
      collectorEvidence = browserScannerCollectorEvidence(alternate);
    }
    setScannerCurrentProgress("scannerBrowserNumber", { progress:100 }, 55);
    return { topText, bottomText, captionText: "", attackText: "", fullText: topText + "\n" + bottomText,
      collectorEvidence };
  } finally {
    scannerOcrProgress = null;
    header.width = footer.width = 1;
    header.height = footer.height = 1;
    if (retry) { retry.width = 1; retry.height = 1; }
    if (footerRetry) { footerRetry.width = 1; footerRetry.height = 1; }
  }
}

function browserScannerCollectorEvidence(text) {
  const value = String(text).split(/\r?\n/).filter((line) =>
    !/pokemon|pokémon|nintendo|creatures|game\s*fre/i.test(line) &&
    !/^\s*[©CBO0]*\s*(?:19|20)\d{2}\b/i.test(line)
  ).join("\n");
  const evidence = scannerCollectorEvidence(value);
  if (evidence.numbers.length && evidence.totals.length) return evidence;
  const promo = value.match(/\b(SWSH|SVP|SMP|SM|XY|DP|BW|PR)([0-9OQDISBZLT]{2,4})\b/i);
  if (promo && /\d/.test(promo[2]) && /[OQDISBZLT]/i.test(promo[2])) {
    const digits = promo[2].toUpperCase().replace(/[OQD]/g,"0").replace(/[ILT]/g,"1").replace(/S/g,"5").replace(/B/g,"8").replace(/Z/g,"2");
    return { numbers:[normalizeCollectorNumber(promo[1] + digits)], totals:[], uncertain:true };
  }
  // Weak footer-only repairs: a slash can be read as L/I or disappear; a border
  // can become a leading 1. Preserve raw OCR and ALWAYS require manual inclusion.
  // Restrict to zero-padded three-digit fractions, never copyright/year lines.
  for (const line of value.split(/\r?\n/)) {
    const pair = line.match(/\b[1I]?(0\d{2})\s*[LI]\s*(\d{3})\b/i) ||
      line.match(/\b[1I]?(0\d{2})(\d{3})\b/);
    if (!pair || Number(pair[2]) < Number(pair[1]) || Number(pair[2]) > 500) continue;
    return { numbers:[normalizeCollectorNumber(pair[1])], totals:[Number(pair[2])], uncertain:true };
  }
  return evidence;
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
  try { return prepareScannerCanvas(bitmap); }
  finally { bitmap.close(); }
}

function prepareScannerCanvas(bitmap) {
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
  return canvas;
}

async function recognizeNativeScannerImage(plugin, image, focused = false) {
  const started = Date.now();
  const read = (canvas) => scannerDeadline(plugin.recognize({
    base64: canvas.toDataURL("image/jpeg", 0.95).split(",")[1],
  }), Math.max(1, 15000 - (Date.now() - started)));
  setScannerCurrentProgress("scannerNativeReading");
  if (focused) {
    const header = scannerImageRegion(image, 0, 0.2, 1.15);
    const footer = scannerImageRegion(image, 0.74, 1, 1.35);
    try {
      const top = await read(header);
      if (scannerBatchCancelled) throw new Error("cancelled");
      setScannerCurrentProgress("scannerNativeFooter");
      const bottom = await read(footer);
      if (scannerBatchCancelled) throw new Error("cancelled");
      return { topText: top.text || "", captionText: "", attackText: "", bottomText: bottom.text || "", fullText: [top.text, bottom.text].join("\n") };
    } finally { header.width = footer.width = 1; header.height = footer.height = 1; }
  }
  const result = await read(image);
  if (scannerBatchCancelled) throw new Error("cancelled");
  const lines = Array.isArray(result.lines) ? result.lines : [];
  const region = (start, end) => lines.filter((line) =>
    Number(line.top) < end && Number(line.bottom) > start
  ).map((line) => line.text).join("\n");
  const recognized = {
    topText: region(0, 0.2), captionText: region(0.16, 0.5),
    attackText: region(0.4, 0.83), bottomText: region(0.74, 1), fullText: result.text || "",
  };
  // At most one focused retry, never the old rotation/tile sweep.
  const firstFooter = scannerCollectorEvidence(recognized.bottomText);
  if ((!firstFooter.numbers.length || firstFooter.uncertain) && Date.now() - started < 10000) {
    setScannerCurrentProgress("scannerNativeFooter");
    const footer = scannerImageRegion(image, 0.74, 1, 1.2);
    try {
      const retry = await read(footer);
      recognized.bottomText += "\n" + (retry.text || "");
    } finally { footer.width = 1; footer.height = 1; }
  }
  if (scannerBatchCancelled) throw new Error("cancelled");
  setScannerCurrentProgress("scannerNativeReadComplete", {}, 55);
  return recognized;
}

function prepareNativeScannerCanvas(source) {
  // Photos are already framed by the user. A foreground-component crop can
  // mistake artwork for the card and silently cut off its printed name/number.
  const scale = Math.min(1, 2400 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function scannerFastJson(url, deadline, { fresh = false } = {}) {
  if (scannerBatchCancelled) throw new Error("cancelled");
  if (!fresh && scannerLookupCache.has(url)) return scannerLookupCache.get(url);
  const controller = new AbortController();
  scannerLookupControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
  try {
    const response = await fetch(url, { signal: controller.signal, ...(fresh ? { cache: "no-cache" } : {}) });
    if (!response.ok) throw new Error("Card lookup failed");
    const value = await response.json();
    if (scannerLookupCache.size >= 40) scannerLookupCache.delete(scannerLookupCache.keys().next().value);
    scannerLookupCache.set(url, value);
    return value;
  } finally { clearTimeout(timer); scannerLookupControllers.delete(controller); }
}

async function scannerFastCandidates(recognized) {
  const rawText = [recognized.topText, recognized.bottomText, recognized.fullText].join("\n");
  const nameEvidence = scannerNativeNameEvidence(recognized);
  const pokemon = nameEvidence.pokemon;
  const footer = recognized.collectorEvidence || scannerCollectorEvidence(recognized.bottomText);
  const numbers = recognized.collectorNumbers || footer.numbers;
  const totals = footer.totals;
  const deadline = Date.now() + 8000;
  if (!pokemon && !numbers.length) return { candidates: [], pokemon: null, numbers, totals, hp: null };
  setScannerCurrentProgress("scannerSearching", {}, 60);
  const details = { hp: findScannedHp(recognized.topText), topText: recognized.topText, collectorTotals: totals };
  let cards = [];
  let numberFallback = false;
  let numberConflict = false;
  let numberUncertain = footer.uncertain;
  if (pokemon) {
    const printedName = tcgNameOverrides[pokemon.slug] || titleCase(pokemon.slug);
    const result = await scannerFastJson(`${TCG_API}/cards?name=${encodeURIComponent(printedName)}`, deadline);
    const exactName = new RegExp(`(^|[^a-z0-9])${printedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    cards = result.filter((card) => (card.image || cardImageOverrides[card.id]) && exactName.test(card.name));
    if (nameEvidence.strong && totals.length) {
      // Narrow by BOTH the confidently read species and printed set count.
      // A misread digit must never replace Metagross with Dwebble/Crobat.
      const scoped = await scannerScopedSpecies(printedName, totals, deadline);
      const allowed = new Set(cards.map((card) => card.id));
      const sameSpecies = scoped.filter((card) => allowed.has(card.id));
      if (sameSpecies.length) cards = sameSpecies;
      else {
        // A small OCR discrepancy in the denominator is weak evidence, not a
        // reason to discard a clear name. One bounded adjacent-count request.
        const adjacent = [...new Set(totals.flatMap((total) => [total - 1, total + 1]).filter((total) => total > 0))];
        const nearby = await scannerScopedSpecies(printedName, adjacent, deadline);
        const related = nearby.filter((card) => allowed.has(card.id));
        if (related.length) { cards = related; details.collectorTotals = adjacent; }
        else details.collectorTotals = [];
        numberUncertain = true;
      }
    }
  }
  // No guessed name must prevent a readable collector number from being tried.
  // With a printed total, cross-check the set too (061 is shared by many cards).
  if (!nameEvidence.strong && numbers.length) {
    const byNumber = await scannerNumberCandidates(numbers, totals, deadline);
    if (byNumber.length || !pokemon) {
      numberFallback = !pokemon || !byNumber.some((card) => cards.some((named) => named.id === card.id));
      cards = byNumber;
    }
  }
  if (nameEvidence.strong && numbers.length && !cards.some((card) => numbers.includes(normalizeCollectorNumber(card.localId)))) {
    numberConflict = true;
  }
  let matches = rankScannedCards(cards, rawText, numbers, details).slice(0, 6);
  // Text shortlist BEFORE network detail requests. No artwork fingerprint downloads.
  let done = 0;
  matches = await scannerMapConcurrent(matches, 3, async (card) => {
    try { return { ...card, ...await scannerFastJson(`${TCG_API}/cards/${card.id}`, deadline) }; }
    catch { return card; }
    finally { done++; if (!scannerBatchCancelled) setScannerCurrentProgress("scannerFastComparing", { done, total: matches.length }, 65 + done / matches.length * 30); }
  });
  matches = rankScannedCards(matches, rawText, numbers, details).slice(0, 5);
  return { candidates: matches, pokemon: numberFallback ? null : pokemon, numbers, totals, numberFallback, numberConflict, numberUncertain, hp: details.hp };
}

function scannerNativeNameEvidence(recognized) {
  const header = String(recognized.topText || "").split(/\r?\n/).filter((line) =>
    !/evol\w*\s+from/i.test(line)
  );
  for (const line of header) {
    const exact = findScannedPokemon(line, 0);
    if (exact) return { pokemon: exact, strong: true };
  }
  const pokedex = findScannedPokedexPokemon([recognized.captionText, recognized.fullText].join("\n"));
  if (pokedex) return { pokemon: pokedex, strong: true };
  return { pokemon: findScannedPokemon(header.join("\n"), 0.2), strong: false };
}

async function scannerScopedSpecies(name, counts, deadline) {
  // Numeric nested fields do not reliably support the API's pipe operator.
  // At most four small name+count requests, all sharing the lookup deadline.
  const lists = await Promise.all(counts.slice(0, 4).map((count) => scannerFastJson(
    `${TCG_API}/cards?name=${encodeURIComponent(name)}&set.cardCount.official=${encodeURIComponent("eq:" + count)}`, deadline,
  )));
  return [...new Map(lists.flat().map((card) => [card.id, card])).values()];
}

function scannerCollectorEvidence(text) {
  const value = String(text || "");
  // Contiguous tokens avoid treating printed set/language codes (CRI EN) as
  // collector prefixes. Whitespace around the slash may include OCR line breaks.
  const normalized = value.replace(/\b(TG|GG|SV|SVP|RC|SWSH|SMP|SM|XY|DP|BW|PR)[ \t-]+(?=\d{1,4}\s*[\/|])/gi, "$1");
  const pairs = [...normalized.matchAll(/\b([A-Z0-9]{1,12})\s*[\/|]\s*([A-Z0-9]{1,8})\b/gi)].filter((match) =>
    /\d/.test(match[2]) && (/\d/.test(match[1]) || /^[OQDISBZL]{1,4}$/i.test(match[1]))
  );
  let uncertain = false;
  const token = (value, promo = false) => {
    const original = promo ? value.toUpperCase().replace(/^[A-Z]*EN(?=[0-9OQD]*\d)/i, "") : value.toUpperCase();
    if (promo && /^(?:TG|GG|SV|SVP|RC|SWSH|SMP|SM|XY|DP|BW|PR|HGSS)\d{1,4}$/.test(original)) return normalizeCollectorNumber(original);
    if (!/^[0-9OQDISBZL]{1,4}$/.test(original)) { uncertain = true; return null; }
    const digits = original.replace(/[OQD]/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");
    if (digits !== original) uncertain = true;
    return normalizeCollectorNumber(digits);
  };
  let numbers = pairs.map((match) => token(match[1], true)).filter(Boolean);
  const totals = pairs.map((match) => token(match[2])).filter(Boolean).map(Number).filter((total) => total > 0);
  if (!numbers.length) {
    numbers = [...value.matchAll(/\b(?:TG|GG|SV|SVP|RC|SWSH|SMP|SM|XY|DP|BW|PR)[ \t-]*\d{1,4}\b/gi)].map((match) => normalizeCollectorNumber(match[0]));
    if (!numbers.length) numbers = value.split(/\r?\n/).filter((line) => /^\s*\d{2,3}\s*$/.test(line)).map((line) => normalizeCollectorNumber(line));
  }
  return { numbers: [...new Set(numbers)].slice(0, 2), totals: [...new Set(totals)].slice(0, 2), uncertain };
}

async function scannerNumberCandidates(numbers, totals, deadline) {
  const ids = [...new Set(numbers.flatMap((number) => /^\d+$/.test(number)
    ? [number, number.padStart(3, "0"), number.padStart(4, "0")] : [number]))];
  let url = `${TCG_API}/cards?localId=${encodeURIComponent("eq:" + ids.join("|"))}`;
  if (totals.length) url += `&set.cardCount.official=${encodeURIComponent("eq:" + totals.join("|"))}`;
  url += "&pagination:page=1&pagination:itemsPerPage=48";
  const cards = await scannerFastJson(url, deadline);
  return cards.filter((card) => (card.image || cardImageOverrides[card.id]) && numbers.includes(normalizeCollectorNumber(card.localId)));
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
  if (scanDetails.collectorTotals?.length && card.set?.cardCount?.official) {
    score += scanDetails.collectorTotals.includes(Number(card.set.cardCount.official)) ? 400 : -400;
  }
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
  const total = matches.length + Math.min(36, matches.length);
  onProgress(0, total);
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
      onProgress(completed, total);
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
    completed++;
    onProgress(completed, total);
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

async function recognizeScannerImage(Tesseract, image, sharedWorker = null) {
  const regions = [
    scannerImageRegion(image, 0, 0.17, 1.35),
    scannerImageRegion(image, 0.16, 0.5, 1.3),
    scannerImageRegion(image, 0.4, 0.83, 1.4),
    scannerImageRegion(image, 0.74, 1, 1.7),
  ];
  const ownsWorker = !sharedWorker;
  const logger = (message) => {
    if (message.status === "recognizing text") scannerOcrProgress?.(message.progress || 0);
  };
  const worker = sharedWorker || await Tesseract.createWorker("eng", 1, { logger });
  const readRegion = async (region, part = null) => {
    const report = (progress) => {
      const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);
      setScannerCurrentProgress(part === null ? "scannerRetryReading" : "scannerReadingSection",
        { part, progress: percentage }, percentage);
    };
    scannerOcrProgress = report;
    report(0);
    const result = await worker.recognize(region);
    report(1);
    return result;
  };
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
    });
    const topTexts = [];
    const top = await readRegion(regions[0], 1);
    topTexts.push(top.data.text || "");
    const caption = await readRegion(regions[1], 2);
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const attacks = await readRegion(regions[2], 3);
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
        const retry = await readRegion(
          scannerRotateImage(regions[0], angle),
        );
        topTexts.push(retry.data.text || "");
        if (findScannedPokemon(topTexts.at(-1), 0.36)) break;
      }
    }
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/- ",
    });
    const bottom = await readRegion(regions[3], 4);
    const bottomTexts = [bottom.data.text || ""];
    if (
      !findCollectorNumbers(
        `${attacks.data.text || ""}\n${bottomTexts[0]}`,
        true,
      ).length
    ) {
      const footer = scannerImageTile(image, 0, 0.78, 0.7, 1);
      const focused = await readRegion(footer);
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
          const result = await readRegion(source);
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
          const result = await readRegion(originalFooter);
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
          const result = await readRegion(source);
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
    scannerOcrProgress = null;
    if (ownsWorker) await worker.terminate();
  }
}

async function scanCardPicture(file) {
  if (scannerBatchBusy || !file?.type.startsWith("image/")) return;
  setScannerBatchBusy(true);
  document.querySelector("#scannerQualityWarning").textContent = "";
  scannerBinderSession = null;
  scannerPreview.parentElement.style.aspectRatio = "245/342";
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
    document.querySelector("#scannerQualityWarning").textContent =
      scannerQualityWarning(scannerBinderQuality(image));
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
    setScannerBatchBusy(false);
    scannerDialog.removeAttribute("aria-busy");
    scannerDialog.querySelectorAll(".scanner-actions button").forEach(
      (button) => {
        button.disabled = false;
      },
    );
  }
}



function setScannerBatchBusy(busy) {
  scannerBatchBusy = busy;
  scannerDialog.querySelectorAll(".scanner-actions button, .scanner-batch-controls button, [data-remove-photo]").forEach((button) => {
    button.disabled = busy;
  });
}

function renderScannerPhotoQueue() {
  const container = document.querySelector("#scannerPhotoBatch");
  if (!container) return;
  container.hidden = !scannerPhotoQueue.length;
  document.querySelector("#scannerBatchSummary").textContent = t("scannerBatchSummary", {
    photos: scannerPhotoQueue.length,
    cards: scannerPhotoQueue.reduce((sum, photo) => sum + photo.layout.columns * photo.layout.rows, 0),
  });
  document.querySelector("#scannerPhotoQueue").innerHTML = scannerPhotoQueue.map((photo, index) =>
    '<div class="scanner-photo-item"><img src="' + photo.previewUrl + '" alt=""><span>' +
    escapeHtml(t("scannerCurrentPhoto", { photo: index + 1, photos: scannerPhotoQueue.length })) +
    '</span><button type="button" data-remove-photo="' + photo.id + '">' +
    escapeHtml(t("scannerPhotoRemove")) + '</button></div>'
  ).join("");
  setScannerBatchBusy(scannerBatchBusy);
}

function clearScannerPhotoQueue() {
  scannerPhotoQueue.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  scannerPhotoQueue = [];
  renderScannerPhotoQueue();
}

async function queueScannerPhotos(files) {
  if (scannerBatchBusy) return;
  const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (!images.length) return;
  if (scannerPhotoQueue.length + images.length > SCANNER_PHOTO_LIMIT) {
    alert(t("scannerBatchLimit"));
    return;
  }
  setScannerBatchBusy(true);
  try {
    for (const file of images) {
      const bitmap = await createImageBitmap(file, { resizeWidth: 480 });
      let previewUrl;
      let previewData;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = Math.max(1, Math.round(bitmap.height * 160 / bitmap.width));
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        previewData = canvas.toDataURL("image/jpeg", 0.75);
        const previewFile = await scannerCanvasFile(canvas, "preview.jpg");
        previewUrl = URL.createObjectURL(previewFile);
      } finally { bitmap.close(); }
      scannerPhotoQueue.push({ id: scannerNextPhotoId++, file,
        layout: { columns: 1, rows: 1, id: "1x1" },
        previewUrl, previewData });
    }
    scannerBinderSession = null;
    scannerResults.innerHTML = "";
  } catch (error) {
    console.error("Could not queue photos", error);
    alert(t("scannerUnavailable"));
  } finally {
    setScannerBatchBusy(false);
    renderScannerPhotoQueue();
  }
}

function scannerQualityWarning(quality) {
  const warnings = [];
  if (quality.glare > 0.12) warnings.push(t("scannerGlareWarning"));
  if (quality.sharpness < 0.08) warnings.push(t("scannerBlurWarning"));
  return warnings.join(" ");
}

function scannerGroupCanvas(bitmap) {
  // Preserve the complete photo; both OCR engines read bounded text regions.
  const maximum = scannerNativePlugin() ? 2600 : 2400;
  const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function scannerBinderLayoutFor(page, requested = "auto") {
  if (requested === "3x3") return { columns: 3, rows: 3, id: "3x3" };
  if (requested === "3x4") return { columns: 3, rows: 4, id: "3x4" };
  if (requested === "4x4") return { columns: 4, rows: 4, id: "4x4" };
  if (page.scannerBinderLayout) return page.scannerBinderLayout;
  const tallness = page.height / page.width;
  return tallness > 1.62
    ? { columns: 3, rows: 4, id: "3x4" }
    : { columns: 3, rows: 3, id: "3x3" };
}

function scannerBinderMedian(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function scannerBinderLineRuns(values, threshold) {
  const runs = [];
  let start = null;
  for (let index = 0; index <= values.length; index++) {
    if (index < values.length && values[index] >= threshold) {
      if (start === null) start = index;
      continue;
    }
    if (start !== null) {
      if (runs.length && start - runs.at(-1).end <= 2) {
        runs.at(-1).end = index - 1;
        runs.at(-1).center = (runs.at(-1).start + index - 1) / 2;
      } else {
        runs.push({
          start,
          end: index - 1,
          center: (start + index - 1) / 2,
        });
      }
      start = null;
    }
  }
  return runs;
}

function scannerBinderRegularRuns(runs, minimumGap) {
  if (runs.length < 3) return [];
  const gaps = runs.slice(1).map((run, index) =>
    run.center - runs[index].center
  ).filter((gap) => gap >= minimumGap);
  const typical = scannerBinderMedian(gaps);
  if (!typical) return [];
  let best = [];
  let current = [runs[0]];
  for (let index = 1; index < runs.length; index++) {
    const gap = runs[index].center - runs[index - 1].center;
    if (gap >= typical * 0.65 && gap <= typical * 1.35) {
      current.push(runs[index]);
    } else {
      if (current.length > best.length) best = current;
      current = [runs[index]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

function scannerBinderDetectGridFromPixels(pixels, width, height) {
  const isDark = (offset) =>
    pixels[offset] + pixels[offset + 1] + pixels[offset + 2] < 210;
  const rows = Array.from({ length: height }, (_, y) => {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      if (isDark((y * width + x) * 4)) dark++;
    }
    return dark / width;
  });
  const horizontal = scannerBinderRegularRuns(
    scannerBinderLineRuns(rows, 0.68),
    height * 0.09,
  );
  if (horizontal.length < 4) return null;
  const top = horizontal[0].center;
  const bottom = horizontal.at(-1).center;
  const rowSpacing = scannerBinderMedian(
    horizontal.slice(1).map((run, index) =>
      run.center - horizontal[index].center
    ),
  );
  const columns = Array.from({ length: width }, (_, x) => {
    let dark = 0;
    let samples = 0;
    for (let y = Math.max(0, Math.floor(top)); y <= Math.min(height - 1, Math.ceil(bottom)); y++) {
      if (isDark((y * width + x) * 4)) dark++;
      samples++;
    }
    return dark / Math.max(1, samples);
  });
  const vertical = scannerBinderRegularRuns(
    scannerBinderLineRuns(columns, 0.6),
    width * 0.1,
  );
  if (vertical.length < 3) return null;
  const columnSpacing = scannerBinderMedian(
    vertical.slice(1).map((run, index) =>
      run.center - vertical[index].center
    ),
  );
  const detectedRows = Math.round((bottom - top) / rowSpacing);
  let left = vertical[0].center;
  if (left > columnSpacing * 0.55) left -= columnSpacing;
  let right = vertical.at(-1).center;
  if (width - right > columnSpacing * 0.55) right += columnSpacing;
  const detectedColumns = Math.round((right - left) / columnSpacing);
  if (![3, 4].includes(detectedColumns) || ![3, 4].includes(detectedRows)) {
    return null;
  }
  const xPadding = columnSpacing * 0.12;
  const yPadding = rowSpacing * 0.25;
  return {
    layout: {
      columns: detectedColumns,
      rows: detectedRows,
      id: `${detectedColumns}x${detectedRows}`,
    },
    bounds: {
      x: Math.max(0, left - xPadding),
      y: Math.max(0, top - yPadding),
      width: Math.min(width, right + xPadding) - Math.max(0, left - xPadding),
      height: Math.min(height, bottom + yPadding) - Math.max(0, top - yPadding),
    },
  };
}

function scannerBinderDetectGrid(page) {
  const scale = Math.min(1, 320 / page.height, 220 / page.width);
  const sample = document.createElement("canvas");
  sample.width = Math.max(1, Math.round(page.width * scale));
  sample.height = Math.max(1, Math.round(page.height * scale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(page, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const detected = scannerBinderDetectGridFromPixels(
    pixels,
    sample.width,
    sample.height,
  );
  if (!detected) return null;
  detected.bounds.x /= scale;
  detected.bounds.y /= scale;
  detected.bounds.width /= scale;
  detected.bounds.height /= scale;
  return detected;
}

function scannerBinderPageCanvas(bitmap) {
  const rotated = bitmap.width > bitmap.height;
  const naturalWidth = rotated ? bitmap.height : bitmap.width;
  const naturalHeight = rotated ? bitmap.width : bitmap.height;
  const scale = Math.min(1, 2600 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (rotated) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(
      bitmap,
      0,
      0,
      bitmap.width,
      bitmap.height,
      0,
      0,
      canvas.height,
      canvas.width,
    );
  } else {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }
  const detected = scannerBinderDetectGrid(canvas);
  if (!detected) return canvas;
  const cropped = document.createElement("canvas");
  cropped.width = Math.max(1, Math.round(detected.bounds.width));
  cropped.height = Math.max(1, Math.round(detected.bounds.height));
  cropped.getContext("2d", { alpha: false }).drawImage(
    canvas,
    detected.bounds.x,
    detected.bounds.y,
    detected.bounds.width,
    detected.bounds.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );
  cropped.scannerBinderLayout = detected.layout;
  return cropped;
}

function scannerBinderCrop(page, layout, row, column) {
  const outerX = page.width * 0.018;
  const outerY = page.height * 0.018;
  const usableWidth = page.width - outerX * 2;
  const usableHeight = page.height - outerY * 2;
  const cellWidth = usableWidth / layout.columns;
  const cellHeight = usableHeight / layout.rows;
  const insetX = cellWidth * 0.025;
  const insetY = cellHeight * 0.018;
  const sourceX = outerX + column * cellWidth + insetX;
  const sourceY = outerY + row * cellHeight + insetY;
  const sourceWidth = cellWidth - insetX * 2;
  const sourceHeight = cellHeight - insetY * 2;
  const ratio = 245 / 342;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = sourceX;
  let cropY = sourceY;
  if (cropWidth / cropHeight > ratio) {
    cropWidth = cropHeight * ratio;
    cropX += (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = cropWidth / ratio;
    cropY += (sourceHeight - cropHeight) / 2;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = Math.round(canvas.width / ratio);
  canvas.getContext("2d", { alpha: false }).drawImage(
    page,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function scannerBinderQuality(source) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 67;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let edges = 0;
  let comparisons = 0;
  let glare = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      const value = (
        pixels[index] * 0.299 +
        pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.114
      );
      const spread = Math.max(
        pixels[index],
        pixels[index + 1],
        pixels[index + 2],
      ) - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
      if (value > 245 && spread < 14) glare++;
      if (x) {
        const left = index - 4;
        const leftValue = (
          pixels[left] * 0.299 +
          pixels[left + 1] * 0.587 +
          pixels[left + 2] * 0.114
        );
        edges += Math.abs(value - leftValue);
        comparisons++;
      }
      if (y) {
        const above = index - canvas.width * 4;
        const aboveValue = (
          pixels[above] * 0.299 +
          pixels[above + 1] * 0.587 +
          pixels[above + 2] * 0.114
        );
        edges += Math.abs(value - aboveValue);
        comparisons++;
      }
    }
  }
  return {
    sharpness: Math.min(1, edges / Math.max(1, comparisons) / 28),
    glare: glare / (canvas.width * canvas.height),
  };
}

function scannerCanvasFile(canvas, name) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not prepare binder crop"));
        return;
      }
      resolve(new File([blob], name, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92)
  );
}

async function scanBinderSlot(Tesseract, worker, crop, position, focused = false) {
  setScannerCurrentProgress("scannerPreparing");
  const quality = scannerBinderQuality(crop);
  const native = scannerNativePlugin();
  // Preserve the entire photo on BOTH platforms; artwork-based cropping can
  // remove the printed name or number before recognition even starts.
  const image = prepareNativeScannerCanvas(crop);
  try {
    const recognized = native
      ? await recognizeNativeScannerImage(native, image, focused)
      : await recognizeBrowserScannerImage(worker, image, focused);
    const result = await scannerFastCandidates(recognized);
    if (scannerBatchCancelled) throw new Error("cancelled");
    const exactNumber = Boolean(!result.numberFallback && !result.numberUncertain && !result.numberConflict &&
      result.pokemon && result.candidates.length === 1 &&
      result.numbers.includes(normalizeCollectorNumber(result.candidates[0].localId)));
    const confidence = exactNumber ? 0.9 : result.candidates.length ? 0.5 : 0;
    return {
      position, quality, crop: image.toDataURL("image/jpeg", 0.78),
      candidates: result.candidates, selectedId: result.candidates[0]?.id || null,
      include: exactNumber && quality.glare < 0.15 && quality.sharpness > 0.2,
      confidence, numberFallback: result.numberFallback,
      numberConflict: result.numberConflict, numberUncertain: result.numberUncertain,
      evidence: { name: result.pokemon?.slug || null, collectorNumbers: result.numbers,
        collectorTotals: result.totals, hp: result.hp },
    };
  } finally { image.width = 1; image.height = 1; }
}

function scannerBinderJson(session) {
  return {
    schema: session.photos ? "cardedex-card-photo-batch/v1" : "cardedex-binder-scan/v1",
    source: "on-device",
    ...(session.photos ? { photos: session.photos } : {
      layout: session.layout.id, columns: session.layout.columns, rows: session.layout.rows,
    }),
    slots: session.slots.map((slot) => ({
      position: slot.position,
      ...(slot.photo ? { photo: slot.photo, photoPosition: slot.photoPosition } : {}),
      ...(slot.layoutUncertain ? { layoutUncertain: true } : {}),
      confidence: Number(slot.confidence.toFixed(3)),
      quality: {
        sharpness: Number(slot.quality.sharpness.toFixed(3)),
        glare: Number(slot.quality.glare.toFixed(3)),
      },
      evidence: slot.evidence,
      include: slot.include,
      selectedId: slot.selectedId,
      candidates: slot.candidates.map((card) => ({
        id: card.id,
        name: card.name,
        localId: card.localId,
        set: card.set?.name || card.setCode || null,
      })),
    })),
  };
}

function scannerPrintingMatched(slot) {
  const card = slot.candidates.find((candidate) => candidate.id === slot.selectedId);
  return Boolean(card && slot.matchSource !== "manual" && !slot.manualDirty &&
    !slot.numberFallback && !slot.numberConflict && !slot.numberUncertain && !slot.layoutUncertain &&
    slot.confidence >= 0.9 && slot.candidates.length === 1 && slot.evidence?.name &&
    slot.evidence.collectorNumbers?.includes(normalizeCollectorNumber(card.localId)));
}

function scannerReviewStatus(slot) {
  if (!slot.candidates.length) return { key: "scannerPrintingUnknown", hint: "scannerNoReliableMatch", matched: false };
  if (scannerPrintingMatched(slot)) return { key: "scannerPrintingMatched", hint: "scannerPrintingMatchedHint", matched: true };
  if (slot.matchSource === "manual") return { key: "scannerPrintingSearch", hint: "scannerPrintingChooseHint", matched: false };
  if (slot.numberConflict || slot.numberUncertain || slot.manualDirty || slot.layoutUncertain) {
    return { key: "scannerPrintingCheck", hint: "scannerPrintingCheckHint", matched: false };
  }
  if (slot.numberFallback) return { key: "scannerPrintingNumber", hint: "scannerPrintingNumberHint", matched: false };
  if (slot.evidence?.name && !slot.evidence.collectorNumbers?.length) {
    return { key: "scannerPrintingName", hint: "scannerPrintingNameHint", matched: false };
  }
  return { key: "scannerPrintingChoose", hint: "scannerPrintingChooseHint", matched: false };
}

function scannerPrintingStatusHtml(slot) {
  const status = scannerReviewStatus(slot);
  return `<div class="scanner-printing-status ${status.matched ? "matched" : "review"}"><strong>${escapeHtml(t(status.key))}</strong><small>${escapeHtml(t(status.hint))}</small></div>`;
}

function updateScannerReviewSummary() {
  const found = scannerBinderSession.slots.filter((slot) =>
    slot.candidates.length
  ).length;
  const matched = scannerBinderSession.slots.filter(scannerPrintingMatched).length;
  scannerProgress.textContent = t(scannerBinderSession.photos ? "scannerBatchReviewInfo" : "binderFound", {
    photos: scannerBinderSession.photos?.length,
    found,
    total: scannerBinderSession.slots.length,
    matched,
    review: scannerBinderSession.slots.length - matched,
  });
}

function renderBinderReview() {
  if (!scannerBinderSession) return;
  document.querySelector("#scannerCurrentPhoto").hidden = true;
  document.querySelector("#scannerCurrentProgress").hidden = true;
  updateScannerReviewSummary();
  scannerResults.innerHTML = `<div class="binder-review-header"><h3>${
    t("scannerBatchReview")
  }</h3><span></span></div>
    <div class="binder-review-grid">${scannerBinderSession.slots.map((slot) => {
      const statusHtml = scannerPrintingStatusHtml(slot);
      if (!slot.candidates.length) {
        return `<article class="binder-slot low" data-binder-position="${slot.position}">
          <div class="binder-slot-image"><img src="${slot.crop}" alt=""><span>${escapeHtml(slot.photo ? t("scannerPhotoLabel", { photo: slot.photo, layout: "#" + slot.photoPosition }) : "#" + slot.position)}</span></div>
          <div class="binder-slot-empty">${statusHtml}${scannerManualControl(slot.position)}${scannerRecheckControl(slot)}</div>
        </article>`;
      }
      return `<article class="binder-slot ${slot.confidence < 0.68 ? "low" : ""}" data-binder-position="${slot.position}">
        <div class="binder-slot-image"><img src="${slot.crop}" alt=""><span>${escapeHtml(slot.photo ? t("scannerPhotoLabel", { photo: slot.photo, layout: "#" + slot.photoPosition }) : "#" + slot.position)}</span></div>
        <div class="binder-slot-copy">
          ${statusHtml}
          <small class="binder-slot-warning">${escapeHtml((slot.layoutUncertain ? t("scannerLayoutUnclearHint") + " " : "") + scannerQualityWarning(slot.quality))}</small>
          ${slot.numberFallback ? `<small class="binder-slot-warning">${escapeHtml(t("scannerNumberFallback"))}</small>` : ""}
          ${slot.numberConflict || slot.numberUncertain ? `<small class="binder-slot-warning">${escapeHtml(t(slot.numberConflict ? "scannerNumberConflict" : "scannerNumberUncertain"))}</small>` : ""}
          <div class="scanner-candidate-grid" role="group" aria-label="${escapeHtml(t("scannerMatches"))}">${slot.candidates.map((card) =>
            `<button type="button" class="scanner-candidate" data-binder-candidate="${slot.position}" data-card-id="${escapeHtml(card.id)}" aria-pressed="${card.id === slot.selectedId}"><img src="${escapeHtml(cardImageUrl(card, "low"))}" alt="${escapeHtml(card.name)}" loading="lazy"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.set?.name || card.setCode || setCode(card.id))} · #${escapeHtml(card.localId)}</small></button>`
          ).join("")}</div>
          <div class="binder-slot-meta"><label><input type="checkbox" data-binder-include="${slot.position}" ${slot.include ? "checked" : ""}> ${escapeHtml(t("binderInclude"))}</label></div>
          ${scannerManualControl(slot.position)}
          ${scannerRecheckControl(slot)}
        </div>
      </article>`;
    }).join("")}</div>
    <div class="binder-add"><button type="button" id="scannerBinderAdd" ${
      scannerBinderSession.slots.some((slot) => slot.include && slot.selectedId)
        ? ""
        : "disabled"
    }>${escapeHtml(t("binderAddSelected"))}</button></div>`;
  scannerBinderSession.json = scannerBinderJson(scannerBinderSession);
}

function scannerRecheckControl(slot) {
  const canScan = scannerBinderSession?.sourcePhotos?.[slot.photo - 1];
  return `<div class="scanner-recheck"><button type="button" data-scanner-recheck="${slot.position}" ${!canScan || scannerBinderSession.applied ? "disabled" : ""}>${escapeHtml(t("scannerScanAgain"))}</button><small role="status">${escapeHtml(slot.recheckMessage ? t(slot.recheckMessage) : "")}</small></div>`;
}

function chooseScannerCandidate(position, id) {
  if (!scannerBinderSession || scannerBinderSession.applied || scannerReviewBusy || scannerBatchBusy) return;
  const slot = scannerBinderSession.slots.find((slot) => slot.position === position);
  if (!slot?.candidates.some((card) => card.id === id)) return;
  if (slot.selectedId !== id) slot.include = false;
  slot.selectedId = id;
  scannerResults.querySelectorAll(`[data-binder-candidate="${position}"]`).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.cardId === id));
  });
  const include = scannerResults.querySelector(`[data-binder-include="${position}"]`);
  if (include) include.checked = slot.include;
  const add = document.querySelector("#scannerBinderAdd");
  if (add) add.disabled = !scannerBinderSession.slots.some((slot) => slot.include && slot.selectedId);
  scannerBinderSession.json = scannerBinderJson(scannerBinderSession);
}

function mergeScannerRecheck(slot, fresh) {
  const oldSelected = slot.selectedId;
  const numberAgrees = slot.evidence.name && slot.evidence.name === fresh.evidence.name &&
    slot.evidence.collectorNumbers?.some((number) => fresh.evidence.collectorNumbers?.includes(number));
  const agreed = Boolean(oldSelected && numberAgrees && fresh.candidates.some((card) => card.id === oldSelected));
  const combined = [...new Map([...fresh.candidates, ...slot.candidates].map((card) => [card.id, card])).values()];
  const previous = combined.find((card) => card.id === oldSelected);
  slot.candidates = combined.slice(0, 8);
  if (previous && !slot.candidates.some((card) => card.id === oldSelected)) slot.candidates[7] = previous;
  slot.selectedId = previous ? oldSelected : fresh.selectedId;
  slot.include = false; // A recheck always asks the user to confirm again.
  slot.matchSource = "scan";
  slot.recheckMessage = !fresh.candidates.length ? "scannerRecheckUnreadable" : agreed ? "scannerRecheckAgreed" : "scannerRecheckChanged";
  slot.numberFallback = fresh.numberFallback;
  slot.numberConflict = fresh.numberConflict;
  slot.numberUncertain = fresh.numberUncertain;
  if (agreed) slot.confidence = Math.max(slot.confidence, fresh.confidence);
  else slot.confidence = Math.min(0.5, fresh.confidence);
  if (fresh.candidates.length) slot.evidence = fresh.evidence;
}

async function recheckScannerPhoto(button) {
  const session = scannerBinderSession;
  const slot = session?.slots.find((slot) => slot.position === Number(button.dataset.scannerRecheck));
  const source = session?.sourcePhotos?.[slot?.photo - 1];
  if (!slot || !source || session.applied || scannerBatchBusy || scannerReviewBusy) return;
  scannerReviewBusy = true;
  setScannerBatchBusy(true);
  scannerBatchCancelled = false;
  const scrollTop = scannerDialog.scrollTop;
  scannerResults.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
  scannerWorkspace.hidden = false;
  const currentPhoto = document.querySelector("#scannerCurrentPhoto");
  currentPhoto.hidden = false;
  currentPhoto.textContent = t("scannerRecheckingPhoto", { photo: slot.photo });
  scannerPreview.src = slot.crop;
  let page, worker;
  try {
    const Tesseract = scannerNativePlugin() ? null : await loadScannerLibrary();
    if (scannerBatchCancelled) throw new Error("cancelled");
    worker = Tesseract ? await acquireBrowserScannerWorker(Tesseract) : null;
    scannerActiveBatchWorker = worker;
    const bitmap = await createImageBitmap(source.file);
    try { page = scannerGroupCanvas(bitmap); } finally { bitmap.close(); }
    const fresh = await scanBinderSlot(Tesseract, worker, page, slot.position, true);
    if (scannerBatchCancelled || scannerBinderSession !== session || session.applied) return;
    mergeScannerRecheck(slot, fresh);
  } catch (error) {
    if (error.code === "SCAN_TIMEOUT") await disposeBrowserScannerWorker();
    if (!scannerBatchCancelled && scannerBinderSession === session) slot.recheckMessage = "scannerRecheckFailed";
  } finally {
    scannerOcrProgress = null;
    scannerActiveBatchWorker = null;
    if (scannerBatchCancelled) await disposeBrowserScannerWorker();
    else releaseBrowserScannerWorker(worker);
    if (page) { page.width = 1; page.height = 1; }
    scannerReviewBusy = false;
    setScannerBatchBusy(false);
    if (scannerBinderSession === session) {
      renderBinderReview();
      scannerDialog.scrollTop = scrollTop;
    }
  }
}

function scannerManualControl(position) {
  const slot = scannerBinderSession?.slots.find((slot) => slot.position === position);
  const evidence = slot?.evidence;
  const fallbackName = slot?.numberFallback ? slot.candidates.find((card) => card.id === slot.selectedId)?.name : null;
  const name = slot?.manualName ?? evidence?.name?.replace(/-/g, " ") ?? fallbackName ?? "";
  const number = slot?.manualNumber ?? (evidence?.collectorNumbers?.length
    ? [evidence.collectorNumbers[0], evidence.collectorTotals?.[0]].filter((value) => value !== undefined && value !== null && value !== "").join("/") : "");
  const message = slot?.manualMessageKey ? t(slot.manualMessageKey, slot.manualMessageValues || {}) : "";
  return `<form class="scanner-manual" data-scanner-form="${position}"><div class="scanner-manual-fields"><label>${escapeHtml(t("scannerManualName"))}<input type="text" maxlength="100" data-scanner-name="${position}" value="${escapeHtml(name)}" placeholder="Pikachu" autocomplete="off" spellcheck="false" enterkeyhint="search"></label><label>${escapeHtml(t("scannerManualNumber"))}<input type="text" maxlength="24" data-scanner-number="${position}" value="${escapeHtml(number)}" placeholder="025/165" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search" aria-describedby="scannerNumberHint-${position}"></label></div><small id="scannerNumberHint-${position}">${escapeHtml(t("scannerManualNumberHint"))}</small><button type="submit" data-scanner-search="${position}">${escapeHtml(t("scannerManualSearch"))}</button><small data-scanner-search-status="${position}" role="status">${escapeHtml(message)}</small></form>`;
}

function updateScannerManualInput(input) {
  if (!scannerBinderSession || scannerBinderSession.applied || scannerReviewBusy || scannerBatchBusy) return;
  const position = Number(input.dataset.scannerName || input.dataset.scannerNumber);
  const slot = scannerBinderSession.slots.find((item) => item.position === position);
  if (!slot) return;
  if (input.dataset.scannerName) slot.manualName = input.value.slice(0, 100);
  else slot.manualNumber = input.value.slice(0, 24);
  slot.manualDirty = true;
  slot.manualMessageKey = "scannerManualPending";
  slot.include = false;
  const include = scannerResults.querySelector(`[data-binder-include="${position}"]`);
  if (include) include.checked = false;
  const status = scannerResults.querySelector(`[data-scanner-search-status="${position}"]`);
  if (status) status.textContent = t("scannerManualPending");
  const add = document.querySelector("#scannerBinderAdd");
  if (add) add.disabled = !scannerBinderSession.slots.some((item) => item.include && item.selectedId);
  const printingStatus = scannerResults.querySelector(`[data-binder-position="${position}"] .scanner-printing-status`);
  if (printingStatus) printingStatus.outerHTML = scannerPrintingStatusHtml(slot);
  updateScannerReviewSummary();
  scannerBinderSession.json = scannerBinderJson(scannerBinderSession);
}

function scannerManualNumbers(text) {
  // Unlike OCR, typed input must not turn a name suffix ("Mew ex 025")
  // into a fictitious collector prefix such as EX25.
  const trailing = text.match(/\b([A-Z]{0,5}\d{1,4})(?:[ \t]*[\/|][ \t]*[A-Z]{0,5}\d{1,4})?\s*$/i);
  return trailing ? [normalizeCollectorNumber(trailing[1])] : [];
}

function scannerManualQuery(text, numberText = "") {
  const typedNumber = String(numberText).trim().slice(0, 24);
  if (typedNumber && !/^[A-Z]{0,5}\d{1,4}(?:\s*[\/|]\s*[A-Z]{0,5}\d{1,4})?$/i.test(typedNumber)) {
    throw Object.assign(new Error("Enter a collector number"), { code: "NUMBER_INVALID" });
  }
  const value = [String(text).trim().slice(0, 100), typedNumber].filter(Boolean).join(" ");
  const numbers = scannerManualNumbers(value);
  const name = value.replace(/\b[A-Z]{0,5}\d{1,4}(?:[ \t]*[\/|][ \t]*[A-Z]{0,5}[ \t-]*\d{1,4})?\s*$/i, "").trim();
  if ((name.match(/\p{L}/gu) || []).length < 2) {
    throw Object.assign(new Error("Enter a card name"), { code: "NAME_REQUIRED" });
  }
  const fraction = value.match(/\b[A-Z]{0,5}\d{1,4}\s*[\/|]\s*(\d{1,4})\s*$/i);
  const totals = fraction && Number(fraction[1]) > 0 ? [Number(fraction[1])] : [];
  return { name, numbers, totals };
}

async function scannerManualCandidates(query) {
  const deadline = Date.now() + 8000;
  // Typed searches go straight to the catalogue, even before Pokédex aliases load.
  // Explicit Search also refreshes the name list instead of replaying scan cache.
  let url = `${TCG_API}/cards?name=${encodeURIComponent(query.name)}`;
  if (query.totals?.length) url += `&set.cardCount.official=${encodeURIComponent("eq:" + query.totals[0])}`;
  const cards = await scannerFastJson(url, deadline, { fresh: true });
  const expected = normalizeCardName(query.name);
  const filtered = cards.filter((card) => (card.image || cardImageOverrides[card.id]) &&
    normalizeCardName(card.name).includes(expected) &&
    (!query.numbers.length || query.numbers.includes(normalizeCollectorNumber(card.localId)))
  );
  const shortlist = rankScannedCards(filtered, query.name, query.numbers).slice(0, 6);
  const matches = await scannerMapConcurrent(shortlist, 3, async (card) => {
    try { return { ...card, ...await scannerFastJson(`${TCG_API}/cards/${card.id}`, deadline) }; }
    catch { return card; }
  });
  return rankScannedCards(matches, query.name, query.numbers).slice(0, 5);
}

async function searchScannerManual(button) {
  const session = scannerBinderSession;
  if (!session || session.applied || scannerBatchBusy || scannerReviewBusy) return;
  const position = Number(button.dataset.scannerSearch);
  const input = scannerResults.querySelector(`[data-scanner-name="${position}"]`);
  const numberInput = scannerResults.querySelector(`[data-scanner-number="${position}"]`);
  const status = scannerResults.querySelector(`[data-scanner-search-status="${position}"]`);
  const slot = session.slots.find((slot) => slot.position === position);
  if (!slot || !input || !numberInput || !status) return;
  const text = input.value.trim().slice(0, 100);
  const numberText = numberInput.value.trim().slice(0, 24);
  updateScannerManualInput({ dataset: { scannerName: String(position) }, value: text });
  updateScannerManualInput({ dataset: { scannerNumber: String(position) }, value: numberText });
  slot.manualName = text;
  slot.manualNumber = numberText;
  slot.manualText = [text, numberText].filter(Boolean).join(" ");
  const show = (key, values = {}) => {
    slot.manualMessageKey = key;
    slot.manualMessageValues = values;
    status.textContent = t(key, values);
  };
  let query;
  try { query = scannerManualQuery(text, numberText); }
  catch (error) { show(error.code === "NUMBER_INVALID" ? "scannerManualNumberInvalid" : "scannerManualNameRequired"); return; }
  const scrollTop = scannerDialog.scrollTop;
  const focusedField = document.activeElement === numberInput ? "number" : document.activeElement === input ? "name" : null;
  scannerReviewBusy = true;
  scannerBatchCancelled = false;
  setScannerBatchBusy(true);
  button.disabled = true;
  show("scannerSearching");
  scannerResults.setAttribute("aria-busy", "true");
  scannerResults.inert = true;
  try {
    const candidates = await scannerManualCandidates(query);
    if (scannerBatchCancelled || scannerBinderSession !== session || session.applied) return;
    if (!candidates.length) { show("scannerManualNoResults"); return; }
    const unchanged = slot.candidates.map((card) => card.id).join("\n") === candidates.map((card) => card.id).join("\n");
    slot.candidates = candidates;
    slot.selectedId = candidates[0].id;
    slot.include = false;
    slot.confidence = 0.5;
    slot.matchSource = "manual";
    slot.manualDirty = false;
    slot.numberFallback = false;
    slot.numberConflict = false;
    slot.numberUncertain = false;
    slot.evidence = { name: query.name, collectorNumbers: query.numbers, collectorTotals: query.totals, hp: null };
    show(unchanged ? "scannerManualSameResults" : "scannerManualFound", { count: candidates.length });
    renderBinderReview();
  } catch (error) {
    if (!scannerBatchCancelled && scannerBinderSession === session) show(error.name === "AbortError" ? "scannerManualTimeout" : "scannerManualFailed");
  }
  finally {
    scannerReviewBusy = false;
    setScannerBatchBusy(false);
    button.disabled = false;
    scannerResults.inert = false;
    scannerResults.removeAttribute("aria-busy");
    scannerDialog.scrollTop = scrollTop;
    if (focusedField && scannerBinderSession === session) {
      scannerResults.querySelector(`[data-scanner-${focusedField}="${position}"]`)?.focus?.({ preventScroll: true });
    }
    document.querySelector("#scannerCurrentProgress").hidden = true;
  }
}

async function scanQueuedCardPhotos() {
  if (scannerBatchBusy || scannerReviewBusy || !scannerPhotoQueue.length) return;
  const photos = [...scannerPhotoQueue];
  setScannerBatchBusy(true);
  scannerBatchRunning = true;
  scannerBatchCancelled = false;
  scannerDialog.setAttribute("aria-busy", "true");
  scannerMatches = [];
  scannerBinderSession = null;
  scannerResults.innerHTML = "";
  scannerWorkspace.hidden = false;
  document.querySelector("#scannerQualityWarning").textContent = "";
  requestAnimationFrame(() => scannerWorkspace.scrollIntoView({ block: "start", behavior: "smooth" }));
  const currentPhoto = document.querySelector("#scannerCurrentPhoto");
  const slots = [];
  let failedPhotos = 0;
  let worker;
  const showPhoto = (index) => {
    currentPhoto.hidden = false;
    currentPhoto.textContent = t("scannerCurrentPhoto", { photo: index + 1, photos: photos.length });
    scannerPreview.src = photos[index].previewData;
    setScannerCurrentProgress("scannerPreparing");
  };
  try {
    showPhoto(0);
    setScannerCurrentProgress("binderPreparing");
    const Tesseract = scannerNativePlugin() ? null : await loadScannerLibrary();
    if (scannerBatchCancelled) throw new Error("cancelled");
    worker = Tesseract ? await acquireBrowserScannerWorker(Tesseract) : null;
    scannerActiveBatchWorker = worker;
    for (let photoIndex = 0; photoIndex < photos.length; photoIndex++) {
      if (scannerBatchCancelled) throw new Error("cancelled");
      const photo = photos[photoIndex];
      showPhoto(photoIndex);
      let page;
      try {
        const bitmap = await createImageBitmap(photo.file);
        try { page = scannerGroupCanvas(bitmap); }
        finally { bitmap.close(); }
        if (scannerBatchCancelled) throw new Error("cancelled");
        scannerPreview.src = page.toDataURL("image/jpeg", 0.75);
        scannerPreview.parentElement.style.aspectRatio = page.width + "/" + page.height;
        const slot = await scanBinderSlot(Tesseract, worker, page, slots.length + 1);
        if (scannerBatchCancelled) throw new Error("cancelled");
        slot.photo = photoIndex + 1;
        slot.photoPosition = 1;
        slots.push(slot);
        setScannerCurrentProgress("scannerPhotoComplete", {}, 100);
      } catch (error) {
        if (scannerBatchCancelled) throw error;
        if (error.code === "SCAN_TIMEOUT" || error.code === "OCR_BUSY") throw error;
        console.warn("Photo could not be scanned", photoIndex + 1, error);
        failedPhotos++;
        slots.push({
          position: slots.length + 1, photo: photoIndex + 1, photoPosition: 1,
          quality: { glare: 0, sharpness: 0 }, crop: photo.previewData,
          candidates: [], selectedId: null, include: false, confidence: 0,
          evidence: { name: null, collectorNumbers: [], hp: null },
        });
      } finally { if (page) { page.width = 1; page.height = 1; } }
    }
    if (scannerBatchCancelled) throw new Error("cancelled");
    scannerBinderSession = {
      layout: { id: "photo-batch", columns: 1, rows: 1 },
      photos: photos.map((photo, index) => ({ photo: index + 1, layout: photo.layout })),
      sourcePhotos: photos,
      slots, applied: false, createdAt: new Date().toISOString(),
    };
    renderBinderReview();
    if (failedPhotos) {
      document.querySelector("#scannerQualityWarning").textContent = t("scannerBatchFailed", { count: failedPhotos });
    }
    clearScannerPhotoQueue();
  } catch (error) {
    if (error.code === "SCAN_TIMEOUT") await disposeBrowserScannerWorker();
    if (!scannerBatchCancelled) console.error("Photo batch scan failed", error);
    scannerProgress.textContent = t(scannerBatchCancelled ? "scannerBatchCancelled" : error.code === "SCAN_TIMEOUT" || error.code === "OCR_BUSY" ? "scannerTimedOut" : "scannerUnavailable");
    document.querySelector("#scannerCurrentProgress").hidden = true;
  } finally {
    scannerOcrProgress = null;
    if (scannerBatchCancelled) await disposeBrowserScannerWorker();
    else releaseBrowserScannerWorker(worker);
    scannerActiveBatchWorker = null;
    scannerBatchRunning = false;
    scannerDialog.removeAttribute("aria-busy");
    setScannerBatchBusy(false);
  }
}

function addBinderSelection() {
  if (!scannerBinderSession || scannerBinderSession.applied || scannerReviewBusy) return;
  const quantities = new Map();
  scannerBinderSession.slots.filter((slot) =>
    slot.include && slot.selectedId
  ).forEach((slot) =>
    quantities.set(
      slot.selectedId,
      (quantities.get(slot.selectedId) || 0) + 1,
    )
  );
  for (const [id, quantity] of quantities) {
    const existing = state.cardStates[id] === "owned"
      ? Math.max(1, Number(state.cardCounts[id]) || 1)
      : 0;
    state.cardStates[id] = "owned";
    state.cardCounts[id] = existing + quantity;
    hydrateOwnedCard(id);
  }
  if (!quantities.size) return;
  scannerBinderSession.applied = true;
  scannerBinderSession.sourcePhotos = null;
  scannerResults.querySelectorAll("button, select, input").forEach((control) => { control.disabled = true; });
  saveUser();
  renderCards();
  scannerProgress.textContent = t("binderAdded", {
    count: [...quantities.values()].reduce((sum, value) => sum + value, 0),
  });
  if (collectionDialog.open) {
    renderCollectionSummary();
    renderCompletionTracker();
    populateCollectionFilters();
    renderCollectionCards();
  }
}

scannerOpen.addEventListener("click", openScanner);
document.querySelector("#scannerClose").addEventListener(
  "click",
  () => scannerDialog.close(),
);
document.querySelector("#scannerCamera").addEventListener(
  "click",
  openScannerCamera,
);
document.querySelector("#scannerCameraDone").addEventListener("click", finishScannerCamera);
scannerCameraCapture.addEventListener("click", captureScannerPhoto);
scannerCameraDialog.addEventListener("close", stopScannerCamera);
scannerCameraDialog.addEventListener("cancel", stopScannerCamera);
window.addEventListener?.("pagehide", finishScannerCamera);
document.addEventListener?.("visibilitychange", () => {
  if (document.hidden) finishScannerCamera();
});
document.querySelector("#scannerGallery").addEventListener(
  "click",
  () => resetScannerInput(scannerGalleryInput),
);
[scannerCameraInput, scannerGalleryInput].forEach((input) =>
  input.addEventListener("change", () => queueScannerPhotos(input.files))
);
document.querySelector("#scannerBatchStart").addEventListener("click", scanQueuedCardPhotos);
document.querySelector("#scannerBatchClear").addEventListener("click", () => {
  if (!scannerBatchBusy) clearScannerPhotoQueue();
});
document.querySelector("#scannerPhotoQueue").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-photo]");
  if (!button || scannerBatchBusy) return;
  const photo = scannerPhotoQueue.find((item) => item.id === Number(button.dataset.removePhoto));
  if (!photo) return;
  URL.revokeObjectURL(photo.previewUrl);
  scannerPhotoQueue = scannerPhotoQueue.filter((item) => item !== photo);
  renderScannerPhotoQueue();
});
scannerResults.addEventListener("change", (event) => {
  if (!scannerBinderSession) return;
  const choice = event.target.closest("[data-binder-choice]");
  const include = event.target.closest("[data-binder-include]");
  const position = Number(
    choice?.dataset.binderChoice || include?.dataset.binderInclude,
  );
  const slot = scannerBinderSession.slots.find((value) =>
    value.position === position
  );
  if (!slot) return;
  if (choice) slot.selectedId = choice.value || null;
  if (include) slot.include = include.checked;
  scannerBinderSession.json = scannerBinderJson(scannerBinderSession);
  const add = document.querySelector("#scannerBinderAdd");
  if (add) {
    add.disabled = !scannerBinderSession.slots.some((value) =>
      value.include && value.selectedId
    );
  }
});
scannerResults.addEventListener("click", (event) => {
  const recheck = event.target.closest("[data-scanner-recheck]");
  if (recheck) { recheckScannerPhoto(recheck); return; }
  const candidate = event.target.closest("[data-binder-candidate]");
  if (candidate) {
    chooseScannerCandidate(Number(candidate.dataset.binderCandidate), candidate.dataset.cardId);
    return;
  }
  const manualSearch = event.target.closest("[data-scanner-search]");
  if (manualSearch) { event.preventDefault(); searchScannerManual(manualSearch); return; }
  if (event.target.closest("#scannerBinderAdd")) {
    addBinderSelection();
    return;
  }
  const button = event.target.closest("[data-scanner-card]");
  if (!button) return;
  const card = scannerMatches.find((value) =>
    value.id === button.dataset.scannerCard
  );
  if (!card) return;
  scannerDialog.close();
  openCard(card);
});
scannerResults.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-scanner-form]");
  if (!form) return;
  event.preventDefault();
  searchScannerManual(form.querySelector("[data-scanner-search]"));
});
scannerResults.addEventListener("input", (event) => {
  const input = event.target.closest("[data-scanner-name], [data-scanner-number]");
  if (input) updateScannerManualInput(input);
});
scannerResults.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const input = event.target.closest("[data-scanner-name], [data-scanner-number]");
  if (!input) return;
  event.preventDefault();
  if (!event.repeat) searchScannerManual(input.closest("[data-scanner-form]").querySelector("[data-scanner-search]"));
});
scannerDialog.addEventListener("click", (event) => {
  if (event.target === scannerDialog) scannerDialog.close();
});
scannerDialog.addEventListener("close", () => {
  finishScannerCamera();
  scannerLookupControllers.forEach((controller) => controller.abort());
  void disposeBrowserScannerWorker();
  if (!scannerBatchRunning && !scannerReviewBusy) return;
  scannerBatchCancelled = true;
});
window.addEventListener?.("pagehide", () => { void disposeBrowserScannerWorker(); });
