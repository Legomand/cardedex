const POKE_API = "https://pokeapi.co/api/v2";
const TCG_API = "https://api.tcgdex.net/v2/en";
const ART =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
const PAGE_SIZE = 48;
const POCKET_SERIES_ID = "tcgp";

const generationRanges = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 9999],
};
const typeColors = {
  normal: "#8f968b",
  fire: "#e76545",
  water: "#4b83c6",
  electric: "#d7ad32",
  grass: "#5d9a68",
  ice: "#63aeb7",
  fighting: "#bd5b4d",
  poison: "#8c5f9e",
  ground: "#bf8b54",
  flying: "#7895bb",
  psychic: "#d56981",
  bug: "#829447",
  rock: "#a08b61",
  ghost: "#6c658f",
  dragon: "#6871ae",
  dark: "#5b5755",
  steel: "#778c91",
  fairy: "#c87fa2",
};
const tints = [
  "#e8e4d7",
  "#dfeadf",
  "#e8dfd7",
  "#dbe7e8",
  "#e8e2d2",
  "#e2dfe9",
];
const tcgNameOverrides = {
  "farfetchd": "Farfetch'd",
  "sirfetchd": "Sirfetch'd",
  "mr-mime": "Mr. Mime",
  "mime-jr": "Mime Jr.",
  "type-null": "Type: Null",
  "ho-oh": "Ho-Oh",
  "porygon-z": "Porygon-Z",
  "jangmo-o": "Jangmo-o",
  "hakamo-o": "Hakamo-o",
  "kommo-o": "Kommo-o",
  "wo-chien": "Wo-Chien",
  "chien-pao": "Chien-Pao",
  "ting-lu": "Ting-Lu",
  "chi-yu": "Chi-Yu",
  "nidoran-f": "Nidoran♀",
  "nidoran-m": "Nidoran♂",
  "flabebe": "Flabébé",
};
const cardImageOverrides = {
  "smp-SM228":
    "https://assets.pokemon.com/assets/cms2/img/cards/web/SMP/SMP_EN_SM228.png",
};

const saved = JSON.parse(localStorage.getItem("cardedex-user") || "{}");
const state = {
  pokemon: [],
  pokemonAliases: [],
  filtered: [],
  visible: PAGE_SIZE,
  generation: "all",
  query: "",
  current: null,
  illustrators: [],
  artist: null,
  artistPokemonIds: null,
  artistCardIds: null,
  artistCardCounts: new Map(),
  artistRequest: 0,
  artistLoading: false,
  cardSeries: [],
  cardSets: [],
  catalogSeries: "all",
  catalogSet: "all",
  mainOrder: "pokedex",
  catalogPokemonIds: null,
  catalogCardIds: null,
  catalogCardCounts: new Map(),
  catalogCardOrder: new Map(),
  catalogRequest: 0,
  cardRarities: [],
  catalogRarity: "all",
  rarityPokemonIds: null,
  rarityCardIds: null,
  rarityCardCounts: new Map(),
  rarityRequest: 0,
  cards: [],
  sort: "archive",
  advancedLoaded: false,
  cardFilters: {
    variant: "all",
    status: "all",
    series: "all",
    set: "all",
    rarity: "all",
    illustrator: "all",
  },
  collectionCards: [],
  collectionRequest: 0,
  collectionFilters: {
    query: "",
    status: "all",
    series: "all",
    set: "all",
    rarity: "all",
    variant: "all",
    illustrator: "all",
    sort: "name",
  },
  favorites: new Set(saved.favorites || []),
  cardStates: saved.cardStates || {},
  cardCounts: saved.cardCounts || {},
  cardPrintVariants: saved.cardPrintVariants || {},
  settings: {
    dark: false,
    language: "en",
    shiny: false,
    hidePocket: false,
    ...saved.settings,
  },
};
const grid = document.querySelector("#pokemonGrid");
const template = document.querySelector("#pokemonCardTemplate");
const resultCount = document.querySelector("#resultCount");
const loadMore = document.querySelector("#loadMore");
const emptyState = document.querySelector("#emptyState");
const drawer = document.querySelector("#pokemonDrawer");
const backdrop = document.querySelector("#drawerBackdrop");
const drawerContent = document.querySelector("#drawerContent");
const searchInput = document.querySelector("#searchInput");
const searchSuggestions = document.querySelector("#searchSuggestions");
const mainArtistInput = document.querySelector("#mainArtistInput");
const artistStatus = document.querySelector("#artistStatus");
const clearArtist = document.querySelector("#clearArtist");
const artistSuggestions = document.querySelector("#artistSuggestions");
const mainSeriesFilter = document.querySelector("#mainSeriesFilter");
const mainSetFilter = document.querySelector("#mainSetFilter");
const mainRarityFilter = document.querySelector("#mainRarityFilter");
const mainOrderFilter = document.querySelector("#mainOrderFilter");
const hidePocketToggle = document.querySelector("#hidePocketToggle");
const catalogFilterStatus = document.querySelector("#catalogFilterStatus");
const rarityFilterStatus = document.querySelector("#rarityFilterStatus");
const cardDialog = document.querySelector("#cardLightbox");
const collectionDialog = document.querySelector("#collectionDialog");
const collectionSearch = document.querySelector("#collectionSearch");
const collectionFilters = document.querySelector("#collectionFilters");
const collectionCardGrid = document.querySelector("#collectionCardGrid");

