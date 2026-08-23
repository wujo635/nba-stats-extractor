# nba-stats-extractor

Populates the Ranker `nba-players.csv` roster with NBA-only career stats,
computed from the [Kaggle NBA/ABA/BAA stats dataset](https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats)
in `data/`.

## Usage

```bash
node scripts/build-roster.js
```

Reads `data/baseline/nba-players.csv` and writes:

- `out/nba-players.csv` — the regenerated roster, same format as the baseline
- `out/changelog.csv` — every value that changed vs. the baseline (`Name,Field,Was,Now`)
- `out/match-report.txt` — roster names that couldn't be matched to a Basketball-Reference `player_id`, or matched more than one
- `out/history/<timestamp>-changelog.csv` and `out/history/<timestamp>-match-report.txt` — a timestamped copy of the above from every run, so past runs aren't lost when the "latest" files get overwritten. Local only (all of `out/` is gitignored).

## Adjusting which stats get extracted

Edit `config/fields.json`. Each entry controls one output column:

- `enabled: false` — leave the column exactly as it is in the baseline (used today for `Championships` and `Finals Appearances`, which aren't derivable from this dataset)
- `enabled: true` — recompute the column from a source CSV in `data/`, overwriting the baseline value
  - `source` — which CSV file in `data/` to read
  - `leagues` — restrict to these `lg` values (e.g. `["NBA"]`, excludes ABA/BAA)
  - `filter` — additional exact-match column filters (e.g. `{"award": "nba mvp", "winner": "TRUE"}`)
  - `aggregate` — how to combine the matching rows: `sum` (a `column`), `count_distinct` (distinct values of a `column`), or `count_rows`

To add a new stat, add a new aggregate function in `scripts/lib/aggregates.js` if needed, then add a field entry.

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
