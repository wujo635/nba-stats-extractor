# NBA Player Stats Project — Handoff Document

## Project Goal

Populate an NBA player CSV (used in a personal ranking app called **Ranker**) with accurate, verified, **NBA-only** career statistics. The CSV has 8 stat fields per player, many of which are empty or contain errors.

---

## Target CSV Format

The CSV has metadata header rows followed by data. Structure:

```
#category,NBA Players
#primary,Name
#field,Championships,optional
#field,Seasons Played,optional
#field,Points,optional
#field,Assists,optional
#field,Rebounds,optional
#field,MVP Awards,optional
#field,All-Star Selections,optional
#field,Finals Appearances,optional
Name,Championships,Seasons Played,Points,Assists,Rebounds,MVP Awards,All-Star Selections,Finals Appearances
Aaron Gordon,,,,,,,,
Allen Iverson,0,14,24368,5624,3394,1,11,1
...
```

- **164 total players** in the roster (NBA 75th Anniversary Team based list)
- **~79 players** currently have some/all stats filled in
- **~85 players** have all fields empty and need to be populated
- Some filled-in players have **known incorrect values** (see "Verified Errors" below)

### Field Definitions (as intended)
- **Championships**: NBA championships won
- **Seasons Played**: Total NBA seasons
- **Points**: Career total NBA points (regular season + playoffs combined, unconfirmed — see Open Questions)
- **Assists**: Career total NBA assists
- **Rebounds**: Career total NBA rebounds
- **MVP Awards**: Career NBA MVP awards won
- **All-Star Selections**: Number of NBA All-Star selections
- **Finals Appearances**: Number of times player appeared in the NBA Finals (not necessarily won)

### Critical Constraint: NBA-Only Data
**All stats must be NBA-only.** Explicitly exclude:
- College/NCAA stats
- ABA (American Basketball Association) stats
- International league stats (EuroLeague, etc.)
- G League / Summer League stats

This was a direct, repeated requirement from the user. One verified error (Billy Cunningham) was found to include ABA stats mixed into NBA totals — this kind of error is the main risk to avoid.

---

## Recommended Data Source

**Kaggle: "NBA Stats (1947-present)"** by sumitrodatta
https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats

Key facts about this dataset:
- Covers three leagues separately: NBA (1950–present), BAA (1947–1949, NBA's direct predecessor), and ABA (1968–1976) — **critically, these are distinguishable by a league column**, which allows filtering to NBA-only (and BAA, which should probably count as NBA since it's the direct predecessor — confirm with user)
- Sourced from Basketball-Reference.com
- Each player has a unique ID tied to their **Basketball-Reference page slug** (as of a 2026 dataset update), which allows precise matching and easy manual spot-verification against Basketball-Reference itself
- Multiple files included: player season-level stats, player career info, team abbreviations
- Season-level stats will need to be **aggregated into career totals** (sum points/assists/rebounds across rows, count distinct seasons) since it's not pre-aggregated to career level

**Not yet downloaded/inspected** — the user has not yet pulled the actual files from Kaggle, so exact column names/structure are unconfirmed. First step for the next agent should be obtaining and inspecting these files.

### Known Gap in This Dataset
Basic box-score datasets like this typically do **not** include:
- Championships won
- MVP Awards
- All-Star Selections
- Finals Appearances

These are award/achievement data, not box-score stats, and will likely require a **second source** — e.g., a separate "NBA MVP winners by year," "NBA champions by year," and "All-Star selections by year" list (Wikipedia has clean tables for all of these). The next agent should plan for a secondary join/lookup for these 4 fields.

---

## What's Been Tried and Why It Didn't Fully Work