const words = {
  en: {
    about: "About",
    completeCompanion: "The complete card companion",
    heroTitle: "Every Pokémon.<br><em>Every card.</em>",
    heroDescription:
      "Explore the full Pokédex, then open any Pokémon to discover its trading cards across every era.",
    popular: "Popular",
    nationalPokedex: "National Pokédex",
    choosePokemon: "Choose your Pokémon",
    pokemonFound: "Pokémon found",
    allGenerations: "All generations",
    series: "Series",
    set: "Set",
    rarity: "Rarity",
    order: "Order",
    pokedexNumber: "Pokédex #",
    cardNumber: "Card #",
    artistPrompt:
      "Choose an illustrator to see their Pokémon across every generation.",
    noPokemon: "No Pokémon found",
    tryAnother: "Try another name, number, or generation.",
    loadMore: "Load more",
    builtForCollectors: "Built for collectors",
    aboutTitle: "From the very first set<br>to the latest release.",
    aboutDescription:
      "Cardédex brings the National Pokédex and decades of Pokémon card artwork into one calm, searchable collection.",
    footer:
      "Data from PokéAPI and TCGdex. Pokémon and Pokémon character names are trademarks of Nintendo.",
    savedDevice: "Saved on this device",
    myCollection: "My collection",
    collectionPrivacy:
      "Your favorites and card checklist stay private on this device.",
    exportBackup: "Export backup",
    importBackup: "Import backup",
    cardChecklist: "Card checklist",
    savedCards: "Saved cards",
    favoritePokemon: "Favorite Pokémon",
    viewCards: "View cards",
    searchPokemon: "Search by name or Pokédex number…",
    searchCollection: "Search card, Pokémon, set, artist…",
    searchIllustrator: "Search card illustrator…",
    hidePocket: "Hide TCG Pocket",
    cards: "cards found",
    cardFound: "card found",
    owned: "Owned",
    wanted: "Wanted",
    collectionStatus: "Collection status",
    missing: "Missing",
    all: "All",
    favorite: "Favorite",
    shiny: "Shiny artwork",
    archive: "Trading card archive",
    advanced: "Load rarity & artist filters",
    offline: "Cached for offline use",
    allSeries: "All series",
    allSets: "All sets",
    allRarities: "All rarities",
    loadingSets: "Loading sets…",
    orderCard: "Order: card #",
    chooseSet: "Order: card # (choose set)",
    height: "Height",
    weight: "Weight",
    abilities: "Abilities",
    stats: "Stat comparison · max 255",
    evolution: "Evolution",
    cardsFeaturing: "Cards featuring {name}",
    searchingSets: "Searching every set…",
    archiveOrder: "Archive order",
    reverseOrder: "Reverse order",
    nameOrder: "Name A–Z",
    lookingArchive: "Looking through the card archive…",
    loadingPokemon: "Loading Pokémon details…",
    openingArchive: "Opening the card archive…",
    allVariants: "All variants",
    allStatuses: "All statuses",
    allArtists: "All artists",
    loadingSeries: "Loading series…",
    loadingSetNames: "Loading set names…",
    loadArtistNames: "Load artist names…",
    noMatchingCards: "No cards match these filters.",
    setLoading: "Set name loading…",
    card: "Card",
    loadingDetails: "Loading card details…",
    variant: "variant",
    unknown: "Unknown",
    unknownSet: "Unknown set",
    otherSeries: "Other series",
    illustrator: "Illustrator",
    stage: "Stage",
    hpType: "HP / Type",
    printVariants: "Available print variants",
    standard: "Standard",
    print: "Print",
    loadingPrint: "Loading print options…",
    ownedCopies: "Owned copies",
    removeCopy: "Remove one copy",
    addCopy: "Add one copy",
    loading: "Loading…",
    unique: "unique",
    priced: "priced",
    total: "total",
    noFavorites: "No favorite Pokémon yet.",
    allStatusesCollection: "All statuses",
    sortCards: "Sort cards",
    pokedexSort: "Pokédex number ↑",
    setNumberSort: "Card number (set) ↑",
    cardmarketSort: "Cardmarket value ↓",
    tcgplayerSort: "TCGplayer value ↓",
    markCards: "Mark cards as owned or wanted and they will appear here.",
    noSavedMatch: "No saved cards match these filters.",
    loadingSaved: "Loading your saved cards…",
    invalidBackup: "This is not a valid Cardédex backup.",
    unavailablePokedex:
      "The Pokédex is unavailable and no offline copy exists yet.",
    connectOffline: "Connect once to prepare offline mode.",
    unavailableCards: "The card archive is unavailable.",
    viewedOffline: "Previously viewed cards remain available offline.",
    closeDetails: "Close details",
    closePreview: "Close card preview",
    closeCollection: "Close collection",
    switchLanguage: "Switch language",
    toggleDark: "Toggle dark mode",
    filterGeneration: "Filter by generation",
    filterRelease: "Filter by card release",
    filterIllustrator: "Filter Pokémon by card illustrator",
    clearIllustrator: "Clear illustrator filter",
    matchingCards: "Matching cards",
    illustratorsOffline: "Illustrators unavailable offline",
    loadingArtists: "Loading artists…",
    noArtists: "No matching artists",
    chooseSuggestion: "Choose an illustrator from the suggestions.",
    scanCard: "Scan a Pokémon card",
    closeScanner: "Close card scanner",
    scannerKicker: "Card scanner",
    scannerIntro:
      "Fill the frame with one straight card on a plain surface. Keep its name, HP, attacks, and collector number clear.",
    takePhoto: "Take photo",
    choosePicture: "Choose picture",
    scannerPrivacy:
      "Recognition runs on this device. Your picture is not uploaded to Cardédex.",
    scannerPreparing: "Preparing the picture…",
    scannerReading: "Reading the card… {progress}%",
    scannerSearching: "Searching for matching cards…",
    scannerComparing: "Comparing card artwork… {done}/{total}",
    scannerMatches: "Possible matches",
    scannerOwned: "Owned · {count}",
    scannerWanted: "Wanted",
    scannerNotSaved: "Not in collection",
    scannerNoPokemon:
      "I couldn't read the Pokémon name. Try again with the card closer, straight, and without glare.",
    scannerNoCards:
      "I found {name}, but couldn't match the exact card. Try a clearer picture of the collector number.",
    scannerUnavailable:
      "The scanner could not start. Check your connection and try again.",
    scannerOpenCard: "Open card",
  },
  da: {
    about: "Om",
    completeCompanion: "Den komplette kortmakker",
    heroTitle: "Alle Pokémon.<br><em>Alle kort.</em>",
    heroDescription:
      "Udforsk hele Pokédexet, og åbn derefter en Pokémon for at se dens samlekort fra alle tidsperioder.",
    popular: "Populære",
    nationalPokedex: "Nationalt Pokédex",
    choosePokemon: "Vælg din Pokémon",
    pokemonFound: "Pokémon fundet",
    allGenerations: "Alle generationer",
    series: "Serie",
    set: "Sæt",
    rarity: "Sjældenhed",
    order: "Sortering",
    pokedexNumber: "Pokédex-nr.",
    cardNumber: "Kortnr.",
    artistPrompt:
      "Vælg en illustrator for at se deres Pokémon på tværs af alle generationer.",
    noPokemon: "Ingen Pokémon fundet",
    tryAnother: "Prøv et andet navn, nummer eller en anden generation.",
    loadMore: "Vis flere",
    builtForCollectors: "Skabt til samlere",
    aboutTitle: "Fra det allerførste sæt<br>til den nyeste udgivelse.",
    aboutDescription:
      "Cardédex samler det nationale Pokédex og årtiers Pokémon-kortkunst i én rolig og søgbar samling.",
    footer:
      "Data fra PokéAPI og TCGdex. Pokémon og navnene på Pokémon-figurer er varemærker tilhørende Nintendo.",
    savedDevice: "Gemt på denne enhed",
    myCollection: "Min samling",
    collectionPrivacy:
      "Dine favoritter og din kortoversigt forbliver private på denne enhed.",
    exportBackup: "Eksportér sikkerhedskopi",
    importBackup: "Importér sikkerhedskopi",
    cardChecklist: "Kortoversigt",
    savedCards: "Gemte kort",
    favoritePokemon: "Favorit-Pokémon",
    viewCards: "Se kort",
    searchPokemon: "Søg efter navn eller Pokédex-nummer…",
    searchCollection: "Søg efter kort, Pokémon, sæt eller illustrator…",
    searchIllustrator: "Søg efter kortillustrator…",
    hidePocket: "Skjul TCG Pocket",
    cards: "kort fundet",
    cardFound: "kort fundet",
    owned: "Ejet",
    wanted: "Ønsket",
    collectionStatus: "Samlingsstatus",
    missing: "Mangler",
    all: "Alle",
    favorite: "Favorit",
    shiny: "Shiny-billede",
    archive: "Samlekortarkiv",
    advanced: "Indlæs sjældenhed og illustrator",
    offline: "Gemt til offline brug",
    allSeries: "Alle serier",
    allSets: "Alle sæt",
    allRarities: "Alle sjældenheder",
    loadingSets: "Indlæser sæt…",
    orderCard: "Sortér efter kortnr.",
    chooseSet: "Kortnr. (vælg et sæt)",
    height: "Højde",
    weight: "Vægt",
    abilities: "Evner",
    stats: "Sammenligning af egenskaber · maks. 255",
    evolution: "Udvikling",
    cardsFeaturing: "Kort med {name}",
    searchingSets: "Søger i alle sæt…",
    archiveOrder: "Arkivrækkefølge",
    reverseOrder: "Omvendt rækkefølge",
    nameOrder: "Navn A–Å",
    lookingArchive: "Søger i kortarkivet…",
    loadingPokemon: "Indlæser Pokémon-oplysninger…",
    openingArchive: "Åbner kortarkivet…",
    allVariants: "Alle varianter",
    allStatuses: "Alle statusser",
    allArtists: "Alle illustratorer",
    loadingSeries: "Indlæser serier…",
    loadingSetNames: "Indlæser sætnavne…",
    loadArtistNames: "Indlæs illustratornavne…",
    noMatchingCards: "Ingen kort matcher disse filtre.",
    setLoading: "Indlæser sætnavn…",
    card: "Kort",
    loadingDetails: "Indlæser kortoplysninger…",
    variant: "variant",
    unknown: "Ukendt",
    unknownSet: "Ukendt sæt",
    otherSeries: "Anden serie",
    illustrator: "Illustrator",
    stage: "Trin",
    hpType: "HP / Type",
    printVariants: "Tilgængelige trykvarianter",
    standard: "Standard",
    print: "Tryk",
    loadingPrint: "Indlæser trykmuligheder…",
    ownedCopies: "Ejede eksemplarer",
    removeCopy: "Fjern ét eksemplar",
    addCopy: "Tilføj ét eksemplar",
    loading: "Indlæser…",
    unique: "unikke",
    priced: "med pris",
    total: "i alt",
    noFavorites: "Ingen favorit-Pokémon endnu.",
    allStatusesCollection: "Alle statusser",
    sortCards: "Sortér kort",
    pokedexSort: "Pokédex-nummer ↑",
    setNumberSort: "Kortnummer (sæt) ↑",
    cardmarketSort: "Cardmarket-værdi ↓",
    tcgplayerSort: "TCGplayer-værdi ↓",
    markCards: "Markér kort som ejede eller ønskede, så vises de her.",
    noSavedMatch: "Ingen gemte kort matcher disse filtre.",
    loadingSaved: "Indlæser dine gemte kort…",
    invalidBackup: "Dette er ikke en gyldig Cardédex-sikkerhedskopi.",
    unavailablePokedex:
      "Pokédexet er ikke tilgængeligt, og der findes endnu ingen offlinekopi.",
    connectOffline:
      "Opret forbindelse én gang for at klargøre offline-tilstand.",
    unavailableCards: "Kortarkivet er ikke tilgængeligt.",
    viewedOffline: "Tidligere viste kort er stadig tilgængelige offline.",
    closeDetails: "Luk oplysninger",
    closePreview: "Luk kortvisning",
    closeCollection: "Luk samling",
    switchLanguage: "Skift sprog",
    toggleDark: "Slå mørk tilstand til eller fra",
    filterGeneration: "Filtrér efter generation",
    filterRelease: "Filtrér efter kortudgivelse",
    filterIllustrator: "Filtrér Pokémon efter kortillustrator",
    clearIllustrator: "Ryd illustratorfilter",
    matchingCards: "Matchende kort",
    illustratorsOffline: "Illustratorer er ikke tilgængelige offline",
    loadingArtists: "Indlæser illustratorer…",
    noArtists: "Ingen matchende illustratorer",
    chooseSuggestion: "Vælg en illustrator fra forslagene.",
    scanCard: "Scan et Pokémon-kort",
    closeScanner: "Luk kortscanner",
    scannerKicker: "Kortscanner",
    scannerIntro:
      "Fyld billedet med ét lige kort på en ensfarvet overflade. Hold navn, HP, angreb og samlernummer tydelige.",
    takePhoto: "Tag et billede",
    choosePicture: "Vælg et billede",
    scannerPrivacy:
      "Genkendelsen kører på denne enhed. Dit billede uploades ikke til Cardédex.",
    scannerPreparing: "Forbereder billedet…",
    scannerReading: "Læser kortet… {progress}%",
    scannerSearching: "Søger efter matchende kort…",
    scannerComparing: "Sammenligner kortmotiver… {done}/{total}",
    scannerMatches: "Mulige matches",
    scannerOwned: "Ejet · {count}",
    scannerWanted: "Ønsket",
    scannerNotSaved: "Ikke i samlingen",
    scannerNoPokemon:
      "Jeg kunne ikke læse Pokémon-navnet. Prøv igen med kortet tættere på, lige og uden genskin.",
    scannerNoCards:
      "Jeg fandt {name}, men kunne ikke matche det præcise kort. Prøv et tydeligere billede af samlernummeret.",
    scannerUnavailable:
      "Scanneren kunne ikke starte. Kontrollér forbindelsen, og prøv igen.",
    scannerOpenCard: "Åbn kort",
  },
};
const t = (key, values = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    words[state.settings.language][key] || words.en[key] || key,
  );
