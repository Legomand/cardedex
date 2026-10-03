function applySettings() {
  document.body.classList.toggle("dark", state.settings.dark);
  document.querySelector("#themeToggle").textContent = state.settings.dark
    ? "☀"
    : "☾";
  document.querySelector("#langToggle").textContent =
    state.settings.language === "en" ? "DA" : "EN";
  document.documentElement.lang = state.settings.language;
  document.title = state.settings.language === "da"
    ? "Cardédex — Pokémon og kort"
    : "Cardédex — Pokémon & cards";
  const setText = (selector, key) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = t(key);
  };
  const setHtml = (selector, key) => {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = t(key);
  };
  const setLabel = (selector, key) => {
    const node = document.querySelector(selector);
    if (node) {
      node.setAttribute("aria-label", t(key));
      node.title = t(key);
    }
  };
  setText('nav a[href="#about"]', "about");
  setText(".eyebrow", "completeCompanion");
  document.querySelector(".eyebrow").insertAdjacentHTML(
    "afterbegin",
    "<span></span>",
  );
  setHtml(".hero h1", "heroTitle");
  setText(".hero>p", "heroDescription");
  setText(".quick-picks>span", "popular");
  setText(".catalog-heading .section-kicker", "nationalPokedex");
  setText("#catalogTitle", "choosePokemon");
  setText(".result-count span", "pokemonFound");
  setText('#generationFilters [data-gen="all"]', "allGenerations");
  setText(".pocket-toggle span", "hidePocket");
  hidePocketToggle.classList.toggle("active", state.settings.hidePocket);
  hidePocketToggle.setAttribute(
    "aria-pressed",
    String(state.settings.hidePocket),
  );
  document.querySelectorAll(".catalog-select>span").forEach((node, index) =>
    node.textContent = t(["series", "set", "rarity", "order"][index])
  );
  setText(".empty-state h3", "noPokemon");
  setText(".empty-state p", "tryAnother");
  loadMore.childNodes[0].textContent = `${t("loadMore")} `;
  setText(".about>span", "builtForCollectors");
  setHtml(".about h2", "aboutTitle");
  setText(".about p", "aboutDescription");
  setText("footer>p", "footer");
  setText(".collection-button span", "myCollection");
  setText(".collection-content>.section-kicker", "savedDevice");
  setText(".collection-content>h2", "myCollection");
  setText(".collection-intro", "collectionPrivacy");
  setText("#exportCollection", "exportBackup");
  setText("#importCollection", "importBackup");
  setText(".collection-browser-heading .section-kicker", "cardChecklist");
  setText("#collectionCardsTitle", "savedCards");
  setText(".favorite-heading .section-kicker", "favoritePokemon");
  template.content.querySelector(".card-copy>span").innerHTML = `${
    t("viewCards")
  } <i>↗</i>`;
  searchInput.placeholder = t("searchPokemon");
  collectionSearch.placeholder = t("searchCollection");
  mainArtistInput.placeholder = t("searchIllustrator");
  if (!state.artist) artistStatus.textContent = t("artistPrompt");
  setLabel("#langToggle", "switchLanguage");
  setLabel("#themeToggle", "toggleDark");
  setLabel("#generationFilters", "filterGeneration");
  setLabel(".catalog-dropdowns", "filterRelease");
  setLabel("#mainArtistInput", "filterIllustrator");
  setLabel("#clearArtist", "clearIllustrator");
  setLabel("#drawerClose", "closeDetails");
  setLabel("#lightboxClose", "closePreview");
  setLabel("#collectionClose", "closeCollection");
  if (typeof applyScannerLanguage === "function") applyScannerLanguage();
  const pokedexOption = mainOrderFilter.querySelector('[value="pokedex"]');
  if (pokedexOption) pokedexOption.textContent = t("pokedexNumber");
  if (mainSeriesFilter.options[0]) {
    mainSeriesFilter.options[0].textContent = t("allSeries");
  }
  if (mainSetFilter.options[0] && !mainSetFilter.disabled) {
    mainSetFilter.options[0].textContent = t("allSets");
  }
  if (mainRarityFilter.options[0]) {
    mainRarityFilter.options[0].textContent = t("allRarities");
  }
  updateMainOrderControl();
}
function closeDrawer(updateHistory = true) {
  drawer.classList.remove("open");
  backdrop.classList.remove("visible");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
  state.current = null;
  setTimeout(() => {
    backdrop.hidden = true;
  }, 300);
  if (updateHistory && location.search) {
    history.pushState({}, "", location.pathname);
  }
}

