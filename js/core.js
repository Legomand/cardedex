const POKE_API = "https://pokeapi.co/api/v2";
const TCG_API = "https://api.tcgdex.net/v2/en";
const ART =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";
const PAGE_SIZE = 48;
const POCKET_SERIES_ID = "tcgp";

function normalizeValuationCurrency(value) {
  return value === "dkk" ? "dkk" : "market";
}

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
  // Verified XY Trainer Kit scans, including each distinct printed card number.
  // Noivern
  "tk-xy-n-1":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-001-spoink.png",
  "tk-xy-n-2":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-002-gourgeist.jpg",
  "tk-xy-n-3":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-003-arbok.jpg",
  "tk-xy-n-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-004-bunnelby.jpg",
  "tk-xy-n-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-011-pumpkaboo.jpg",
  "tk-xy-n-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-012-noibat.jpg",
  "tk-xy-n-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-013-noivern.jpg",
  "tk-xy-n-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-016-ekans.jpg",
  "tk-xy-n-18":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-018-pumpkaboo.jpg",
  "tk-xy-n-20":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-020-furfrou.jpg",
  "tk-xy-n-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-023-noibat.jpg",
  "tk-xy-n-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6A-030-noivern.jpg",
  // Sylveon
  "tk-xy-sy-1":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-001-fletchling.png",
  "tk-xy-sy-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-011-snubbull.jpg",
  "tk-xy-sy-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-013-eevee.jpg",
  "tk-xy-sy-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-014-granbull.jpg",
  "tk-xy-sy-15":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-015-sylveon.jpg",
  "tk-xy-sy-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-016-furfrou.jpg",
  "tk-xy-sy-19":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-019-fletchling.jpg",
  "tk-xy-sy-21":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-021-eevee.jpg",
  "tk-xy-sy-22":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-022-furfrou.jpg",
  "tk-xy-sy-27":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-027-snubbull.jpg",
  "tk-xy-sy-29":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-029-granbull.jpg",
  "tk-xy-sy-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK6B-030-sylveon.jpg",
  // Wigglytuff
  "tk-xy-w-1":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-001-swirlix.png",
  "tk-xy-w-2":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-002-pidgeotto.jpg",
  "tk-xy-w-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-004-sentret.jpg",
  "tk-xy-w-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-011-pidgey.jpg",
  "tk-xy-w-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-012-jigglypuff.jpg",
  "tk-xy-w-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-013-clefairy.jpg",
  "tk-xy-w-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-014-wigglytuff.jpg",
  "tk-xy-w-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-016-clefable.jpg",
  "tk-xy-w-18":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-018-swirlix.jpg",
  "tk-xy-w-19":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-019-clefairy.jpg",
  "tk-xy-w-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-023-pidgeotto.jpg",
  "tk-xy-w-25":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-025-jigglypuff.jpg",
  "tk-xy-w-28":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-028-clefable.jpg",
  "tk-xy-w-29":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-029-pidgey.jpg",
  "tk-xy-w-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7B-030-wigglytuff.jpg",
  // Bisharp
  "tk-xy-b-1":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-001-fletchling.png",
  "tk-xy-b-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-004-vigoroth.jpg",
  "tk-xy-b-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-011-honedge.jpg",
  "tk-xy-b-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-012-bidoof.jpg",
  "tk-xy-b-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-013-pawniard.jpg",
  "tk-xy-b-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-014-doublade.jpg",
  "tk-xy-b-15":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-015-slakoth.jpg",
  "tk-xy-b-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-016-bisharp.jpg",
  "tk-xy-b-17":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-017-patrat.jpg",
  "tk-xy-b-21":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-021-pawniard.jpg",
  "tk-xy-b-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-023-doublade.jpg",
  "tk-xy-b-26":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-026-slakoth.jpg",
  "tk-xy-b-27":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-027-honedge.jpg",
  "tk-xy-b-28":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-028-vigoroth.jpg",
  "tk-xy-b-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK7A-030-bisharp.jpg",
  // Latios
  "tk-xy-latio-1":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-001-skitty.png",
  "tk-xy-latio-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-004-rhydon.jpg",
  "tk-xy-latio-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-011-machop.jpg",
  "tk-xy-latio-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-012-solrock.jpg",
  "tk-xy-latio-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-013-latios.jpg",
  "tk-xy-latio-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-014-machoke.jpg",
  "tk-xy-latio-15":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-015-rhyhorn.jpg",
  "tk-xy-latio-19":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-019-delcatty.jpg",
  "tk-xy-latio-22":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-022-machoke.jpg",
  "tk-xy-latio-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-023-rhyhorn.jpg",
  "tk-xy-latio-24":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-024-delcatty.jpg",
  "tk-xy-latio-25":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-025-rhydon.jpg",
  "tk-xy-latio-26":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-026-solrock.jpg",
  "tk-xy-latio-27":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-027-skitty.jpg",
  "tk-xy-latio-28":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-028-machop.jpg",
  "tk-xy-latio-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8A-030-latios.jpg",
  // Latias
  "tk-xy-latia-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-004-fletchling.jpg",
  "tk-xy-latia-6":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-006-lombre.jpg",
  "tk-xy-latia-7":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-007-treecko.jpg",
  "tk-xy-latia-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-011-lotad.jpg",
  "tk-xy-latia-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-012-tangrowth.jpg",
  "tk-xy-latia-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-013-tangela.jpg",
  "tk-xy-latia-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-014-latias.jpg",
  "tk-xy-latia-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-016-surskit.jpg",
  "tk-xy-latia-18":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-018-grovyle.jpg",
  "tk-xy-latia-21":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-021-lombre.jpg",
  "tk-xy-latia-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-023-lotad.jpg",
  "tk-xy-latia-24":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-024-treecko.jpg",
  "tk-xy-latia-25":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-025-tangrowth.jpg",
  "tk-xy-latia-26":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-026-tangela.jpg",
  "tk-xy-latia-27":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-027-grovyle.jpg",
  "tk-xy-latia-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK8B-030-latias.jpg",
  // Pikachu Libre
  "tk-xy-p-1":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-001-glameow.png",
  "tk-xy-p-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-004-electivire.jpg",
  "tk-xy-p-7":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-007-taillow.jpg",
  "tk-xy-p-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-011-electrike.jpg",
  "tk-xy-p-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-012-blitzle.jpg",
  "tk-xy-p-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-013-manectric.jpg",
  "tk-xy-p-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-014-pikachu_libre.jpg",
  "tk-xy-p-15":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-015-electabuzz.jpg",
  "tk-xy-p-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-016-fletchling.jpg",
  "tk-xy-p-19":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-019-purugly.jpg",
  "tk-xy-p-22":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-022-manectric.jpg",
  "tk-xy-p-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-023-electabuzz.jpg",
  "tk-xy-p-24":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-024-purugly.jpg",
  "tk-xy-p-25":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-025-electivire.jpg",
  "tk-xy-p-26":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-026-blitzle.jpg",
  "tk-xy-p-27":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-027-glameow.jpg",
  "tk-xy-p-28":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-028-electrike.jpg",
  "tk-xy-p-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9A-030-pikachu_libre.jpg",
  // Suicune
  "tk-xy-su-4":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-004-eevee.jpg",
  "tk-xy-su-6":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-006-frogadier.jpg",
  "tk-xy-su-7":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-007-ducklett.jpg",
  "tk-xy-su-11":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-011-froakie.jpg",
  "tk-xy-su-12":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-012-seaking.jpg",
  "tk-xy-su-13":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-013-goldeen.jpg",
  "tk-xy-su-14":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-014-suicune.jpg",
  "tk-xy-su-16":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-016-piplup.jpg",
  "tk-xy-su-18":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-018-swanna.jpg",
  "tk-xy-su-21":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-021-frogadier.jpg",
  "tk-xy-su-23":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-023-froakie.jpg",
  "tk-xy-su-24":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-024-ducklett.jpg",
  "tk-xy-su-25":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-025-seaking.jpg",
  "tk-xy-su-26":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-026-goldeen.jpg",
  "tk-xy-su-27":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-027-swanna.jpg",
  "tk-xy-su-30":
    "https://pkmncards.com/wp-content/uploads/en_US-TK9B-030-suicune.jpg",
  "miscp-001":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/108589.jpg",
  "cel25-25":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/250295.jpg",
  "sm3.5-40":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/146699.jpg",
  "mep-105":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/713288.jpg",
  "cel25cc-CC013":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/250330.jpg",
  "swsh12.5gg-GG10":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/478027.jpg",
  "swsh11tg-TG30":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/284303.jpg",
  "smp-SM228":
    "https://assets.pokemon.com/assets/cms2/img/cards/web/SMP/SMP_EN_SM228.png",
  "30th-B":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/717609.jpg",
  "30th-G":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/717608.jpg",
  "30th-R":
    "https://product-images.tcgplayer.com/fit-in/1000x1000/717607.jpg",
  "B2a-130":
    "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2a/B2a_130_EN.png",
  "B2a-131":
    "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2a/B2a_131_EN.png",
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
  artistCards: [],
  artistRequest: 0,
  artistLoading: false,
  cardSeries: [],
  cardSets: [],
  catalogSeries: "all",
  catalogSet: "all",
  catalogView: "pokemon",
  catalogCards: [],
  catalogVisible: PAGE_SIZE,
  catalogLoading: false,
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
  rarityCards: [],
  rarityLoading: false,
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
  cardOwnedVariants: saved.cardOwnedVariants || {},
  trackedSeries: new Set(saved.trackedSeries || []),
  trackedSets: new Set(saved.trackedSets || []),
  completionMode: saved.completionMode === "master" ? "master" : "set",
  completionSetDetails: new Map(),
  completionDetailsLoading: new Set(),
  settings: {
    dark: false,
    language: "en",
    shiny: false,
    hidePocket: false,
    ...saved.settings,
    valuationCurrency: normalizeValuationCurrency(
      saved.settings?.valuationCurrency,
    ),
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
const catalogViewToggle = document.querySelector("#catalogViewToggle");
const catalogCardGrid = document.querySelector("#catalogCardGrid");
const cardDialog = document.querySelector("#cardLightbox");
const collectionDialog = document.querySelector("#collectionDialog");
const collectionSearch = document.querySelector("#collectionSearch");
const collectionFilters = document.querySelector("#collectionFilters");
const collectionCardGrid = document.querySelector("#collectionCardGrid");

const words = {
  en: {
    about: "About",
    completeCompanion: "Your Pokémon card collection",
    heroTitle: "Every Pokémon.<br><em>Every card.</em>",
    heroDescription:
      "Explore the full Pokédex, then open any Pokémon to discover its trading cards across every era.",
    popular: "Popular",
    nationalPokedex: "National Pokédex",
    cardCatalog: "Card catalogue",
    choosePokemon: "Choose your Pokémon",
    pokemonFound: "Pokémon found",
    cardsFound: "Cards found",
    filteredCards: "Filtered cards",
    cardsInSet: "Cards in {name}",
    showSetCards: "Show cards",
    showSetPokemon: "Show Pokémon",
    loadingSetCards: "Loading cards from this set…",
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
      "PokéCardCollector brings the National Pokédex and decades of Pokémon card artwork into one calm, searchable collection.",
    footer:
      "Data from PokéAPI and TCGdex. Pokémon and Pokémon character names are trademarks of Nintendo.",
    myCollection: "My collection",
    collectionNav: "Collection",
    collectionTabsLabel: "Collection sections",
    collectionCardsTab: "Cards",
    collectionValuesTab: "Value",
    collectionFavoritesTab: "Favorites",
    collectionOverview: "Collection overview",
    valuesAndBackup: "Values & backup",
    collectionValues: "Collection values",
    backup: "Backup",
    backupTitle: "Backup & restore",
    completionTab: "Goals",
    completionKicker: "Completion goals",
    completionTitle: "Sets & series",
    completionScope: "Includes secret cards",
    track: "Track",
    untrack: "Stop tracking",
    completionEmpty: "Choose a set or series to start tracking completion.",
    completionLoading: "Loading set catalogue…",
    completionOwned: "{owned} of {total} cards",
    completionPrintings: "{owned} of {total} printings",
    completionMode: "Completion mode",
    completionSetMode: "Any printing",
    completionMasterMode: "Every known printing",
    completionMasterScope:
      "Normal, holo, reverse holo & First Edition where catalogued",
    primaryPrint: "Primary printing",
    ownedPrintings: "Owned printings",
    exportBackup: "Export backup",
    backupExportSaved: "Backup saved.",
    backupImported: "Backup imported. Your collection has been restored.",
    backupExportCancelled: "Export cancelled.",
    backupExportFailed: "The backup could not be saved. Try again, or copy your collection string.",
    importBackup: "Import backup",
    collectionStringTitle: "Collection import string",
    collectionStringIntro: "Copy a complete local backup as text, or paste one to replace this device's collection.",
    copyCollectionString: "Copy collection string",
    restoreCollectionString: "Restore pasted string",
    collectionStringPlaceholder: "Paste a CDXC1 collection string",
    collectionStringCopied: "Collection string copied.",
    collectionStringReady: "Collection string ready to copy.",
    collectionStringImported: "Collection restored from import string.",
    collectionCurrency: "Value currency",
    marketCurrencies: "Market currencies (EUR/USD)",
    danishKroner: "Danish kroner (DKK)",
    ecbReferenceRate: "ECB reference rates · {date}",
    cardChecklist: "Card checklist",
    savedCards: "Collected cards",
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
    invalidBackup: "This is not a valid PokéCardCollector backup.",
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
      "Photograph one card at a time. Take several photos in one camera session, then scan the queue.",
    takePhoto: "Take photo",
    scannerCameraTitle: "Photograph cards",
    scannerCameraDone: "Done",
    scannerCameraHint: "One card per photo. Avoid glare and hold steady.",
    scannerCameraStarting: "Opening camera…",
    scannerCameraCount: "{count} photos queued. Take another or tap Done.",
    scannerCameraUnavailable: "Camera unavailable. Allow camera access in app/browser settings, or tap Done and Choose photo.",
    scannerCameraCaptureFailed: "Photo could not be captured. Try again.",
    scannerCurrentPhoto: "Photo {photo} of {photos}",
    scannerReadingSection: "Reading text · section {part}/4 · {progress}%",
    scannerRetryReading: "Rechecking text… {progress}%",
    scannerEngineLoading: "Loading recognition engine… {progress}%",
    scannerPhotoComplete: "Photo scanned",
    scannerNativeReading: "Reading card text on this device…",
    scannerNativeFooter: "Checking the collector number…",
    scannerNativeReadComplete: "Card text read",
    scannerBrowserName: "Reading the card name… {progress}%",
    scannerBrowserNumber: "Reading the collector number… {progress}%",
    scannerManualLabel: "Correct name and number",
    scannerManualName: "Card name",
    scannerManualNumber: "Collector number (optional)",
    scannerManualNumberHint: "Near a bottom corner, for example 061/086. Include /total to narrow the printing. Promo letters work too.",
    scannerManualNumberInvalid: "Use the printed number, for example 061, 061/086 or SWSH119. Put the card name in the name field.",
    scannerManualPending: "Changes not searched yet. Earlier suggestions are unchanged.",
    scannerPrintingMatched: "Printing matched",
    scannerPrintingMatchedHint: "Name and number agree. Check the picture and set before adding.",
    scannerPrintingName: "Name found — choose printing",
    scannerPrintingNameHint: "The number was not read reliably. The first picture is only a suggestion.",
    scannerPrintingNumber: "Number found — check card",
    scannerPrintingNumberHint: "Confirm the card name, picture and set before including it.",
    scannerPrintingCheck: "Printing needs checking",
    scannerPrintingCheckHint: "Choose the pictured printing or correct the name and number below.",
    scannerPrintingChoose: "Choose printing",
    scannerPrintingChooseHint: "Compare the pictures, set and number. Choose one, then tick Include.",
    scannerPrintingSearch: "Search results — choose printing",
    scannerPrintingUnknown: "Card not identified",
    scannerManualSearch: "Search cards",
    scannerNumberFallback: "Suggestions found using the collector number. Check the artwork and set before including a card.",
    scannerNumberConflict: "The name and scanned number disagree. Suggestions keep the recognized Pokémon; check the pictured card and printed number.",
    scannerNumberUncertain: "Some collector digits were unclear. Check the pictured card, set and number before including it.",
    scannerManualNameRequired: "Enter the card name. Use the separate number field to narrow the printing.",
    scannerManualFound: "Suggestions: {count}. Choose a picture, then tick Include.",
    scannerManualSameResults: "Search complete. Suggestions unchanged: {count}. Change the name or number to narrow the search.",
    scannerManualNoResults: "No cards match that name and number. Check both or try the name alone. Earlier suggestions are unchanged.",
    scannerManualFailed: "Catalogue search failed. Check your internet connection and try again. Earlier suggestions are unchanged.",
    scannerManualTimeout: "Catalogue search took too long. Try again. Earlier suggestions are unchanged.",
    scannerScanAgain: "Scan again",
    scannerRecheckingPhoto: "Rechecking photo {photo} · focused name and number",
    scannerRecheckAgreed: "Name and number agree with the earlier scan. Still check the artwork and set.",
    scannerRecheckChanged: "Results differ. Your earlier selection is kept; compare the pictures and choose.",
    scannerRecheckUnreadable: "No clearer result. Earlier suggestions are kept; correct the name or number below.",
    scannerRecheckFailed: "Recheck unavailable or timed out. Earlier suggestions are kept. Try again.",
    scannerNoReliableMatch: "No reliable match yet. Scan again or enter the card name and number below.",
    scannerNativePrivacy: "Photos and text recognition are processed on this device. Identified card names are sent to the catalogue for matching. Google ML Kit may send SDK usage and performance metrics to Google, not your photos or full recognized text.",
    scannerFastComparing: "Checking shortlisted cards… {done}/{total}",
    scannerTimedOut: "Scanning took too long. Your photos are kept. Try a sharper photo or use manual search.",
    scannerTipsTitle: "Before scanning",
    scannerTips: "Avoid glare and flash. Use soft, even light, hold the phone steady and directly above the cards, and keep every name and collector number sharp and visible.",
    scannerBatchIntro: "Take one photo per physical card. Tap Done to leave the camera, then Scan queued photos and review the proposed matches.",
    scannerGridOption: "{columns} × {rows} · {count} card slots",
    scannerBatchStart: "Scan queued photos",
    scannerBatchClear: "Clear photos",
    scannerBatchCancelled: "Scan cancelled. Your queued photos are kept; reopen the scanner to try again.",
    scannerBatchSummary: "Photos: {photos}. Add more photos or scan when ready.",
    scannerLayoutUnclear: "Layout unclear",
    scannerLayoutUnclearHint: "The layout was not clear. This suggestion is unchecked; there may be other cards in the photo. Retake it with clear gaps and all card edges visible.",
    scannerPhotoLabel: "Photo {photo} · {layout}",
    scannerPhotoRemove: "Remove",
    scannerBatchLimit: "Add up to 20 photos per batch. Scan these before adding more.",
    scannerBatchProgress: "Photo {photo}/{photos} · card {card}/{cards}",
    scannerBatchFailed: "{count} photo(s) could not be read. Retake or choose those photos again.",
    scannerGlareWarning: "Possible glare: move the light or angle slightly and avoid flash if text is washed out.",
    scannerBlurWarning: "Possibly blurry: hold steady, move closer, and wait for a sharp preview before photographing.",
    scannerBatchReview: "Review proposed cards",
    scannerBatchReviewInfo: "{photos} photos · Printing matches: {matched} · To check: {review}. Confirm your choices before adding.",
    choosePicture: "Choose photo",
    scanBinderPhoto: "Add group photo",
    chooseBinderPhoto: "Choose group photos",
    binderLayout: "Columns × rows in the next photo",
    binderPreparing: "Preparing the queued photos…",
    binderScanning: "Scanning binder card {done}/{total}…",
    binderReview: "Review binder page",
    binderFound: "{found} of {total} slots matched",
    binderInclude: "Include",
    binderNoMatch: "No reliable match. Retake this card closer, sharper and without glare.",
    binderAddSelected: "Add selected cards",
    binderAdded: "Added {count} cards to your collection.",
    scannerPrivacy:
      "Photos and text recognition stay on this device. Card names and numbers are sent to the catalogue for matching. The browser downloads its OCR engine and model when first used.",
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
    completeCompanion: "Din Pokémon-kortsamling",
    heroTitle: "Alle Pokémon.<br><em>Alle kort.</em>",
    heroDescription:
      "Udforsk hele Pokédexet, og åbn derefter en Pokémon for at se dens samlekort fra alle tidsperioder.",
    popular: "Populære",
    nationalPokedex: "Nationalt Pokédex",
    cardCatalog: "Kortkatalog",
    choosePokemon: "Vælg din Pokémon",
    pokemonFound: "Pokémon fundet",
    cardsFound: "Kort fundet",
    filteredCards: "Filtrerede kort",
    cardsInSet: "Kort i {name}",
    showSetCards: "Vis kort",
    showSetPokemon: "Vis Pokémon",
    loadingSetCards: "Indlæser kort fra dette sæt…",
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
      "PokéCardCollector samler det nationale Pokédex og årtiers Pokémon-kortkunst i én rolig og søgbar samling.",
    footer:
      "Data fra PokéAPI og TCGdex. Pokémon og navnene på Pokémon-figurer er varemærker tilhørende Nintendo.",
    myCollection: "Min samling",
    collectionNav: "Samling",
    collectionTabsLabel: "Sektioner i samlingen",
    collectionCardsTab: "Kort",
    collectionValuesTab: "Værdi",
    collectionFavoritesTab: "Favoritter",
    collectionOverview: "Samlingsoversigt",
    valuesAndBackup: "Værdier og sikkerhedskopi",
    collectionValues: "Samlingens værdi",
    backup: "Sikkerhedskopi",
    backupTitle: "Sikkerhedskopi og gendannelse",
    completionTab: "Mål",
    completionKicker: "Samlingsmål",
    completionTitle: "Sæt og serier",
    completionScope: "Inkluderer hemmelige kort",
    track: "Følg",
    untrack: "Stop med at følge",
    completionEmpty: "Vælg et sæt eller en serie for at følge din fremgang.",
    completionLoading: "Indlæser sætkatalog…",
    completionOwned: "{owned} af {total} kort",
    completionPrintings: "{owned} af {total} tryk",
    completionMode: "Fuldførelsestype",
    completionSetMode: "Et hvilket som helst tryk",
    completionMasterMode: "Alle kendte tryk",
    completionMasterScope:
      "Normal, holo, omvendt holo og første udgave, hvor de er katalogiseret",
    primaryPrint: "Primært tryk",
    ownedPrintings: "Ejede tryk",
    exportBackup: "Eksportér sikkerhedskopi",
    backupExportSaved: "Sikkerhedskopien er gemt.",
    backupImported: "Sikkerhedskopien er importeret. Din samling er gendannet.",
    backupExportCancelled: "Eksporten blev annulleret.",
    backupExportFailed: "Sikkerhedskopien kunne ikke gemmes. Prøv igen, eller kopiér din samlingsstreng.",
    importBackup: "Importér sikkerhedskopi",
    collectionStringTitle: "Importstreng til samling",
    collectionStringIntro: "Kopiér en komplet lokal sikkerhedskopi som tekst, eller indsæt en for at erstatte samlingen på denne enhed.",
    copyCollectionString: "Kopiér samlingsstreng",
    restoreCollectionString: "Gendan indsat streng",
    collectionStringPlaceholder: "Indsæt en CDXC1-samlingsstreng",
    collectionStringCopied: "Samlingsstrengen er kopieret.",
    collectionStringReady: "Samlingsstrengen er klar til kopiering.",
    collectionStringImported: "Samlingen er gendannet fra importstrengen.",
    collectionCurrency: "Værdier i",
    marketCurrencies: "Markedsvalutaer (EUR/USD)",
    danishKroner: "Danske kroner (DKK)",
    ecbReferenceRate: "ECB-referencekurser · {date}",
    cardChecklist: "Kortoversigt",
    savedCards: "Samlede kort",
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
    invalidBackup: "Dette er ikke en gyldig PokéCardCollector-sikkerhedskopi.",
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
      "Fotografér ét kort ad gangen. Tag flere billeder i samme kamerasession, og scan derefter køen.",
    takePhoto: "Tag et billede",
    scannerCameraTitle: "Fotografér kort",
    scannerCameraDone: "Færdig",
    scannerCameraHint: "Ét kort pr. billede. Undgå genskin, og hold stille.",
    scannerCameraStarting: "Åbner kameraet…",
    scannerCameraCount: "{count} billeder i køen. Tag et mere, eller tryk Færdig.",
    scannerCameraUnavailable: "Kameraet er ikke tilgængeligt. Tillad kameraadgang i appens/browserens indstillinger, eller tryk Færdig og Vælg billede.",
    scannerCameraCaptureFailed: "Billedet kunne ikke tages. Prøv igen.",
    scannerCurrentPhoto: "Billede {photo} af {photos}",
    scannerReadingSection: "Læser tekst · del {part}/4 · {progress}%",
    scannerRetryReading: "Kontrollerer teksten igen… {progress}%",
    scannerEngineLoading: "Indlæser tekstgenkendelse… {progress}%",
    scannerPhotoComplete: "Billedet er scannet",
    scannerNativeReading: "Læser korttekst på denne enhed…",
    scannerNativeFooter: "Kontrollerer samlernummeret…",
    scannerNativeReadComplete: "Kortteksten er læst",
    scannerBrowserName: "Læser kortnavnet… {progress}%",
    scannerBrowserNumber: "Læser samlernummeret… {progress}%",
    scannerManualLabel: "Ret navn og nummer",
    scannerManualName: "Kortnavn",
    scannerManualNumber: "Samlernummer (valgfrit)",
    scannerManualNumberHint: "Ved et af de nederste hjørner, for eksempel 061/086. Medtag /total for at afgrænse udgaven. Promobogstaver virker også.",
    scannerManualNumberInvalid: "Brug det trykte nummer, for eksempel 061, 061/086 eller SWSH119. Skriv kortnavnet i navnefeltet.",
    scannerManualPending: "Ændringerne er ikke søgt endnu. Tidligere forslag er uændrede.",
    scannerPrintingMatched: "Kortudgave matchet",
    scannerPrintingMatchedHint: "Navn og nummer stemmer. Kontrollér billede og sæt, før du tilføjer.",
    scannerPrintingName: "Navn fundet — vælg kortudgave",
    scannerPrintingNameHint: "Nummeret blev ikke læst sikkert. Det første billede er kun et forslag.",
    scannerPrintingNumber: "Nummer fundet — kontrollér kort",
    scannerPrintingNumberHint: "Bekræft kortnavn, billede og sæt, før du medtager kortet.",
    scannerPrintingCheck: "Kontrollér kortudgaven",
    scannerPrintingCheckHint: "Vælg kortudgaven på billederne, eller ret navn og nummer nedenfor.",
    scannerPrintingChoose: "Vælg kortudgave",
    scannerPrintingChooseHint: "Sammenlign billeder, sæt og nummer. Vælg et kort, og markér Medtag.",
    scannerPrintingSearch: "Søgeresultater — vælg kortudgave",
    scannerPrintingUnknown: "Kortet blev ikke identificeret",
    scannerManualSearch: "Søg efter kort",
    scannerNumberFallback: "Forslag fundet via samlernummeret. Kontrollér motiv og sæt, før du medtager et kort.",
    scannerNumberConflict: "Navnet og det læste nummer stemmer ikke overens. Forslagene bevarer den genkendte Pokémon; kontrollér kortbillede og trykt nummer.",
    scannerNumberUncertain: "Nogle cifre i samlernummeret var uklare. Kontrollér kortbillede, sæt og nummer, før du medtager kortet.",
    scannerManualNameRequired: "Indtast kortnavnet. Brug det separate nummerfelt til at afgrænse kortudgaven.",
    scannerManualFound: "Fandt {count} forslag. Vælg et kortbillede, og markér Medtag.",
    scannerManualSameResults: "Søgningen er færdig: de samme {count} forslag. Ret navn eller nummer for at afgrænse søgningen.",
    scannerManualNoResults: "Ingen kort matcher navn og nummer. Kontrollér begge, eller prøv kun navnet. Tidligere forslag er uændrede.",
    scannerManualFailed: "Katalogsøgningen mislykkedes. Kontrollér internetforbindelsen, og prøv igen. Tidligere forslag er uændrede.",
    scannerManualTimeout: "Katalogsøgningen tog for lang tid. Prøv igen. Tidligere forslag er uændrede.",
    scannerScanAgain: "Scan igen",
    scannerRecheckingPhoto: "Kontrollerer billede {photo} · fokuseret navn og nummer",
    scannerRecheckAgreed: "Navn og nummer stemmer med den tidligere scanning. Kontrollér stadig motiv og sæt.",
    scannerRecheckChanged: "Resultaterne er forskellige. Dit tidligere valg er bevaret; sammenlign billederne, og vælg.",
    scannerRecheckUnreadable: "Intet tydeligere resultat. Tidligere forslag er bevaret; ret navn eller nummer nedenfor.",
    scannerRecheckFailed: "Kontrollen er utilgængelig eller tog for lang tid. Tidligere forslag er bevaret. Prøv igen.",
    scannerNoReliableMatch: "Intet sikkert match endnu. Scan igen, eller indtast kortets navn og nummer nedenfor.",
    scannerNativePrivacy: "Billeder og tekstgenkendelse behandles på denne enhed. Identificerede kortnavne sendes til kataloget for at finde matches. Google ML Kit kan sende SDK-brugs- og ydelsesmålinger til Google, men ikke dine billeder eller den fulde genkendte tekst.",
    scannerFastComparing: "Kontrollerer udvalgte kort… {done}/{total}",
    scannerTimedOut: "Scanningen tog for lang tid. Dine billeder er bevaret. Prøv et skarpere billede eller manuel søgning.",
    scannerTipsTitle: "Før scanning",
    scannerTips: "Undgå genskin og blitz. Brug blødt, jævnt lys, hold telefonen stille og lige over kortene, og sørg for skarpe, synlige navne og samlernumre.",
    scannerBatchIntro: "Tag ét billede pr. fysisk kort. Tryk Færdig for at lukke kameraet, og scan derefter køen og gennemgå forslagene.",
    scannerGridOption: "{columns} × {rows} · {count} kortpladser",
    scannerBatchStart: "Scan tilføjede billeder",
    scannerBatchClear: "Ryd billeder",
    scannerBatchCancelled: "Scanningen er annulleret. Dine billeder er gemt i køen; åbn scanneren igen for at prøve på ny.",
    scannerBatchSummary: "Billeder: {photos}. Tilføj flere billeder, eller scan, når du er klar.",
    scannerLayoutUnclear: "Uklart layout",
    scannerLayoutUnclearHint: "Layoutet var uklart. Dette forslag er ikke markeret; billedet kan indeholde flere kort. Tag det igen med tydelige mellemrum og alle kortkanter synlige.",
    scannerPhotoLabel: "Billede {photo} · {layout}",
    scannerPhotoRemove: "Fjern",
    scannerBatchLimit: "Tilføj højst 20 billeder ad gangen. Scan dem, før du tilføjer flere.",
    scannerBatchProgress: "Billede {photo}/{photos} · kort {card}/{cards}",
    scannerBatchFailed: "{count} billede(r) kunne ikke læses. Tag dem igen, eller vælg billederne igen.",
    scannerGlareWarning: "Muligt genskin: flyt lyset eller vinklen lidt, og undgå blitz, hvis teksten er udvisket.",
    scannerBlurWarning: "Muligt uskarpt billede: hold telefonen stille, gå tættere på, og vent på et skarpt kamerabillede før optagelsen.",
    scannerBatchReview: "Gennemgå foreslåede kort",
    scannerBatchReviewInfo: "{photos} billeder · Matchede udgaver: {matched} · Skal kontrolleres: {review}. Bekræft dine valg, før du tilføjer.",
    choosePicture: "Vælg billede",
    scanBinderPhoto: "Tilføj gruppebillede",
    chooseBinderPhoto: "Vælg gruppebilleder",
    binderLayout: "Kolonner × rækker i næste billede",
    binderPreparing: "Forbereder de tilføjede billeder…",
    binderScanning: "Scanner kort {done}/{total} fra mappen…",
    binderReview: "Gennemgå mappe-side",
    binderFound: "{found} af {total} pladser matchet",
    binderInclude: "Medtag",
    binderNoMatch: "Intet sikkert match. Tag kortet igen tættere på, skarpere og uden genskin.",
    binderAddSelected: "Føj valgte kort til samlingen",
    binderAdded: "Føjede {count} kort til din samling.",
    scannerPrivacy:
      "Billeder og tekstgenkendelse bliver på denne enhed. Kortnavne og numre sendes til kataloget for at finde matches. Browseren henter OCR-motor og model ved første brug.",
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
  const snapshot = {
    version: 6,
    favorites: [...state.favorites],
    cardStates: state.cardStates,
    cardCounts: state.cardCounts,
    cardPrintVariants: state.cardPrintVariants,
    cardOwnedVariants: state.cardOwnedVariants,
    trackedSeries: [...state.trackedSeries],
    trackedSets: [...state.trackedSets],
    completionMode: state.completionMode,
    settings: state.settings,
  };
  localStorage.setItem(
    "cardedex-user",
    JSON.stringify(snapshot),
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