function titleCase(value) {
  return value.split("-").map((part) =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join(" ");
}
function pokemonId(url) {
  return Number(url.match(/\/(\d+)\/?$/)?.[1]);
}
function formatId(id) {
  return `#${String(id).padStart(4, "0")}`;
}
function tintFor(id) {
  return tints[id % tints.length];
}
function normalizeCardName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(
    /♀/g,
    " female ",
  ).replace(/♂/g, " male ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function generationFor(id) {
  return Number(
    Object.entries(generationRanges).find(([, range]) =>
      id >= range[0] && id <= range[1]
    )?.[0],
  );
}
function saveUser() {
  localStorage.setItem(
    "cardedex-user",
    JSON.stringify({
      favorites: [...state.favorites],
      cardStates: state.cardStates,
      cardCounts: state.cardCounts,
      cardPrintVariants: state.cardPrintVariants,
      settings: state.settings,
    }),
  );
}
function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}
function cleanIllustratorName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return null;
  if (name.includes('"') && name !== '"Big Mama" Tagawa') return null;
  return name;
}
function artistSortKey(name) {
  return name.replace(/^[^\p{L}]+/u, "").toLowerCase();
}
function compareArtists(a, b) {
  const aKey = artistSortKey(a);
  const bKey = artistSortKey(b);
  const aLetter = /^\p{L}/u.test(aKey);
  const bLetter = /^\p{L}/u.test(bKey);
  return Number(bLetter) - Number(aLetter) ||
    aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: "base" });
}

const cacheDb = new Promise((resolve, reject) => {
  const request = indexedDB.open("cardedex-cache", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("json");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function cacheRead(key) {
  try {
    const db = await cacheDb;
    return await new Promise((resolve, reject) => {
      const r = db.transaction("json").objectStore("json").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}
async function cacheWrite(key, value) {
  try {
    const db = await cacheDb;
    const tx = db.transaction("json", "readwrite");
    tx.objectStore("json").put(value, key);
  } catch {}
}
async function getJson(url, cache = true, fresh = false) {
  try {
    const response = await fetch(
      url,
      fresh ? { cache: "no-cache" } : undefined,
    );
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const value = await response.json();
    if (cache) cacheWrite(url, value);
    return value;
  } catch (error) {
    const cached = cache ? await cacheRead(url) : null;
    if (cached) return cached;
    throw error;
  }
}
