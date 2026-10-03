async function openPokemon(name, updateHistory = true) {
  const basic = state.pokemon.find((p) =>
    p.name === name || String(p.id) === String(name)
  );
  if (!basic) return;
  state.current = basic;
  document.body.classList.add("drawer-open");
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    backdrop.classList.add("visible");
    drawer.classList.add("open");
  });
  drawer.setAttribute("aria-hidden", "false");
  drawerContent.innerHTML = detailSkeleton(basic);
  if (updateHistory) {
    history.pushState({ pokemon: basic.name }, "", `?pokemon=${basic.name}`);
  }
  try {
    const [pokemon, species] = await Promise.all([
      getJson(`${POKE_API}/pokemon/${basic.id}`),
      getJson(`${POKE_API}/pokemon-species/${basic.id}`),
    ]);
    const evolution = species.evolution_chain?.url
      ? await getJson(species.evolution_chain.url)
      : null;
    if (state.current?.id !== basic.id) return;
    renderDetails(pokemon, species, evolution);
    loadCards(basic.name);
  } catch {
    drawerContent.innerHTML = state.settings.language === "da"
      ? `<div class="cards-message"><strong>${
        titleCase(basic.name)
      } kunne ikke indlæses.</strong><br>Opret forbindelse igen for at gemme den til offlinebrug.</div>`
      : `<div class="cards-message"><strong>Couldn't load ${
        titleCase(basic.name)
      }.</strong><br>Reconnect once to save it for offline use.</div>`;
  }
}
function detailSkeleton(p) {
  return `<section class="detail-hero" style="--detailTint:${
    tintFor(p.id)
  }"><div class="detail-art"><img src="${ART}/${p.id}.png" alt="${
    titleCase(p.name)
  }"></div><div class="detail-info"><span class="detail-number">${
    formatId(p.id)
  }</span><h2 id="drawerTitle">${titleCase(p.name)}</h2><p class="flavor">${
    t("loadingPokemon")
  }</p></div></section><section class="cards-section"><div class="cards-message"><div class="spinner"></div>${
    t("openingArchive")
  }</div></section>`;
}
function evolutionNames(chain) {
  const names = [];
  function walk(node) {
    if (!node) return;
    names.push(node.species.name);
    node.evolves_to.forEach(walk);
  }
  walk(chain?.chain);
  return names;
}
function statBars(pokemon) {
  const da = {
    hp: "HP",
    attack: "Angreb",
    defense: "Forsvar",
    "special-attack": "Specialangreb",
    "special-defense": "Specialforsvar",
    speed: "Hastighed",
  };
  return pokemon.stats.map((s) =>
    `<div class="stat-row"><span>${
      state.settings.language === "da"
        ? (da[s.stat.name] || titleCase(s.stat.name))
        : titleCase(s.stat.name)
    }</span><b>${s.base_stat}</b><span class="stat-track"><i style="width:${
      Math.min(100, s.base_stat / 255 * 100)
    }%"></i></span></div>`
  ).join("");
}
function renderDetails(pokemon, species, evolution) {
  const lang = "en";
  const description =
    species.flavor_text_entries.find((e) => e.language.name === lang)
      ?.flavor_text.replace(/[\n\f]/g, " ") ||
    (state.settings.language === "da"
      ? "Ingen beskrivelse tilgængelig."
      : "No description available.");
  const genus = species.genera.find((g) => g.language.name === lang)?.genus ||
    "Pokémon";
  const typeDa = {
    normal: "normal",
    fire: "ild",
    water: "vand",
    electric: "elektrisk",
    grass: "græs",
    ice: "is",
    fighting: "kamp",
    poison: "gift",
    ground: "jord",
    flying: "flyvende",
    psychic: "psykisk",
    bug: "insekt",
    rock: "sten",
    ghost: "spøgelse",
    dragon: "drage",
    dark: "mørke",
    steel: "stål",
    fairy: "fe",
  };
  const types = pokemon.types.map((type) =>
    `<span class="type-pill" style="--typeColor:${
      typeColors[type.type.name] || "#65756c"
    }">${
      state.settings.language === "da"
        ? (typeDa[type.type.name] || type.type.name)
        : type.type.name
    }</span>`
  ).join("");
  const abilities = pokemon.abilities.map((a) => titleCase(a.ability.name))
    .join(", ");
  const shiny = pokemon.sprites.other["official-artwork"].front_shiny;
  const art = state.settings.shiny && shiny
    ? shiny
    : (pokemon.sprites.other["official-artwork"].front_default ||
      `${ART}/${pokemon.id}.png`);
  const fav = state.favorites.has(pokemon.id);
  const evo = evolutionNames(evolution).map((n) =>
    `<button data-evolution="${n}">${titleCase(n)}</button>`
  ).join("");
  drawerContent.innerHTML = `<section class="detail-hero" style="--detailTint:${
    tintFor(pokemon.id)
  }"><div class="detail-art"><img id="pokemonArtwork" src="${art}" data-normal="${
    pokemon.sprites.other["official-artwork"].front_default
  }" data-shiny="${shiny || ""}" alt="${
    titleCase(pokemon.name)
  }"></div><div class="detail-info"><span class="detail-number">${
    formatId(pokemon.id)
  } · ${genus}</span><h2 id="drawerTitle">${
    titleCase(pokemon.name)
  }</h2><div class="types">${types}</div><div class="detail-tools"><button id="detailFavorite" class="${
    fav ? "active" : ""
  }">♥ ${t("favorite")}</button><button id="shinyToggle" class="${
    state.settings.shiny ? "active" : ""
  }" ${shiny ? "" : "disabled"}>✦ ${
    t("shiny")
  }</button></div><p class="flavor">${description}</p><div class="facts"><div class="fact"><span>${
    t("height")
  }</span><strong>${
    (pokemon.height / 10).toFixed(1)
  } m</strong></div><div class="fact"><span>${t("weight")}</span><strong>${
    (pokemon.weight / 10).toFixed(1)
  } kg</strong></div><div class="fact"><span>${
    t("abilities")
  }</span><strong>${abilities}</strong></div></div><div class="stat-bars"><span class="section-kicker">${
    t("stats")
  }</span>${
    statBars(pokemon)
  }</div><div class="evolution-chain"><span class="section-kicker">${
    t("evolution")
  }</span>${evo}</div></div></section><section class="cards-section"><div class="cards-header"><div><span class="section-kicker">${
    t("archive")
  }</span><h3>${
    t("cardsFeaturing", { name: titleCase(pokemon.name) })
  }</h3><p id="cardsCount">${
    t("searchingSets")
  }</p><div class="collection-progress"><i id="collectionProgress" style="width:0"></i></div></div><select class="cards-sort" id="cardsSort"><option value="archive">${
    t("archiveOrder")
  }</option><option value="reverse">${
    t("reverseOrder")
  }</option><option value="name">${
    t("nameOrder")
  }</option></select></div><div class="card-filterbar" id="cardFilterbar"></div><div class="tcg-grid" id="tcgGrid"><div class="cards-message"><div class="spinner"></div>${
    t("lookingArchive")
  }</div></div></section>`;
  document.querySelector("#cardsSort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderCards();
  });
  document.querySelector("#detailFavorite").addEventListener("click", () => {
    toggleFavorite(pokemon.id);
    renderDetails(pokemon, species, evolution);
    if (state.cards.length) renderCards();
  });
  document.querySelector("#shinyToggle").addEventListener("click", () => {
    state.settings.shiny = !state.settings.shiny;
    saveUser();
    renderDetails(pokemon, species, evolution);
    if (state.cards.length) renderCards();
  });
}

