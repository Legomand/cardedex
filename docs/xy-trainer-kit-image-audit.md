# XY Trainer Kit image audit

Checked on 2026-10-15. All 120 Pokémon card entries across the eight English XY Trainer Kit half decks were compared with the TCGdex set/card records and PkmnCards scans. The Pokémon names, printed numbers, and kit symbols on the replacement scans were visually checked. All 120 replacement images were downloaded successfully and decoded.

The image archive returns unrelated XY Base Set cards for many kit IDs, including both Rhyhorn entries. It also reuses some scans of the correct Pokémon with a different printed number (for example, Pikachu Libre kit Manectric #22 shows #13). Each Pokémon entry now has an explicit verified scan override; image recovery excludes the faulty archive URL for those entries.

| Half deck | Pokémon entries | Reference gallery |
| --- | ---: | --- |
| Noivern | 12 | [Scans](https://pkmncards.com/set/xy-trainer-kit-noivern/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-n) |
| Sylveon | 12 | [Scans](https://pkmncards.com/set/xy-trainer-kit-sylveon/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-sy) |
| Wigglytuff | 15 | [Scans](https://pkmncards.com/set/xy-trainer-kit-wigglytuff/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-w) |
| Bisharp | 15 | [Scans](https://pkmncards.com/set/xy-trainer-kit-bisharp/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-b) |
| Latios | 16 | [Scans](https://pkmncards.com/set/xy-trainer-kit-latios/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-latio) |
| Latias | 16 | [Scans](https://pkmncards.com/set/xy-trainer-kit-latias/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-latia) |
| Pikachu Libre | 18 | [Scans](https://pkmncards.com/set/xy-trainer-kit-pikachu-libre/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-p) |
| Suicune | 16 | [Scans](https://pkmncards.com/set/xy-trainer-kit-suicune/), [catalogue](https://api.tcgdex.net/v2/en/sets/tk-xy-su) |

Browser shell version: 105. Validation: `npm test`, JavaScript syntax checks, and regression coverage for all 120 image overrides in both thumbnail and detail sizes, including exclusion of the faulty archive during image recovery.

Scope: Pokémon entries only. Trainer and Energy cards, and non-XY Trainer Kits, were not audited.
