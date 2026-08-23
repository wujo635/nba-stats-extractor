'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsv, stringifyCsvRow } = require('./lib/csv');
const { normalizeName } = require('./lib/normalize');
const { loadSourceIndex, computeField } = require('./lib/fieldExtraction');
const { loadCareerInfoRecords } = require('./lib/careerInfo');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BASELINE_PATH = path.join(DATA_DIR, 'baseline', 'nba-players.csv');
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
  const records = loadCareerInfoRecords(DATA_DIR);
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
// Main
// ---------------------------------------------------------------------------
function main() {
  const { metaLines, header, playerRows } = loadBaseline();
  const careerIndex = loadCareerIndex();
  const enabledFields = CONFIG.fields.filter((f) => f.enabled);
  const sourceFiles = [...new Set(enabledFields.map((f) => f.source))];
  const sourceIndexes = new Map(sourceFiles.map((f) => [f, loadSourceIndex(DATA_DIR, f)]));

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
  const matchReportText = reportLines.join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'match-report.txt'), matchReportText, 'utf8');

  // --- archive a timestamped copy of the changelog + match report so past
  //     runs aren't lost when the "latest" files above get overwritten ---
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historyDir = path.join(OUT_DIR, 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(path.join(historyDir, `${timestamp}-changelog.csv`), changelogText, 'utf8');
  fs.writeFileSync(path.join(historyDir, `${timestamp}-match-report.txt`), matchReportText, 'utf8');

  console.log(`Wrote out/nba-players.csv (${playerRows.length} players)`);
  console.log(`Wrote out/changelog.csv (${changelog.length} changes)`);
  console.log(
    `Wrote out/match-report.txt (${matchReport.unmatched.length} unmatched, ${matchReport.ambiguous.length} ambiguous)`
  );
  console.log(`Archived this run to out/history/${timestamp}-*`);
}

main();