function deriveVariant(name) {
  const tests = [
    ["V-UNION", /V-UNION/i],
    ["VMAX", /\bVMAX\b/i],
    ["VSTAR", /\bVSTAR\b/i],
    ["LV.X", /LV\.X/i],
    ["BREAK", /\bBREAK\b/i],
    ["TAG TEAM", /\bTAG TEAM\b/i],
    ["Radiant", /^Radiant\b/i],
    ["Prism Star", /◇|Prism Star/i],
    ["GX", /\bGX\b/i],
    ["EX", /\bEX\b/],
    ["ex", /\bex\b/],
    ["V", /\bV\b/],
    ["δ Delta", /δ|Delta Species/i],
  ];
  return tests.find(([, re]) => re.test(name))?.[0] || "Standard";
}
function setCode(id) {
  return id.slice(0, id.lastIndexOf("-"));
}
function cardImageUrl(card, size = "low") {
  return cardImageOverrides[card.id] ||
    (card.image ? `${card.image}/${size}.webp` : "");
}
async function loadCards(name) {
  try {
    const printedName = tcgNameOverrides[name] || titleCase(name);
    const cards = await getJson(
      `${TCG_API}/cards?name=${encodeURIComponent(printedName)}`,
    );
    if (state.current?.name !== name) return;
    const escaped = printedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exact = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    state.cards = cards.filter((c) =>
      (c.image || cardImageOverrides[c.id]) && exact.test(c.name)
    ).map((c) => ({
      ...c,
      variant: deriveVariant(c.name),
      setCode: setCode(c.id),
    }));
    state.advancedLoaded = false;
    state.cardFilters = {
      variant: "all",
      status: "all",
      series: "all",
      set: "all",
      rarity: "all",
      illustrator: "all",
    };
    renderCardFilters();
    renderCards();
    loadSetMetadata(state.cards, name);
    loadAdvancedMetadata();
  } catch {
    const el = document.querySelector("#tcgGrid");
    if (el) {
      el.innerHTML = `<div class="cards-message"><strong>${
        t("unavailableCards")
      }</strong><br>${t("viewedOffline")}</div>`;
    }
  }
}
async function loadSetMetadata(cards, pokemonName) {
  const codes = [...new Set(cards.map((c) => c.setCode))];
  const queue = [...codes];
  const setMap = new Map();
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const code = queue.shift();
      try {
        setMap.set(
          code,
          await getJson(`${TCG_API}/sets/${encodeURIComponent(code)}`),
        );
      } catch {}
    }
  });
  await Promise.all(workers);
  if (state.cards !== cards || state.current?.name !== pokemonName) return;
  cards.forEach((card) => {
    const set = setMap.get(card.setCode);
    if (set) {
      card.set = set;
      card.series = set.serie?.name || "Other";
      card.seriesId = set.serie?.id;
    }
  });
  renderCardFilters();
  renderCards();
}
function renderCardFilters() {
  const bar = document.querySelector("#cardFilterbar");
  if (!bar) return;
  const visibleCards = state.cards.filter(cardIsVisible);
  const variants = [...new Set(visibleCards.map((c) => c.variant))].sort();
  const sets = [
    ...new Set(visibleCards.map((c) => c.set?.name).filter(Boolean)),
  ].sort();
  const series = [...new Set(visibleCards.map((c) => c.series).filter(Boolean))]
    .sort();
  const rarities = [
    ...new Set(visibleCards.map((c) => c.rarity).filter(Boolean)),
  ].sort();
  const illustrators = [
    ...new Set(visibleCards.map((c) => c.illustrator).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  bar.innerHTML = `<select data-filter="variant"><option value="all">${
    t("allVariants")
  }</option>${
    variants.map((v) =>
      `<option ${
        state.cardFilters.variant === v ? "selected" : ""
      }>${v}</option>`
    ).join("")
  }</select><select data-filter="status"><option value="all">${
    t("allStatuses")
  }</option><option value="owned">${
    t("owned")
  }</option><option value="wanted">${
    t("wanted")
  }</option><option value="missing">${
    t("missing")
  }</option></select><select data-filter="series" ${
    series.length ? "" : "disabled"
  }><option value="all">${
    series.length ? t("allSeries") : t("loadingSeries")
  }</option>${
    series.map((v) =>
      `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`
    ).join("")
  }</select><select data-filter="set" ${
    sets.length ? "" : "disabled"
  }><option value="all">${
    sets.length ? t("allSets") : t("loadingSetNames")
  }</option>${
    sets.map((v) =>
      `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`
    ).join("")
  }</select><select data-filter="rarity" ${
    rarities.length ? "" : "disabled"
  }><option value="all">${t("allRarities")}</option>${
    rarities.map((v) => `<option>${escapeHtml(v)}</option>`).join("")
  }</select><select data-filter="illustrator" ${
    illustrators.length ? "" : "disabled"
  }><option value="all">${
    illustrators.length ? t("allArtists") : t("loadArtistNames")
  }</option>${
    illustrators.map((v) =>
      `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`
    ).join("")
  }</select><button id="advancedFilters" ${
    state.advancedLoaded ? "disabled" : ""
  }>${state.advancedLoaded ? t("offline") : t("advanced")}</button>`;
  bar.querySelectorAll("select").forEach((s) => {
    s.value = state.cardFilters[s.dataset.filter] || "all";
    s.addEventListener("change", (e) => {
      state.cardFilters[e.target.dataset.filter] = e.target.value;
      renderCards();
    });
  });
  document.querySelector("#advancedFilters").addEventListener(
    "click",
    loadAdvancedMetadata,
  );
}
function filteredCards() {
  return state.cards.filter((c) => {
    const status = state.cardStates[c.id] || "missing";
    return cardIsVisible(c) &&
      (!state.artist || state.artistCardIds?.has(c.id)) &&
      (!state.catalogCardIds || state.catalogCardIds.has(c.id)) &&
      (!state.rarityCardIds || state.rarityCardIds.has(c.id)) &&
      (state.cardFilters.variant === "all" ||
        c.variant === state.cardFilters.variant) &&
      (state.cardFilters.status === "all" ||
        status === state.cardFilters.status) &&
      (state.cardFilters.series === "all" ||
        c.series === state.cardFilters.series) &&
      (state.cardFilters.set === "all" ||
        c.set?.name === state.cardFilters.set) &&
      (state.cardFilters.rarity === "all" ||
        c.rarity === state.cardFilters.rarity) &&
      (state.cardFilters.illustrator === "all" ||
        c.illustrator === state.cardFilters.illustrator);
  });
}
function cardQuantity(id, status) {
  if (status !== "owned") return "";
  const quantity = Math.max(1, Number(state.cardCounts[id]) || 1);
  return `<span class="card-quantity" aria-label="${
    t("ownedCopies")
  }"><button data-count="-1" ${quantity <= 1 ? "disabled" : ""} aria-label="${
    t("removeCopy")
  }">−</button><b>${quantity}</b><button data-count="1" aria-label="${
    t("addCopy")
  }">+</button></span>`;
}
function canonicalPrintVariant(value = "") {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key.includes("reverse")) return "reverse";
  if (key.includes("first") || key.includes("1st")) return "firstEdition";
  if (key.includes("holo")) return "holo";
  if (key.includes("promo")) return "wPromo";
  if (key.includes("unlimited") || key.includes("normal")) return "normal";
  return value;
}
function printVariantLabel(value) {
  const labels = state.settings.language === "da"
    ? {
      normal: "Normal",
      holo: "Holo",
      reverse: "Omvendt holo",
      firstEdition: "Første udgave",
      wPromo: "Promokort",
    }
    : {
      normal: "Normal",
      holo: "Holo",
      reverse: "Reverse holo",
      firstEdition: "First edition",
      wPromo: "Promo",
    };
  return labels[value] || titleCase(value);
}
function printVariantOptions(card) {
  const options = [];
  Object.entries(card.variants || {}).forEach(([key, enabled]) => {
    const value = canonicalPrintVariant(key);
    if (enabled && value && !options.includes(value)) options.push(value);
  });
  Object.entries(card.pricing?.tcgplayer || {}).forEach(([key, value]) => {
    if (value && typeof value === "object") {
      const variant = canonicalPrintVariant(key);
      if (variant && !options.includes(variant)) options.push(variant);
    }
  });
  return options.sort((a, b) =>
    ["normal", "holo", "reverse", "firstEdition", "wPromo"].indexOf(a) -
    ["normal", "holo", "reverse", "firstEdition", "wPromo"].indexOf(b)
  );
}
function selectedPrintVariant(card) {
  const options = printVariantOptions(card);
  const savedVariant = state.cardPrintVariants[card.id];
  return options.includes(savedVariant)
    ? savedVariant
    : (options[0] || "normal");
}
function cardPrintVariantControl(card, status) {
  if (status !== "owned") return "";
  const options = printVariantOptions(card);
  if (!options.length) {
    return `<span class="card-print-variant loading">${
      t("loadingPrint")
    }</span>`;
  }
  const selected = selectedPrintVariant(card);
  return `<label class="card-print-variant">${
    t("print")
  }<select data-print-variant>${
    options.map((option) =>
      `<option value="${option}" ${option === selected ? "selected" : ""}>${
        printVariantLabel(option)
      }</option>`
    ).join("")
  }</select></label>`;
}
async function hydrateOwnedCard(id) {
  const targets = [...state.cards, ...state.collectionCards].filter((card) =>
    card.id === id
  );
  try {
    const full = await getJson(`${TCG_API}/cards/${encodeURIComponent(id)}`);
    targets.forEach((card) =>
      Object.assign(card, full, {
        variant: full.suffix || card.variant || deriveVariant(full.name),
        series: card.series || full.set?.serie?.name || "Other series",
      })
    );
    if (state.cardStates[id] === "owned" && !state.cardPrintVariants[id]) {
      state.cardPrintVariants[id] = selectedPrintVariant(full);
    }
    saveUser();
    renderCards();
    if (collectionDialog.open) {
      renderCollectionSummary();
      populateCollectionFilters();
      renderCollectionCards();
    }
  } catch {}
}
function setPrintVariant(id, variant) {
  state.cardPrintVariants[id] = canonicalPrintVariant(variant);
  saveUser();
  renderCards();
  if (collectionDialog.open) {
    renderCollectionSummary();
    renderCollectionCards();
  }
}
function renderCards() {
  const cardGrid = document.querySelector("#tcgGrid");
  const count = document.querySelector("#cardsCount");
  if (!cardGrid || !count) return;
  let cards = filteredCards();
  if (state.sort === "name") cards.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === "reverse") cards.reverse();
  const scopedCards = state.cards.filter((c) =>
    cardIsVisible(c) && (!state.artist || state.artistCardIds?.has(c.id)) &&
    (!state.catalogCardIds || state.catalogCardIds.has(c.id)) &&
    (!state.rarityCardIds || state.rarityCardIds.has(c.id))
  );
  const owned =
    scopedCards.filter((c) => state.cardStates[c.id] === "owned").length;
  const scopeLabels = [];
  const da = state.settings.language === "da";
  if (state.artist) scopeLabels.push(`${da ? "af" : "by"} ${state.artist}`);
  const selectedSet = state.cardSets.find((set) => set.id === state.catalogSet);
  const selectedSeries = state.cardSeries.find((series) =>
    series.id === state.catalogSeries
  );
  if (selectedSet) scopeLabels.push(`${da ? "i" : "in"} ${selectedSet.name}`);
  else if (selectedSeries) {
    scopeLabels.push(`${da ? "i" : "in"} ${selectedSeries.name}`);
  }
  if (state.catalogRarity !== "all") {
    scopeLabels.push(
      da
        ? `med sjældenheden ${state.catalogRarity}`
        : `with ${state.catalogRarity} rarity`,
    );
  }
  const scopeLabel = scopeLabels.length ? ` ${scopeLabels.join(" ")}` : "";
  const cardLabel = cards.length === 1 ? t("cardFound") : t("cards");
  count.textContent =
    `${cards.length.toLocaleString()} ${cardLabel}${scopeLabel} · ${owned}/${scopedCards.length} ${
      t("owned").toLowerCase()
    }`;
  const progress = document.querySelector("#collectionProgress");
  if (progress) {
    progress.style.width = `${
      scopedCards.length ? owned / scopedCards.length * 100 : 0
    }%`;
  }
  if (!cards.length) {
    cardGrid.innerHTML = `<div class="cards-message">${
      t("noMatchingCards")
    }</div>`;
    return;
  }
  cardGrid.innerHTML = cards.map((c) => {
    const status = state.cardStates[c.id] || "";
    return `<article class="tcg-card" data-card-id="${c.id}"><button class="tcg-open"><span class="tcg-image-wrap"><span class="variant-badge">${c.variant}</span><img loading="lazy" src="${
      cardImageUrl(c, "low")
    }" alt="${escapeHtml(c.name)}"></span><strong>${
      escapeHtml(c.name)
    }</strong><span>${escapeHtml(c.set?.name || t("setLoading"))} · ${
      escapeHtml(c.rarity || `${t("card")} ${c.localId}`)
    }</span></button><span class="card-status"><button data-status="owned" class="${
      status === "owned" ? "active" : ""
    }">✓ ${t("owned")}</button><button data-status="wanted" class="${
      status === "wanted" ? "active" : ""
    }">♥ ${t("wanted")}</button></span>${cardPrintVariantControl(c, status)}${
      cardQuantity(c.id, status)
    }</article>`;
  }).join("");
}
async function loadAdvancedMetadata() {
  const button = document.querySelector("#advancedFilters");
  if (!button || button.disabled) return;
  const cards = state.cards;
  button.disabled = true;
  button.textContent = state.settings.language === "da"
    ? "Indlæser sjældenhed og illustratorer…"
    : "Loading rarity & artists…";
  let done = 0;
  const queue = [
    ...cards.filter((c) =>
      !c.rarity || !c.illustrator || !c.variants || !c.pricing
    ),
  ];
  const total = queue.length;
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const card = queue.shift();
      try {
        const details = await getJson(`${TCG_API}/cards/${card.id}`);
        card.rarity = details.rarity;
        card.illustrator = details.illustrator;
        card.suffix = details.suffix;
        card.variants = details.variants;
        card.pricing = details.pricing;
        card.variant = details.suffix || deriveVariant(card.name);
      } catch {}
      done++;
      button.textContent = state.settings.language === "da"
        ? `Indlæser oplysninger ${done}/${total}`
        : `Loading details ${done}/${total}`;
    }
  });
  await Promise.all(workers);
  if (state.cards !== cards) return;
  state.advancedLoaded = true;
  if (state.artist && cards.some((card) => card.illustrator === state.artist)) {
    state.cardFilters.illustrator = state.artist;
  }
  renderCardFilters();
  renderCards();
}