1. **`nba_api` Python package** — queries official NBA.com stats endpoints. Installed successfully, but the `PlayerCareerStats` endpoint returned empty/broken JSON responses in this environment (likely blocked/rate-limited by NBA.com's Cloudflare protection). Player search/lookup (`players.get_players()`) worked fine; the stats query endpoint did not.

2. **Ball Don't Lie API** — free tier doesn't have reliable/complete historical data, especially for older/retired players. Not suitable as a sole source.

3. **Manual web search, one player at a time** — this **does work accurately** (Claude can reliably look up and read Basketball-Reference/Wikipedia data for a single named player), but does not scale: verifying ~79-164 players this way requires that many sequential search operations, which is slow, resource-intensive, and error-prone to do without skipping/rushing. This approach produced real, verified corrections (see below) but could not be completed for the full roster in one sitting.

**Conclusion: bulk CSV dataset + local script is the right approach, not live API calls or manual search-per-player.**

---

## Verified Errors Found So Far (Manual Basketball-Reference Verification)

These corrections were manually verified and should be considered ground truth / useful as a spot-check validation set once the new script produces output. Only 17 of the ~79 filled-in players were fully verified before the manual process was paused as impractical to scale.

| Player | Field | Was | Corrected To |
|---|---|---|---|
| Allen Iverson | Assists | 5674 | 5624 |
| Bill Russell | Finals Appearances | 13 | 12 |
| Bill Sharman | Points | 12636 | 12665 |
| Bill Sharman | Assists | 2127 | 2101 |
| Bill Sharman | Rebounds | 2763 | 2779 |
| Bob Cousy | Rebounds | 5441 | 4786 |
| Bob Cousy | Assists | 6949 | 6955 |
| Bob Cousy | MVP Awards | 0 | 1 |
| Bob Pettit | Rebounds | 12851 | 12849 |
| Clyde Drexler | Points | 22895 | 22195 |
| Dave Bing | Rebounds | 2441 | 3420 |
| Dave Bing | All-Star Selections | 5 | 7 |
| Dave Cowens | Points | 17382 | 13516 |
| Dave Cowens | Assists | 3476 | 2910 |
| Dave Cowens | Rebounds | 13192 | 10444 |

**Players fully verified as correct (no changes needed):** Bill Walton, Bob McAdoo, Carmelo Anthony, Charles Barkley, Dave DeBusschere

**Known data-quality issue (not yet corrected):** Billy Cunningham's stats appear to include ABA stats mixed with NBA stats (inflated totals). Needs NBA-only recalculation.

**Players flagged as outdated (active/recent players whose CSV data reflects mid-2024 or earlier, not current):**
- Anthony Davis
- Stephen Curry
- LeBron James
- Damian Lillard
- Chris Paul (also has a large point-total discrepancy: CSV shows 20165, actual is closer to ~22600+ as of 2026)

These active players will need current-as-of-2026 stats once the script is built, not just historically accurate ones.

**~60 remaining "filled-in" players were never checked** and should not be assumed correct.

---

## Open Questions for the Next Agent (or to confirm with user)

1. **Does "Points/Assists/Rebounds" mean regular season only, or regular season + playoffs combined?** This wasn't explicitly settled. The verified corrections above assumed regular-season-only totals matched user's existing correct entries, but this should be double-checked against the Kaggle dataset's structure (it likely has separate regular season and playoff tables).
2. **Should BAA-era stats (1947-1949) count as "NBA"?** The BAA is the NBA's direct legal predecessor. Recommend treating BAA as NBA-eligible, but confirm with user.
3. **Where should Championships/MVP/All-Star/Finals data come from?** Needs a secondary source — Wikipedia tables are clean and reliable for these; consider scraping/hand-compiling these as static reference tables since they change slowly (only need to update yearly).
4. **Matching player names**: the target CSV uses full names like "Kareem Abdul-Jabbar," "Bob McAdoo," etc. Name matching against the Kaggle dataset may have edge cases (suffixes, nicknames, players with common names). Recommend matching on Basketball-Reference slug where possible instead of raw name string.

---

## Suggested Script Scope for Next Agent

1. Ingest the relevant Kaggle CSV(s) (season stats + career info files)
2. Filter to NBA (+ BAA, pending confirmation) rows only, explicitly excluding ABA
3. Aggregate season-level rows to career totals per player (Points, Assists, Rebounds, Seasons Played)
4. Source/join Championships, MVP Awards, All-Star Selections, and Finals Appearances from a secondary reference (likely need to build small static lookup tables from Wikipedia)
5. Match against the user's 164-player roster by name (fallback to fuzzy matching + manual review list for unmatched names)
6. Output a CSV in the exact target format shown above
7. Flag any players not found in the dataset, and any active players whose "current" stats depend on the as-of date
8. Ideally, output a diff/changelog against the user's existing CSV so they can review what changed, similar to the corrections table above

---

## Files Referenced

- User's working CSV: `nba-players.csv` (164 players, Ranker app format)
- Target dataset: https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats (not yet downloaded as of this handoff)
