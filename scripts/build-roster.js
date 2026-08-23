'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsv, parseCsvObjects, stringifyCsvRow } = require('./lib/csv');
const { normalizeName } = require('./lib/normalize');
const { runAggregate } = require('./lib/aggregates');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BASELINE_PATH = path.join(DATA_DIR, 'baseline', 'nba-players.csv');
const CAREER_INFO_PATH = path.join(DATA_DIR, 'Player Career Info.csv');
const OUT_DIR = path.join(ROOT, 'out');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'fields.json'), 'utf8'));
const ALIASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'aliases.json'), 'utf8'));
delete ALIASES._comment;

// ---------------------------------------------------------------------------
// 1. Load the baseline roster: preserve its "#..." metadata lines verbatim,
//    and parse the header + player rows as CSV.
// ---------------------------------------------------------------------------
function loadBaseline() {
  const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0 || l === '');
  const metaLines = [];
  let splitIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#')) {
      metaLines.push(lines[i]);
      splitIdx = i + 1;
    } else {
      break;
    }
  }
  const csvText = lines.slice(splitIdx).join('\n');
  const rows = parseCsv(csvText);
  const header = rows[0]; // Name,Championships,Seasons Played,...
  const playerRows = rows.slice(1).filter((r) => r.length > 1 || (r[0] && r[0].trim() !== ''));
  return { metaLines, header, playerRows };
}

// ---------------------------------------------------------------------------
// 2. Build a normalized-name -> player_id(s) index from Player Career Info.csv
// ---------------------------------------------------------------------------
function loadCareerIndex() {
  const text = fs.readFileSync(CAREER_INFO_PATH, 'utf8');
  const { records } = parseCsvObjects(text);
  const index = new Map(); // normalized name -> [player_id, ...]
  for (const r of records) {
    const key = normalizeName(r.player);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(r.player_id);
  }
  return index;
}

function resolvePlayerId(name, careerIndex, matchReport) {
  if (ALIASES[name]) return ALIASES[name];
  const key = normalizeName(name);
  const candidates = careerIndex.get(key);
  if (!candidates || candidates.length === 0) {
    matchReport.unmatched.push(name);
    return null;
  }
  if (candidates.length > 1) {
    matchReport.ambiguous.push({ name, candidates });
    return null;
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// 3. Load and index each source CSV referenced by the enabled fields, grouped
//    by player_id, so each field's aggregate only scans its own player's rows.
// ---------------------------------------------------------------------------
function loadSourceIndex(sourceFile) {
  const text = fs.readFileSync(path.join(DATA_DIR, sourceFile), 'utf8');
  const { records } = parseCsvObjects(text);
  const byPlayer = new Map();
  for (const r of records) {
    const id = r.player_id;
    if (!id) continue;
    if (!byPlayer.has(id)) byPlayer.set(id, []);
    byPlayer.get(id).push(r);
  }
  // Season-level stat files (Player Totals, Per Game, etc.) give players traded
  // mid-season BOTH a combined "2TM"/"3TM" row and one row per team for that
  // same season. Keep only the combined row so career sums aren't double-counted.
  if (records.length && 'team' in records[0] && 'season' in records[0]) {
    for (const [id, rows] of byPlayer) {
      const multiTeamSeasons = new Set(
        rows.filter((r) => /^\dTM$/.test(r.team)).map((r) => r.season)
      );
      if (multiTeamSeasons.size === 0) continue;
      byPlayer.set(
        id,
        rows.filter((r) => !(multiTeamSeasons.has(r.season) && !/^\dTM$/.test(r.team)))
      );
    }
  }
  return byPlayer;
}

function recordMatchesFilter(record, filter) {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => record[k] === v);
}

function computeField(field, playerId, sourceIndexes) {
  const byPlayer = sourceIndexes.get(field.source);
  const allRecords = byPlayer.get(playerId) || [];
  const filtered = allRecords.filter((r) => {
    if (field.leagues && !field.leagues.includes(r.lg)) return false;
    if (!recordMatchesFilter(r, field.filter)) return false;
    return true;
  });
  return runAggregate(field.aggregate, filtered, field);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { metaLines, header, playerRows } = loadBaseline();
  const careerIndex = loadCareerIndex();
  const enabledFields = CONFIG.fields.filter((f) => f.enabled);
  const sourceFiles = [...new Set(enabledFields.map((f) => f.source))];
  const sourceIndexes = new Map(sourceFiles.map((f) => [f, loadSourceIndex(f)]));

  const matchReport = { unmatched: [], ambiguous: [] };
  const changelog = [];
  const outRows = [header];

  for (const row of playerRows) {
    const name = row[0];
    const baselineValues = {};
    header.slice(1).forEach((col, i) => (baselineValues[col] = row[i + 1]));

    const playerId = resolvePlayerId(name, careerIndex, matchReport);
    const outRow = [name];

    for (const col of header.slice(1)) {
      const field = CONFIG.fields.find((f) => f.name === col);
      const baselineValue = baselineValues[col] || '';

      if (!field || !field.enabled) {
        // Field not configured for extraction (or disabled) — pass baseline value through untouched.
        outRow.push(baselineValue);
        continue;
      }

      if (!playerId) {
        // Couldn't resolve this player at all — leave existing value, don't guess.
        outRow.push(baselineValue);
        continue;
      }

      const newValue = String(computeField(field, playerId, sourceIndexes));
      outRow.push(newValue);

      if (baselineValue !== '' && baselineValue !== newValue) {
        changelog.push({ name, field: col, was: baselineValue, now: newValue });
      } else if (baselineValue === '' && newValue !== '') {
        changelog.push({ name, field: col, was: '(empty)', now: newValue });
      }
    }
    outRows.push(outRow);
  }

  // --- write output CSV, preserving original metadata header lines ---
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outText =
    metaLines.join('\n') + '\n' + outRows.map((r) => stringifyCsvRow(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'nba-players.csv'), outText, 'utf8');

  // --- write changelog ---
  const changelogText =
    'Name,Field,Was,Now\n' +
    changelog.map((c) => stringifyCsvRow([c.name, c.field, c.was, c.now])).join('\n') +
    (changelog.length ? '\n' : '');
  fs.writeFileSync(path.join(OUT_DIR, 'changelog.csv'), changelogText, 'utf8');

  // --- write match report ---
  const reportLines = [];
  reportLines.push(`Enabled fields: ${enabledFields.map((f) => f.name).join(', ') || '(none)'}`);
  reportLines.push(`Players processed: ${playerRows.length}`);
  reportLines.push(`Changelog entries: ${changelog.length}`);
  reportLines.push('');
  reportLines.push(`Unmatched players (${matchReport.unmatched.length}) — no player_id found, values left as-is:`);
  matchReport.unmatched.forEach((n) => reportLines.push(`  - ${n}`));
  reportLines.push('');
  reportLines.push(`Ambiguous players (${matchReport.ambiguous.length}) — multiple player_id candidates, values left as-is:`);
  matchReport.ambiguous.forEach((a) => reportLines.push(`  - ${a.name}: ${a.candidates.join(', ')}`));
  fs.writeFileSync(path.join(OUT_DIR, 'match-report.txt'), reportLines.join('\n') + '\n', 'utf8');

  console.log(`Wrote out/nba-players.csv (${playerRows.length} players)`);
  console.log(`Wrote out/changelog.csv (${changelog.length} changes)`);
  console.log(
    `Wrote out/match-report.txt (${matchReport.unmatched.length} unmatched, ${matchReport.ambiguous.length} ambiguous)`
  );
}

main();