async function openCard(card) {
  cardDialog.dataset.cardId = card.id;
  cardDialog.cardData = card;
  if (!cardDialog.open) cardDialog.showModal();
  const box = document.querySelector("#cardDetailContent");
  box.innerHTML = `<div class="card-detail-art"><img src="${
    cardImageUrl(card, "high")
  }" alt="${
    escapeHtml(card.name)
  }"></div><div class="card-detail-copy"><div class="spinner"></div>${
    t("loadingDetails")
  }</div>`;
  let full = card;
  try {
    full = { ...card, ...await getJson(`${TCG_API}/cards/${card.id}`) };
    Object.assign(card, full);
    renderCardFilters();
  } catch {}
  if (cardDialog.dataset.cardId !== card.id) return;
  const variants =
    Object.entries(full.variants || {}).filter(([, v]) => v).map(([k]) =>
      `<span>${printVariantLabel(canonicalPrintVariant(k))}</span>`
    ).join("") || `<span>${t("standard")}</span>`;
  const prices = priceSummary(full.pricing).map((p) =>
    `<span class="price-chip">${escapeHtml(p.label)}: ${
      escapeHtml(p.value)
    }</span>`
  ).join("");
  const setName = full.set?.name || t("unknownSet");
  const seriesName = full.series || t("otherSeries");
  const marketQuery = encodeURIComponent(
    `${full.name} ${setName} ${full.localId}`,
  );
  const cardmarketId = full.pricing?.cardmarket?.idProduct;
  const cardmarketUrl = cardmarketId
    ? `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${
      encodeURIComponent(cardmarketId)
    }`
    : `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${
      encodeURIComponent(full.name)
    }`;
  const status = state.cardStates[full.id] || "";
  box.innerHTML = `<div class="card-detail-art"><img src="${
    cardImageUrl(full, "high")
  }" alt="${
    escapeHtml(full.name)
  }"></div><div class="card-detail-copy"><span class="variant-title">${
    escapeHtml(full.suffix || deriveVariant(full.name))
  } ${t("variant")}</span><h2>${escapeHtml(full.name)}</h2><p>${
    escapeHtml(seriesName)
  } · ${escapeHtml(setName)} · #${
    escapeHtml(full.localId)
  }</p><div class="detail-meta"><div><span>${t("series")}</span><strong>${
    escapeHtml(seriesName)
  }</strong></div><div><span>${t("set")}</span><strong>${
    escapeHtml(setName)
  }</strong></div><div><span>${t("rarity")}</span><strong>${
    escapeHtml(full.rarity || t("unknown"))
  }</strong></div><div><span>${t("illustrator")}</span><strong>${
    escapeHtml(full.illustrator || t("unknown"))
  }</strong></div><div><span>${t("stage")}</span><strong>${
    escapeHtml(full.stage || "Pokémon")
  }</strong></div><div><span>${t("hpType")}</span><strong>${
    escapeHtml(full.hp || "—")
  } · ${
    escapeHtml((full.types || []).join(", ") || "—")
  }</strong></div></div><div class="card-detail-collection"><span class="section-kicker">${
    t("collectionStatus")
  }</span><span class="card-status"><button data-detail-status="owned" class="${
    status === "owned" ? "active" : ""
  }">✓ ${t("owned")}</button><button data-detail-status="wanted" class="${
    status === "wanted" ? "active" : ""
  }">♥ ${t("wanted")}</button></span>${cardPrintVariantControl(full, status)}${
    cardQuantity(full.id, status)
  }</div><span class="section-kicker">${
    t("printVariants")
  }</span><div class="print-variants">${variants}</div>${
    prices ? `<div class="price-list">${prices}</div>` : ""
  }<div class="market-links"><a href="${cardmarketUrl}" target="_blank">Cardmarket ↗</a><a href="https://www.tcgplayer.com/search/pokemon/product?q=${marketQuery}" target="_blank">TCGplayer ↗</a></div></div>`;
}
function priceSummary(pricing) {
  const out = [];
  const cm = pricing?.cardmarket;
  if (cm) {
    if (Number.isFinite(cm.trend)) {
      out.push({
        label: "Cardmarket trend",
        value: `${cm.unit || "EUR"} ${cm.trend.toFixed(2)}`,
      });
    }
    if (Number.isFinite(cm["trend-holo"])) {
      out.push({
        label: "Cardmarket holo",
        value: `${cm.unit || "EUR"} ${cm["trend-holo"].toFixed(2)}`,
      });
    }
  }
  const tcg = pricing?.tcgplayer;
  if (tcg) {
    for (const [variant, values] of Object.entries(tcg)) {
      if (
        values && typeof values === "object" &&
        Number.isFinite(values.marketPrice)
      ) {
        out.push({
          label: `TCGplayer ${variant}`,
          value: `${tcg.unit || "USD"} ${values.marketPrice.toFixed(2)}`,
        });
      }
    }
  }
  return out.slice(0, 6);
}

