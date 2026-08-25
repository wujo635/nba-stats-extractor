# nba-stats-extractor

Populates the Ranker `nba-players.csv` roster with NBA-only career stats,
computed from the [Kaggle NBA/ABA/BAA stats dataset](https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats)
in `data/`.

## Usage

Two scripts share the same `config/fields.json`/`config/aliases.json` setup and the same
field-extraction logic (`scripts/lib/fieldExtraction.js`), but serve different purposes:

### `build-roster.js` — fill in a curated roster

```bash
node scripts/build-roster.js
```

Reads `data/baseline/nba-players.csv` (a hand-picked player list, e.g. a Ranker roster you're
already curating) and writes:

- `out/nba-players.csv` — the regenerated roster, same format as the baseline
- `out/changelog.csv` — every value that changed vs. the baseline (`Name,Field,Was,Now`)
- `out/match-report.txt` — roster names that couldn't be matched to a Basketball-Reference `player_id`, or matched more than one
- `out/history/<timestamp>-changelog.csv` and `out/history/<timestamp>-match-report.txt` — a timestamped copy of the above from every run, so past runs aren't lost when the "latest" files get overwritten. Local only (all of `out/` is gitignored).

### `build-all-players.js` — generate the full player universe

```bash
node scripts/build-all-players.js
```

No baseline needed — includes every player with at least one NBA season across the whole
Kaggle dataset (~4,900 players), matched directly by `player_id` (no name-matching step, since
there's no external roster to reconcile against). Writes `out/all-players/nba-players.csv` in
the same Ranker format, with its `#category`/`#primary`/`#field` meta header generated straight
from `config/fields.json`.

A handful of NBA players share a name with another NBA player (e.g. two "Patrick Ewing"s) —
`build-all-players.js` disambiguates by appending each one's birth year, e.g.
`Patrick Ewing (1962)` vs `Patrick Ewing (1984)`.

There's no changelog/match-report/history for this script — there's no baseline to diff against,
and no name-matching ambiguity to report.

## Adjusting which stats get extracted

Edit `config/fields.json`. Each entry controls one output column:

- `enabled: false` — `build-roster.js` leaves the column exactly as it is in the baseline; `build-all-players.js` leaves it blank (used today for `Championships` and `Finals Appearances`, which aren't derivable from this dataset)
- `enabled: true` — recompute the column from a source CSV in `data/` for every player
  - `source` — which CSV file in `data/` to read
  - `leagues` — restrict to these `lg` values (e.g. `["NBA"]`, excludes ABA/BAA)
  - `filter` — additional exact-match column filters (e.g. `{"award": "nba mvp", "winner": "TRUE"}`)
  - `aggregate` — how to combine the matching rows: `sum` (a `column`), `count_distinct` (distinct values of a `column`), `count_rows`, `min`/`max` (a numeric `column`), or `year_ranges` (a `column` of years, collapsed into a display string like `"2001-2005, 2006"`)

To add a new stat, add a new aggregate function in `scripts/lib/aggregates.js` if needed, then add a field entry — both scripts' output columns and meta header (`scripts/lib/schema.js`) are generated directly from this config, so a new field shows up in both automatically.

### When each player was active

Three fields cover this, computed from `Player Totals.csv`'s `season` column:

- `First Season` / `Last Season` — plain numbers. These are the only representation that gets a
  real filter in Ranker (numeric fields get min/max range filters; string fields only get
  exact-match pills). They collapse career gaps into one span — e.g. Michael Jordan's two
  retirements aren't visible in `First Season: 1985` / `Last Season: 2003` alone.
- `Years Played` — a human-readable range string, e.g. Jordan's is `"1985-1993, 1995-1998, 2002-2003"`.
  Accurate about gaps, but not filterable/sortable as a string field in Ranker — it's there for display.

## Name matching

Players are matched to a Basketball-Reference `player_id` (from `data/Player Career Info.csv`)
by normalizing both names (strip accents/punctuation/spacing) and comparing. This resolves most
mismatches automatically (e.g. `Nikola Jokić` vs `Nikola Jokic`, `Karl Anthony-Towns` vs
`Karl-Anthony Towns`).

For the rest — true nickname/alias mismatches, or names matching more than one historical player —
add an explicit override to `config/aliases.json`, keyed by the exact name as it appears in the
baseline roster CSV.

## Known limitation

This dataset has no playoff or Finals/championship data, so:
- `Points` / `Assists` / `Rebounds` / `Seasons Played` are regular-season only
- `Championships` / `Finals Appearances` need a separate source (not yet built) and are left untouched