grid.addEventListener("click", (e) => {
  const star = e.target.closest(".favorite-star");
  if (star) {
    e.stopPropagation();
    toggleFavorite(star.dataset.id);
    return;
  }
  const card = e.target.closest(".pokemon-card");
  if (card) openPokemon(card.dataset.name);
});
loadMore.addEventListener("click", () => {
  state.visible += PAGE_SIZE;
  renderPokemon();
});
document.querySelector("#generationFilters").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  document.querySelectorAll("#generationFilters button").forEach((x) =>
    x.classList.remove("active")
  );
  b.classList.add("active");
  state.generation = b.dataset.gen;
  applyFilters();
});
mainSeriesFilter.addEventListener("change", (event) => {
  state.catalogSeries = event.target.value;
  state.catalogSet = "all";
  renderMainSetOptions();
  applyMainCardFilter();
});
mainSetFilter.addEventListener("change", (event) => {
  state.catalogSet = event.target.value;
  const set = state.cardSets.find((item) => item.id === state.catalogSet);
  if (set && state.catalogSeries !== set.seriesId) {
    state.catalogSeries = set.seriesId;
    mainSeriesFilter.value = set.seriesId;
    renderMainSetOptions();
    mainSetFilter.value = set.id;
  }
  applyMainCardFilter();
});
mainRarityFilter.addEventListener("change", (event) => {
  state.catalogRarity = event.target.value;
  applyMainRarityFilter();
});
mainOrderFilter.addEventListener("change", (event) => {
  state.mainOrder = event.target.value;
  applyFilters();
});
hidePocketToggle.addEventListener("click", () => {
  const selectedSet = state.cardSets.find((set) => set.id === state.catalogSet);
  const hidePocket = !state.settings.hidePocket;
  const resetRelease = hidePocket &&
    (state.catalogSeries === POCKET_SERIES_ID || isPocketSet(selectedSet));
  state.settings.hidePocket = hidePocket;
  hidePocketToggle.classList.toggle("active", hidePocket);
  hidePocketToggle.setAttribute("aria-pressed", String(hidePocket));
  saveUser();
  if (resetRelease) {
    state.catalogSeries = "all";
    state.catalogSet = "all";
  }
  state.cardFilters.series = "all";
  state.cardFilters.set = "all";
  renderMainSeriesOptions();
  renderMainSetOptions();
  if (resetRelease) applyMainCardFilter();
  if (state.artist) {
    const artist = state.artist;
    state.artist = null;
    state.artistPokemonIds = null;
    selectMainArtist(artist);
  }
  if (state.catalogRarity !== "all") applyMainRarityFilter();
  renderCardFilters();
  renderCards();
});
searchInput.addEventListener("input", (e) => {
  state.query = e.target.value;
  applyFilters();
  renderSearchSuggestions();
});
searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim()) renderSearchSuggestions();
});
searchInput.addEventListener(
  "blur",
  () => setTimeout(hideSearchSuggestions, 400),
);
searchInput.addEventListener("keydown", (event) => {
  const options = [...searchSuggestions.querySelectorAll("[data-pokemon]")];
  if (event.key === "ArrowDown" && options.length) {
    event.preventDefault();
    highlightSearchSuggestion(searchSuggestionIndex + 1);
  } else if (event.key === "ArrowUp" && options.length) {
    event.preventDefault();
    highlightSearchSuggestion(searchSuggestionIndex - 1);
  } else if (
    event.key === "Enter" && !searchSuggestions.hidden && options.length
  ) {
    event.preventDefault();
    choosePokemonSuggestion(
      options[Math.max(0, searchSuggestionIndex)].dataset.pokemon,
    );
  } else if (event.key === "Escape") hideSearchSuggestions();
});
let lastSearchSuggestionTap = 0;
function activateSearchSuggestion(event) {
  const option = event.target.closest("[data-pokemon]");
  if (!option) return;
  event.preventDefault();
  const now = Date.now();
  if (now - lastSearchSuggestionTap < 600) return;
  lastSearchSuggestionTap = now;
  choosePokemonSuggestion(option.dataset.pokemon);
}
searchSuggestions.addEventListener("pointerdown", activateSearchSuggestion);
searchSuggestions.addEventListener("touchend", activateSearchSuggestion, {
  passive: false,
});
searchSuggestions.addEventListener("click", activateSearchSuggestion);
document.querySelector("#searchForm").addEventListener(
  "submit",
  (e) => e.preventDefault(),
);
mainArtistInput.addEventListener("focus", () => showArtistSuggestions());
mainArtistInput.addEventListener("click", () => showArtistSuggestions());
mainArtistInput.addEventListener("input", (e) => {
  const value = e.target.value;
  showArtistSuggestions(value);
  if (!value.trim()) {
    if (state.artist) clearMainArtist();
    showArtistSuggestions();
    return;
  }
  const exact = state.illustrators.find((name) =>
    name.toLowerCase() === value.trim().toLowerCase()
  );
  if (exact) selectMainArtist(exact);
});
mainArtistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    selectMainArtist(e.currentTarget.value);
  }
  if (e.key === "Escape") hideArtistSuggestions();
});
mainArtistInput.addEventListener(
  "blur",
  () => setTimeout(hideArtistSuggestions, 120),
);
artistSuggestions.addEventListener("mousedown", (e) => {
  const option = e.target.closest("[data-artist]");
  if (!option) return;
  e.preventDefault();
  selectMainArtist(option.dataset.artist);
});
clearArtist.addEventListener("click", () => {
  clearMainArtist();
  hideArtistSuggestions();
});
document.querySelector(".quick-picks").addEventListener("click", (e) => {
  if (!e.target.dataset.search) return;
  searchInput.value = e.target.dataset.search;
  state.query = e.target.dataset.search;
  applyFilters();
  document.querySelector(".catalog").scrollIntoView({ behavior: "smooth" });
});
drawerContent.addEventListener("click", (e) => {
  const evo = e.target.closest("[data-evolution]");
  if (evo) {
    openPokemon(evo.dataset.evolution);
    return;
  }
  const quantity = e.target.closest("[data-count]");
  if (quantity) {
    adjustCardCount(
      quantity.closest(".tcg-card").dataset.cardId,
      quantity.dataset.count,
    );
    return;
  }
  const status = e.target.closest("[data-status]");
  if (status) {
    setCardStatus(
      status.closest(".tcg-card").dataset.cardId,
      status.dataset.status,
    );
    return;
  }
  const open = e.target.closest(".tcg-open");
  if (open) {
    const card = state.cards.find((c) =>
      c.id === open.closest(".tcg-card").dataset.cardId
    );
    if (card) openCard(card);
  }
});
drawerContent.addEventListener("change", (event) => {
  if (event.target.matches("[data-print-variant]")) {
    setPrintVariant(
      event.target.closest(".tcg-card").dataset.cardId,
      event.target.value,
    );
  }
});
document.querySelector("#drawerClose").addEventListener(
  "click",
  () => closeDrawer(),
);
backdrop.addEventListener("click", () => closeDrawer());
document.querySelector("#lightboxClose").addEventListener(
  "click",
  () => cardDialog.close(),
);
cardDialog.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.close();
    return;
  }
  const cardId = cardDialog.dataset.cardId;
  const card = cardDialog.cardData || state.cards.find((value) =>
    value.id === cardId
  ) || state.collectionCards.find((value) => value.id === cardId);
  if (!card) return;
  const status = e.target.closest("[data-detail-status]");
  if (status) {
    setCardStatus(cardId, status.dataset.detailStatus);
    openCard(card);
    return;
  }
  const quantity = e.target.closest("[data-count]");
  if (quantity) {
    adjustCardCount(cardId, quantity.dataset.count);
    openCard(card);
  }
});
cardDialog.addEventListener("change", (event) => {
  if (!event.target.matches("[data-print-variant]")) return;
  const cardId = cardDialog.dataset.cardId;
  const card = cardDialog.cardData || state.cards.find((value) =>
    value.id === cardId
  ) || state.collectionCards.find((value) => value.id === cardId);
  setPrintVariant(cardId, event.target.value);
  if (card) openCard(card);
});
document.querySelector("#collectionOpen").addEventListener(
  "click",
  showCollection,
);
document.querySelector("#collectionClose").addEventListener(
  "click",
  () => collectionDialog.close(),
);
document.querySelector("#exportCollection").addEventListener(
  "click",
  exportCollection,
);
document.querySelector("#importCollection").addEventListener(
  "click",
  () => document.querySelector("#importFile").click(),
);
document.querySelector("#importFile").addEventListener("change", (e) => {
  if (e.target.files[0]) importCollection(e.target.files[0]);
});
document.querySelector("#favoriteList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pokemon]");
  if (b) {
    collectionDialog.close();
    openPokemon(b.dataset.pokemon);
  }
});
collectionSearch.addEventListener("input", (event) => {
  state.collectionFilters.query = event.target.value;
  renderCollectionCards();
});
collectionCardGrid.addEventListener("click", (event) => {
  const item = event.target.closest(".collection-card");
  if (!item) return;
  const quantity = event.target.closest("[data-count]");
  if (quantity) {
    adjustCardCount(item.dataset.cardId, quantity.dataset.count);
    return;
  }
  const status = event.target.closest("[data-status]");
  if (status) {
    setCardStatus(item.dataset.cardId, status.dataset.status);
    return;
  }
  const open = event.target.closest(".collection-card-open");
  if (open) {
    const card = state.collectionCards.find((value) =>
      value.id === item.dataset.cardId
    );
    if (card) openCard(card);
  }
});
collectionCardGrid.addEventListener("change", (event) => {
  if (event.target.matches("[data-print-variant]")) {
    setPrintVariant(
      event.target.closest(".collection-card").dataset.cardId,
      event.target.value,
    );
  }
});
document.querySelector("#themeToggle").addEventListener("click", () => {
  state.settings.dark = !state.settings.dark;
  saveUser();
  applySettings();
});
document.querySelector("#langToggle").addEventListener("click", () => {
  state.settings.language = state.settings.language === "en" ? "da" : "en";
  saveUser();
  applySettings();
  renderPokemon();
  if (state.artist) selectMainArtist(state.artist);
  if (state.current) openPokemon(state.current.name, false);
  if (collectionDialog.open) {
    renderCollectionSummary();
    populateCollectionFilters();
    renderCollectionCards();
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
});
window.addEventListener("popstate", () => {
  const slug = new URLSearchParams(location.search).get("pokemon");
  if (slug) openPokemon(slug, false);
  else closeDrawer(false);
});

updateMainOrderControl();
loadPokemon();

if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost" ||
    location.hostname === "127.0.0.1")
) {
  window.addEventListener(
    "load",
    () =>
      navigator.serviceWorker.register("./service-worker.js").catch(() => {}),
  );
}