function setCardStatus(id, status) {
  state.cardStates[id] = state.cardStates[id] === status ? "" : status;
  if (!state.cardStates[id]) {
    delete state.cardStates[id];
    delete state.cardCounts[id];
    delete state.cardPrintVariants[id];
  } else if (status === "owned") {
    state.cardCounts[id] = Math.max(1, Number(state.cardCounts[id]) || 1);
  } else {
    delete state.cardCounts[id];
    delete state.cardPrintVariants[id];
  }
  saveUser();
  renderCards();
  if (state.cardStates[id] === "owned") hydrateOwnedCard(id);
  if (collectionDialog.open) {
    if (!state.cardStates[id]) {
      state.collectionCards = state.collectionCards.filter((card) =>
        card.id !== id
      );
    }
    renderCollectionSummary();
    populateCollectionFilters();
    renderCollectionCards();
  }
}
function adjustCardCount(id, change) {
  if (state.cardStates[id] !== "owned") return;
  state.cardCounts[id] = Math.max(
    1,
    (Number(state.cardCounts[id]) || 1) + Number(change),
  );
  saveUser();
  renderCards();
  if (collectionDialog.open) {
    renderCollectionSummary();
    renderCollectionCards();
  }
}
function toggleFavorite(id) {
  id = Number(id);
  state.favorites.has(id)
    ? state.favorites.delete(id)
    : state.favorites.add(id);
  saveUser();
  renderPokemon();
}
function cardmarketValue(card) {
  const pricing = card.pricing?.cardmarket || {};
  const variant = selectedPrintVariant(card);
  if (variant === "holo") {
    const holo = [
      pricing["trend-holo"],
      pricing["avg30-holo"],
      pricing["avg7-holo"],
      pricing["avg1-holo"],
      pricing["low-holo"],
    ].find((value) => Number.isFinite(value) && value > 0);
    return holo ??
      [pricing.trend, pricing.avg30, pricing.avg7, pricing.avg1, pricing.low]
        .find(Number.isFinite);
  }
  if (variant === "reverse") {
    return [
      pricing["trend-reverse"],
      pricing["avg30-reverse"],
      pricing["avg7-reverse"],
      pricing["avg1-reverse"],
    ].find(Number.isFinite);
  }
  if (variant === "firstEdition") {
    return [pricing["trend-first-edition"], pricing["avg30-first-edition"]]
      .find(Number.isFinite);
  }
  return [pricing.trend, pricing.avg30, pricing.avg7, pricing.avg1, pricing.low]
    .find(Number.isFinite);
}
function tcgplayerValue(card) {
  const selected = selectedPrintVariant(card);
  const entry = Object.entries(card.pricing?.tcgplayer || {}).find((
    [key, value],
  ) =>
    value && typeof value === "object" &&
    canonicalPrintVariant(key) === selected
  )?.[1];
  return Number.isFinite(entry?.marketPrice) ? entry.marketPrice : undefined;
}
function money(value, currency) {
  return new Intl.NumberFormat(
    state.settings.language === "da" ? "da-DK" : "en-US",
    { style: "currency", currency, minimumFractionDigits: 2 },
  ).format(value);
}
