function renderCollectionSummary() {
  const ownedIds = Object.keys(state.cardStates).filter((id) =>
    state.cardStates[id] === "owned"
  );
  const ownedCopies = ownedIds.reduce(
    (total, id) => total + Math.max(1, Number(state.cardCounts[id]) || 1),
    0,
  );
  const wanted =
    Object.values(state.cardStates).filter((v) => v === "wanted").length;
  const loaded = new Map(state.collectionCards.map((card) => [card.id, card]));
  const allOwnedLoaded = ownedIds.every((id) => loaded.has(id));
  let cardmarketTotal = 0;
  let tcgplayerTotal = 0;
  let cardmarketPriced = 0;
  let tcgplayerPriced = 0;
  ownedIds.forEach((id) => {
    const card = loaded.get(id);
    const quantity = Math.max(1, Number(state.cardCounts[id]) || 1);
    const cm = card && cardmarketValue(card);
    const tcg = card && tcgplayerValue(card);
    if (Number.isFinite(cm)) {
      cardmarketTotal += cm * quantity;
      cardmarketPriced++;
    }
    if (Number.isFinite(tcg)) {
      tcgplayerTotal += tcg * quantity;
      tcgplayerPriced++;
    }
  });
  const cmText = !allOwnedLoaded
    ? t("loading")
    : ownedIds.length && !cardmarketPriced
    ? "—"
    : money(cardmarketTotal, "EUR");
  const tcgText = !allOwnedLoaded
    ? t("loading")
    : ownedIds.length && !tcgplayerPriced
    ? "—"
    : money(tcgplayerTotal, "USD");
  document.querySelector("#collectionStats").innerHTML =
    `<div><strong>${ownedCopies}</strong><span>${
      t("ownedCopies")
    } · ${ownedIds.length} ${
      t("unique")
    }</span></div><div><strong>${cmText}</strong><span>Cardmarket ${
      t("total")
    } · ${cardmarketPriced}/${ownedIds.length} ${
      t("priced")
    }</span></div><div><strong>${tcgText}</strong><span>TCGplayer ${
      t("total")
    } · ${tcgplayerPriced}/${ownedIds.length} ${
      t("priced")
    }</span></div><div><strong>${wanted}</strong><span>${t("wanted")} ${
      state.settings.language === "da" ? "kort" : "cards"
    }</span></div><div><strong>${state.favorites.size}</strong><span>${
      t("favoritePokemon")
    }</span></div>`;
  document.querySelector("#favoriteList").innerHTML =
    [...state.favorites].map((id) => {
      const p = state.pokemon.find((x) => x.id === id);
      return p
        ? `<button data-pokemon="${p.name}"><img src="${ART}/${id}.png" alt="">${
          titleCase(p.name)
        }</button>`
        : "";
    }).join("") || `<p>${t("noFavorites")}</p>`;
}
function prepareCollectionCard(card) {
  return {
    ...card,
    variant: card.suffix || card.variant || deriveVariant(card.name),
    series: card.series || card.set?.serie?.name || "Other series",
  };
}
function cardPokedexNumber(card) {
  if (Number.isFinite(card.pokedexNumber)) return card.pokedexNumber;
  const haystack = ` ${normalizeCardName(card.name)} `;
  const matches = state.pokemon.filter((pokemon) =>
    haystack.includes(
      ` ${
        normalizeCardName(
          tcgNameOverrides[pokemon.name] || titleCase(pokemon.name),
        )
      } `,
    )
  ).map((pokemon) => pokemon.id);
  card.pokedexNumber = matches.length
    ? Math.min(...matches)
    : Number.MAX_SAFE_INTEGER;
  return card.pokedexNumber;
}
function collectionOptions(key) {
  return [
    ...new Set(
      state.collectionCards.map((card) =>
        key === "set" ? card.set?.name : card[key]
      ).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
function collectionSelect(key, label, allLabel, values) {
  return `<select data-collection-filter="${key}" aria-label="${label}"><option value="all">${allLabel}</option>${
    values.map((value) =>
      `<option value="${escapeHtml(value)}" ${
        state.collectionFilters[key] === value ? "selected" : ""
      }>${escapeHtml(value)}</option>`
    ).join("")
  }</select>`;
}
function populateCollectionFilters() {
  const available = {
    series: collectionOptions("series"),
    set: collectionOptions("set"),
    rarity: collectionOptions("rarity"),
    variant: collectionOptions("variant"),
    illustrator: collectionOptions("illustrator"),
  };
  Object.entries(available).forEach(([key, values]) => {
    if (
      state.collectionFilters[key] !== "all" &&
      !values.includes(state.collectionFilters[key])
    ) state.collectionFilters[key] = "all";
  });
  collectionFilters.innerHTML =
    `<select data-collection-filter="status" aria-label="${
      t("allStatuses")
    }"><option value="all">${
      t("allStatusesCollection")
    }</option><option value="owned" ${
      state.collectionFilters.status === "owned" ? "selected" : ""
    }>${t("owned")}</option><option value="wanted" ${
      state.collectionFilters.status === "wanted" ? "selected" : ""
    }>${t("wanted")}</option></select>${
      collectionSelect("series", t("series"), t("allSeries"), available.series)
    }${collectionSelect("set", t("set"), t("allSets"), available.set)}${
      collectionSelect(
        "rarity",
        t("rarity"),
        t("allRarities"),
        available.rarity,
      )
    }${
      collectionSelect(
        "variant",
        t("variant"),
        t("allVariants"),
        available.variant,
      )
    }${
      collectionSelect(
        "illustrator",
        t("illustrator"),
        t("allArtists"),
        available.illustrator,
      )
    }<select data-collection-filter="sort" aria-label="${
      t("sortCards")
    }"><option value="name">${t("nameOrder")}</option><option value="pokedex" ${
      state.collectionFilters.sort === "pokedex" ? "selected" : ""
    }>${t("pokedexSort")}</option><option value="setNumber" ${
      state.collectionFilters.sort === "setNumber" ? "selected" : ""
    }>${t("setNumberSort")}</option><option value="cardmarket" ${
      state.collectionFilters.sort === "cardmarket" ? "selected" : ""
    }>${t("cardmarketSort")}</option><option value="tcgplayer" ${
      state.collectionFilters.sort === "tcgplayer" ? "selected" : ""
    }>${t("tcgplayerSort")}</option></select>`;
  collectionFilters.querySelectorAll("select").forEach((select) =>
    select.addEventListener("change", (event) => {
      state.collectionFilters[event.target.dataset.collectionFilter] =
        event.target.value;
      renderCollectionCards();
    })
  );
}
function filteredCollectionCards() {
  const query = state.collectionFilters.query.trim().toLowerCase();
  const cards = state.collectionCards.filter((card) => {
    const status = state.cardStates[card.id];
    const haystack = [
      card.name,
      card.id,
      card.localId,
      card.set?.name,
      card.series,
      card.rarity,
      card.variant,
      card.illustrator,
    ].filter(Boolean).join(" ").toLowerCase();
    return (!query || haystack.includes(query)) &&
      (state.collectionFilters.status === "all" ||
        status === state.collectionFilters.status) &&
      (state.collectionFilters.series === "all" ||
        card.series === state.collectionFilters.series) &&
      (state.collectionFilters.set === "all" ||
        card.set?.name === state.collectionFilters.set) &&
      (state.collectionFilters.rarity === "all" ||
        card.rarity === state.collectionFilters.rarity) &&
      (state.collectionFilters.variant === "all" ||
        card.variant === state.collectionFilters.variant) &&
      (state.collectionFilters.illustrator === "all" ||
        card.illustrator === state.collectionFilters.illustrator);
  });
  const valueFor = state.collectionFilters.sort === "cardmarket"
    ? cardmarketValue
    : state.collectionFilters.sort === "tcgplayer"
    ? tcgplayerValue
    : null;
  if (valueFor) {
    return cards.sort((a, b) =>
      (valueFor(b) ?? -1) - (valueFor(a) ?? -1) || a.name.localeCompare(b.name)
    );
  }
  if (state.collectionFilters.sort === "pokedex") {
    return cards.sort((a, b) =>
      cardPokedexNumber(a) - cardPokedexNumber(b) ||
      a.name.localeCompare(b.name) ||
      String(a.localId).localeCompare(String(b.localId), undefined, {
        numeric: true,
      })
    );
  }
  if (state.collectionFilters.sort === "setNumber") {
    return cards.sort((a, b) =>
      String(a.localId || "").localeCompare(
        String(b.localId || ""),
        undefined,
        { numeric: true, sensitivity: "base" },
      ) || String(a.set?.name || "").localeCompare(String(b.set?.name || "")) ||
      a.name.localeCompare(b.name)
    );
  }
  return cards.sort((a, b) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
}
function renderCollectionCards() {
  const cards = filteredCollectionCards();
  document.querySelector("#collectionResultCount").textContent =
    `${cards.length} ${
      state.settings.language === "da"
        ? "kort"
        : `card${cards.length === 1 ? "" : "s"}`
    }`;
  if (!Object.keys(state.cardStates).length) {
    collectionCardGrid.innerHTML = `<div class="collection-empty">${
      t("markCards")
    }</div>`;
    return;
  }
  if (!cards.length) {
    collectionCardGrid.innerHTML = `<div class="collection-empty">${
      t("noSavedMatch")
    }</div>`;
    return;
  }
  collectionCardGrid.innerHTML = cards.map((card) => {
    const status = state.cardStates[card.id];
    const cm = cardmarketValue(card);
    const tcg = tcgplayerValue(card);
    const dex = cardPokedexNumber(card);
    return `<article class="collection-card" data-card-id="${card.id}"><button class="collection-card-open"><img loading="lazy" src="${
      cardImageUrl(card, "low")
    }" alt="${escapeHtml(card.name)}"><strong>${
      escapeHtml(card.name)
    }</strong><small>${
      Number.isFinite(dex) && dex < Number.MAX_SAFE_INTEGER
        ? `${formatId(dex)} · `
        : ""
    }${escapeHtml(card.set?.name || card.series || card.id)} · #${
      escapeHtml(card.localId || "—")
    }</small><small>${
      escapeHtml(card.variant)
    }</small><span class="collection-values"><i>CM ${
      Number.isFinite(cm) ? money(cm, "EUR") : "—"
    }</i><i>TCG ${
      Number.isFinite(tcg) ? money(tcg, "USD") : "—"
    }</i></span></button><span class="card-status"><button data-status="owned" class="${
      status === "owned" ? "active" : ""
    }">✓ ${t("owned")}</button><button data-status="wanted" class="${
      status === "wanted" ? "active" : ""
    }">♥ ${t("wanted")}</button></span>${
      cardPrintVariantControl(card, status)
    }${cardQuantity(card.id, status)}</article>`;
  }).join("");
}
async function showCollection() {
  renderCollectionSummary();
  if (!collectionDialog.open) collectionDialog.showModal();
  collectionSearch.value = state.collectionFilters.query;
  const request = ++state.collectionRequest;
  const ids = Object.keys(state.cardStates);
  const previous = new Map(
    state.collectionCards.map((card) => [card.id, card]),
  );
  state.collectionCards = ids.map((id) => previous.get(id)).filter(Boolean);
  populateCollectionFilters();
  renderCollectionCards();
  if (!ids.length) {
    renderCollectionSummary();
    return;
  }
  if (!state.collectionCards.length) {
    collectionCardGrid.innerHTML =
      `<div class="collection-empty"><div class="spinner"></div>${
        t("loadingSaved")
      }</div>`;
  }
  const queue = [...ids];
  const refreshed = new Map();
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        refreshed.set(
          id,
          prepareCollectionCard(
            await getJson(
              `${TCG_API}/cards/${encodeURIComponent(id)}`,
              true,
              true,
            ),
          ),
        );
      } catch {}
    }
  });
  await Promise.all(workers);
  if (request !== state.collectionRequest) return;
  state.collectionCards = ids.filter((id) => state.cardStates[id]).map((id) =>
    refreshed.get(id) || previous.get(id)
  ).filter(Boolean);
  renderCollectionSummary();
  populateCollectionFilters();
  renderCollectionCards();
}
function exportCollection() {
  const blob = new Blob([JSON.stringify(
    {
      version: 3,
      exportedAt: new Date().toISOString(),
      favorites: [...state.favorites],
      cardStates: state.cardStates,
      cardCounts: state.cardCounts,
      cardPrintVariants: state.cardPrintVariants,
      settings: state.settings,
    },
    null,
    2,
  )], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cardedex-collection-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importCollection(file) {
  try {
    const data = JSON.parse(await file.text());
    state.favorites = new Set(data.favorites || []);
    state.cardStates = data.cardStates || {};
    state.cardCounts = data.cardCounts || {};
    state.cardPrintVariants = data.cardPrintVariants || {};
    state.settings = { ...state.settings, ...data.settings };
    saveUser();
    applySettings();
    renderPokemon();
    showCollection();
  } catch {
    alert(t("invalidBackup"));
  }
}
