async function loadPokemon() {
  renderGridSkeletons();
  applySettings();
  try {
    const data = await getJson(`${POKE_API}/pokemon-species?limit=2000`);
    state.pokemon = data.results.map((p) => ({ ...p, id: pokemonId(p.url) }))
      .filter((p) => Number.isFinite(p.id)).sort((a, b) => a.id - b.id);
    state.pokemonAliases = state.pokemon.map((pokemon) => ({
      id: pokemon.id,
      slug: pokemon.name,
      name: normalizeCardName(
        tcgNameOverrides[pokemon.name] || titleCase(pokemon.name),
      ),
    }));
    applyFilters();
    if (searchInput.value.trim()) renderSearchSuggestions();
    loadIllustrators();
    loadMainCardFilters();
    loadMainRarities();
    const slug = new URLSearchParams(location.search).get("pokemon");
    if (slug) openPokemon(slug, false);
  } catch {
    grid.innerHTML = `<div class="cards-message"><strong>${
      t("unavailablePokedex")
    }</strong><br>${t("connectOffline")}</div>`;
    resultCount.textContent = "0";
  }
}
function renderGridSkeletons() {
  grid.innerHTML = Array.from(
    { length: 12 },
    () => '<div class="pokemon-card skeleton" aria-hidden="true"></div>',
  ).join("");
}
function applyFilters() {
  const query = state.query.trim().toLowerCase().replace(/^#/, "");
  state.filtered = state.pokemon.filter((p) => {
    const range = generationRanges[state.generation];
    const byArtist = !state.artistPokemonIds ||
      state.artistPokemonIds.has(p.id);
    const byRelease = !state.catalogPokemonIds ||
      state.catalogPokemonIds.has(p.id);
    const byRarity = !state.rarityPokemonIds ||
      state.rarityPokemonIds.has(p.id);
    return byArtist && byRelease && byRarity &&
      (!range || (p.id >= range[0] && p.id <= range[1])) &&
      (!query || p.name.includes(query) || String(p.id) === query ||
        String(p.id).padStart(4, "0").startsWith(query));
  });
  state.filtered.sort(
    state.mainOrder === "cardNumber" && state.catalogCardOrder.size
      ? (a, b) =>
        (state.catalogCardOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (state.catalogCardOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.id - b.id
      : (a, b) => a.id - b.id,
  );
  state.visible = PAGE_SIZE;
  renderPokemon();
}
let searchSuggestionIndex = -1;
function matchingPokemonSuggestions(value) {
  const raw = value.trim().replace(/^#/, "");
  if (!raw) return [];
  const query = normalizeCardName(raw);
  const numeric = /^\d+$/.test(query);
  return state.pokemonAliases.filter((pokemon) =>
    numeric
      ? String(pokemon.id) === query ||
        String(pokemon.id).padStart(4, "0").startsWith(query)
      : pokemon.name.includes(query)
  ).sort((a, b) => {
    if (numeric) {
      return (Number(String(a.id) !== query) -
        Number(String(b.id) !== query)) || a.id - b.id;
    }
    const rank = (item) =>
      item.name === query
        ? 0
        : item.name.startsWith(query)
        ? 1
        : item.name.split(" ").some((word) => word.startsWith(query))
        ? 2
        : 3;
    return rank(a) - rank(b) || a.id - b.id;
  }).slice(0, 8);
}
function hideSearchSuggestions() {
  searchSuggestions.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
  searchSuggestionIndex = -1;
}
function highlightSearchSuggestion(index) {
  const options = [...searchSuggestions.querySelectorAll("[data-pokemon]")];
  if (!options.length) return;
  searchSuggestionIndex = (index + options.length) % options.length;
  options.forEach((option, i) =>
    option.classList.toggle("active", i === searchSuggestionIndex)
  );
  options[searchSuggestionIndex].scrollIntoView({ block: "nearest" });
}
function renderSearchSuggestions() {
  const matches = matchingPokemonSuggestions(searchInput.value);
  if (!matches.length) {
    hideSearchSuggestions();
    return;
  }
  searchSuggestions.innerHTML = matches.map((pokemon) =>
    `<button type="button" role="option" data-pokemon="${
      escapeHtml(pokemon.slug)
    }"><img src="${ART}/${pokemon.id}.png" alt=""><strong>${
      escapeHtml(titleCase(pokemon.slug))
    }</strong><small>${formatId(pokemon.id)}</small></button>`
  ).join("");
  searchSuggestions.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  searchSuggestionIndex = -1;
}
function choosePokemonSuggestion(name) {
  const pokemon = state.pokemon.find((item) => item.name === name);
  if (!pokemon) return;
  searchInput.value = titleCase(pokemon.name);
  state.query = pokemon.name;
  applyFilters();
  hideSearchSuggestions();
  searchInput.blur();
  openPokemon(pokemon.name);
}
function renderPokemon() {
  grid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  state.filtered.slice(0, state.visible).forEach((pokemon) => {
    const node = template.content.cloneNode(true);
    const button = node.querySelector(".pokemon-card");
    const image = node.querySelector("img");
    const star = node.querySelector(".favorite-star");
    const cardLink = node.querySelector(".card-copy > span");
    button.dataset.name = pokemon.name;
    button.style.setProperty("--tint", tintFor(pokemon.id));
    button.setAttribute(
      "aria-label",
      state.settings.language === "da"
        ? `Åbn ${titleCase(pokemon.name)}, og se dens kort`
        : `Open ${titleCase(pokemon.name)} and view its cards`,
    );
    node.querySelector(".card-number").textContent = formatId(pokemon.id);
    node.querySelector("strong").textContent = titleCase(pokemon.name);
    const scopes =
      [state.artist, state.catalogPokemonIds, state.rarityPokemonIds].filter(
        Boolean,
      ).length;
    if (scopes === 1) {
      const counts = state.artist
        ? state.artistCardCounts
        : state.catalogPokemonIds
        ? state.catalogCardCounts
        : state.rarityCardCounts;
      const count = counts.get(pokemon.id) || 0;
      cardLink.innerHTML = `${count} ${
        state.settings.language === "da"
          ? "kort"
          : `card${count === 1 ? "" : "s"}`
      } <i>↗</i>`;
    } else if (scopes > 1) {
      cardLink.innerHTML = `${t("matchingCards")} <i>↗</i>`;
    } else cardLink.innerHTML = `${t("viewCards")} <i>↗</i>`;
    star.classList.toggle("active", state.favorites.has(pokemon.id));
    star.textContent = state.favorites.has(pokemon.id) ? "★" : "☆";
    star.dataset.id = pokemon.id;
    image.src = `${ART}/${pokemon.id}.png`;
    image.alt = titleCase(pokemon.name);
    fragment.append(node);
  });
  grid.append(fragment);
  resultCount.textContent = state.filtered.length.toLocaleString();
  emptyState.hidden = state.filtered.length !== 0;
  loadMore.hidden = state.visible >= state.filtered.length;
}

function isPocketSet(set) {
  return set?.seriesId === POCKET_SERIES_ID ||
    set?.serie?.id === POCKET_SERIES_ID ||
    set?.seriesName === "Pokémon TCG Pocket" ||
    set?.serie?.name === "Pokémon TCG Pocket";
}
function isPocketCard(card) {
  const code = card.setCode || setCode(card.id);
  return card.series === "Pokémon TCG Pocket" || isPocketSet(card.set) ||
    state.cardSets.some((set) => set.id === code && isPocketSet(set));
}
function cardIsVisible(card) {
  return !state.settings.hidePocket || !isPocketCard(card);
}
function renderMainSeriesOptions() {
  const series = state.cardSeries.filter((item) =>
    !state.settings.hidePocket || item.id !== POCKET_SERIES_ID
  );
  if (!series.some((item) => item.id === state.catalogSeries)) {
    state.catalogSeries = "all";
  }
  mainSeriesFilter.innerHTML =
    `<option value="all">${t("allSeries")}</option>` +
    series.map((item) =>
      `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
    ).join("");
  mainSeriesFilter.value = state.catalogSeries;
}
async function loadMainCardFilters() {
  try {
    const series = await getJson(`${TCG_API}/series`);
    state.cardSeries = series.filter((item) => item?.id && item?.name);
    renderMainSeriesOptions();
    mainSetFilter.innerHTML = `<option value="all">${
      t("loadingSets")
    }</option>`;
    mainSetFilter.disabled = true;
    const queue = [...state.cardSeries];
    const details = [];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          details.push(
            await getJson(`${TCG_API}/series/${encodeURIComponent(item.id)}`),
          );
        } catch {}
      }
    });
    await Promise.all(workers);
    const seriesOrder = new Map(
      state.cardSeries.map((item, index) => [item.id, index]),
    );
    state.cardSets = details.flatMap((detail) =>
      (detail.sets || []).map((set, index) => ({
        ...set,
        seriesId: detail.id,
        seriesName: detail.name,
        seriesOrder: seriesOrder.get(detail.id) ?? 999,
        setOrder: index,
      }))
    ).sort((a, b) => a.name.localeCompare(b.name));
    mainSetFilter.disabled = false;
    renderMainSeriesOptions();
    renderMainSetOptions();
    if (state.current) {
      renderCardFilters();
      renderCards();
    }
  } catch {
    mainSeriesFilter.disabled = true;
    mainSetFilter.disabled = true;
  }
}
async function loadMainRarities() {
  try {
    const rarities = await getJson(`${TCG_API}/rarities`);
    state.cardRarities = [
      ...new Set(
        rarities.filter((value) => typeof value === "string" && value.trim()),
      ),
    ].sort((a, b) => a.localeCompare(b));
    mainRarityFilter.innerHTML =
      `<option value="all">${t("allRarities")}</option>` +
      state.cardRarities.map((rarity) =>
        `<option value="${escapeHtml(rarity)}">${escapeHtml(rarity)}</option>`
      ).join("");
  } catch {
    mainRarityFilter.disabled = true;
  }
}
function renderMainSetOptions() {
  const sets =
    (state.catalogSeries === "all"
      ? state.cardSets
      : state.cardSets.filter((set) => set.seriesId === state.catalogSeries))
      .filter((set) => !state.settings.hidePocket || !isPocketSet(set));
  mainSetFilter.innerHTML = `<option value="all">${t("allSets")}</option>` +
    sets.map((set) =>
      `<option value="${escapeHtml(set.id)}">${escapeHtml(set.name)}</option>`
    ).join("");
  mainSetFilter.value = sets.some((set) => set.id === state.catalogSet)
    ? state.catalogSet
    : "all";
  if (mainSetFilter.value === "all") state.catalogSet = "all";
}
function updateMainOrderControl() {
  const option = mainOrderFilter.querySelector('[value="cardNumber"]');
  const hasRelease = state.catalogSeries !== "all" ||
    state.catalogSet !== "all";
  option.disabled = !hasRelease;
  option.textContent = hasRelease ? t("orderCard") : t("chooseSet");
  if (!hasRelease && state.mainOrder === "cardNumber") {
    state.mainOrder = "pokedex";
    mainOrderFilter.value = "pokedex";
  }
}
async function applyMainRarityFilter() {
  const request = ++state.rarityRequest;
  if (state.catalogRarity === "all") {
    state.rarityPokemonIds = null;
    state.rarityCardIds = null;
    state.rarityCardCounts = new Map();
    rarityFilterStatus.hidden = true;
    applyFilters();
    return;
  }
  state.rarityPokemonIds = new Set();
  state.rarityCardIds = new Set();
  state.rarityCardCounts = new Map();
  rarityFilterStatus.hidden = false;
  rarityFilterStatus.textContent = state.settings.language === "da"
    ? `Indlæser kort med sjældenheden ${state.catalogRarity}…`
    : `Loading ${state.catalogRarity} cards…`;
  applyFilters();
  try {
    const detail = await getJson(
      `${TCG_API}/rarities/${encodeURIComponent(state.catalogRarity)}`,
    );
    if (request !== state.rarityRequest) return;
    const cards = (detail.cards || []).filter(cardIsVisible);
    const counts = mapArtistCards(cards);
    state.rarityCardIds = new Set(cards.map((card) => card.id));
    state.rarityCardCounts = counts;
    state.rarityPokemonIds = new Set(counts.keys());
    rarityFilterStatus.textContent = state.settings.language === "da"
      ? `${counts.size} Pokémon · ${cards.length} kort med sjældenheden ${state.catalogRarity}`
      : `${counts.size} Pokémon · ${cards.length} ${state.catalogRarity} cards`;
    applyFilters();
  } catch {
    if (request === state.rarityRequest) {
      rarityFilterStatus.textContent = state.settings.language === "da"
        ? `Kort med sjældenheden ${state.catalogRarity} kunne ikke indlæses.`
        : `Could not load ${state.catalogRarity} cards.`;
    }
  }
}
async function applyMainCardFilter() {
  const request = ++state.catalogRequest;
  updateMainOrderControl();
  if (state.catalogSeries === "all" && state.catalogSet === "all") {
    state.catalogPokemonIds = null;
    state.catalogCardIds = null;
    state.catalogCardCounts = new Map();
    state.catalogCardOrder = new Map();
    catalogFilterStatus.hidden = true;
    applyFilters();
    return;
  }
  state.catalogPokemonIds = new Set();
  state.catalogCardIds = new Set();
  state.catalogCardCounts = new Map();
  state.catalogCardOrder = new Map();
  state.generation = "all";
  document.querySelectorAll("#generationFilters button").forEach((button) =>
    button.classList.toggle("active", button.dataset.gen === "all")
  );
  const selectedSet = state.cardSets.find((set) => set.id === state.catalogSet);
  const selectedSeries = state.cardSeries.find((series) =>
    series.id === state.catalogSeries
  );
  const label = selectedSet?.name || selectedSeries?.name ||
    (state.settings.language === "da" ? "valget" : "selection");
  catalogFilterStatus.hidden = false;
  catalogFilterStatus.textContent = state.settings.language === "da"
    ? `Indlæser Pokémon fra ${label}…`
    : `Loading Pokémon from ${label}…`;
  applyFilters();
  try {
    const sets = (selectedSet
      ? [selectedSet]
      : state.cardSets.filter((set) =>
        set.seriesId === state.catalogSeries
      )).sort((a, b) =>
        a.seriesOrder - b.seriesOrder || a.setOrder - b.setOrder
      );
    const queue = [...sets];
    const cards = [];
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const set = queue.shift();
        try {
          const detail = await getJson(
            `${TCG_API}/sets/${encodeURIComponent(set.id)}`,
          );
          cards.push(...(detail.cards || []));
        } catch {}
      }
    });
    await Promise.all(workers);
    if (request !== state.catalogRequest) return;
    const counts = mapArtistCards(cards);
    const setRank = new Map(sets.map((set, index) => [set.id, index]));
    const orderedCards = [...cards].sort((a, b) =>
      (setRank.get(setCode(a.id)) ?? 999) -
        (setRank.get(setCode(b.id)) ?? 999) ||
      String(a.localId).localeCompare(String(b.localId), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
    const order = new Map();
    orderedCards.forEach((card, index) =>
      pokemonIdsForCard(card).forEach((id) => {
        if (!order.has(id)) order.set(id, index);
      })
    );
    state.catalogCardIds = new Set(cards.map((card) => card.id));
    state.catalogCardCounts = counts;
    state.catalogCardOrder = order;
    state.catalogPokemonIds = new Set(counts.keys());
    catalogFilterStatus.textContent = state.settings.language === "da"
      ? `${counts.size} Pokémon · ${cards.length} kort i ${label}`
      : `${counts.size} Pokémon · ${cards.length} cards in ${label}`;
    applyFilters();
  } catch {
    if (request === state.catalogRequest) {
      catalogFilterStatus.textContent = state.settings.language === "da"
        ? `Kort fra ${label} kunne ikke indlæses.`
        : `Could not load cards from ${label}.`;
    }
  }
}

async function loadIllustrators() {
  try {
    const list = await getJson(`${TCG_API}/illustrators`);
    state.illustrators = [
      ...new Set(list.map(cleanIllustratorName).filter(Boolean)),
    ].sort(compareArtists);
    mainArtistInput.placeholder = t("searchIllustrator");
  } catch {
    mainArtistInput.placeholder = t("illustratorsOffline");
  }
}
function pokemonIdsForCard(card) {
  const haystack = ` ${normalizeCardName(card.name)} `;
  return state.pokemonAliases.filter((pokemon) =>
    haystack.includes(` ${pokemon.name} `)
  ).map((pokemon) => pokemon.id);
}
function mapArtistCards(cards) {
  const counts = new Map();
  cards.forEach((card) =>
    pokemonIdsForCard(card).forEach((id) =>
      counts.set(id, (counts.get(id) || 0) + 1)
    )
  );
  return counts;
}
function showArtistSuggestions(value = mainArtistInput.value) {
  const query = value.trim().toLowerCase();
  if (!state.illustrators.length) {
    artistSuggestions.innerHTML = `<span class="artist-suggestion-note">${
      t("loadingArtists")
    }</span>`;
  } else {
    const matches = state.illustrators.filter((name) =>
      !query || name.toLowerCase().includes(query)
    ).sort((a, b) => {
      const aStarts = artistSortKey(a).startsWith(query);
      const bStarts = artistSortKey(b).startsWith(query);
      return Number(bStarts) - Number(aStarts) || compareArtists(a, b);
    }).slice(0, 80);
    artistSuggestions.innerHTML = matches.length
      ? matches.map((name) =>
        `<button type="button" role="option" data-artist="${
          escapeHtml(name)
        }">${escapeHtml(name)}</button>`
      ).join("")
      : `<span class="artist-suggestion-note">${t("noArtists")}</span>`;
  }
  artistSuggestions.hidden = false;
  mainArtistInput.setAttribute("aria-expanded", "true");
}
function hideArtistSuggestions() {
  artistSuggestions.hidden = true;
  mainArtistInput.setAttribute("aria-expanded", "false");
}
async function selectMainArtist(value) {
  const artist = state.illustrators.find((name) =>
    name.toLowerCase() === value.trim().toLowerCase()
  );
  if (!artist) {
    if (value.trim()) artistStatus.textContent = t("chooseSuggestion");
    return;
  }
  hideArtistSuggestions();
  mainArtistInput.value = artist;
  clearArtist.hidden = false;
  if (
    state.artist === artist &&
    (state.artistLoading || state.artistPokemonIds?.size)
  ) {
    const count = state.artistCardCounts.size;
    artistStatus.textContent = state.settings.language === "da"
      ? `${count} Pokémon illustreret af ${artist}`
      : `${count} Pokémon illustrated by ${artist}`;
    return;
  }
  const request = ++state.artistRequest;
  state.artist = artist;
  state.artistLoading = true;
  state.artistPokemonIds = new Set();
  state.artistCardIds = new Set();
  state.artistCardCounts = new Map();
  artistStatus.textContent = state.settings.language === "da"
    ? `Indlæser kort illustreret af ${artist}…`
    : `Loading cards illustrated by ${artist}…`;
  state.generation = "all";
  document.querySelectorAll("#generationFilters button").forEach((button) =>
    button.classList.toggle("active", button.dataset.gen === "all")
  );
  applyFilters();
  try {
    const cards = (await getJson(
      `${TCG_API}/cards?illustrator=${encodeURIComponent(`eq:${artist}`)}`,
    )).filter(cardIsVisible);
    if (request !== state.artistRequest) return;
    const counts = mapArtistCards(cards);
    state.artistCardIds = new Set(cards.map((card) => card.id));
    state.artistCardCounts = counts;
    state.artistPokemonIds = new Set(counts.keys());
    const generations = new Set(
      [...counts.keys()].map(generationFor).filter(Boolean),
    );
    artistStatus.textContent = state.settings.language === "da"
      ? `${counts.size} Pokémon · ${cards.length} kort · ${generations.size} generation${
        generations.size === 1 ? "" : "er"
      }`
      : `${counts.size} Pokémon · ${cards.length} cards · ${generations.size} generation${
        generations.size === 1 ? "" : "s"
      }`;
    applyFilters();
  } catch {
    if (request === state.artistRequest) {
      artistStatus.textContent = state.settings.language === "da"
        ? "Illustratorens kort kunne ikke indlæses."
        : "Could not load this illustrator’s cards.";
    }
  } finally {
    if (request === state.artistRequest) state.artistLoading = false;
  }
}
function clearMainArtist() {
  state.artistRequest++;
  state.artist = null;
  state.artistLoading = false;
  state.artistPokemonIds = null;
  state.artistCardIds = null;
  state.artistCardCounts = new Map();
  mainArtistInput.value = "";
  clearArtist.hidden = true;
  artistStatus.textContent = t("artistPrompt");
  applyFilters();
}
