'use strict';

const fs = require('fs');
const path = require('path');
const { stringifyCsvRow } = require('./lib/csv');
const { loadSourceIndex, computeField } = require('./lib/fieldExtraction');
const { loadCareerInfoRecords } = require('./lib/careerInfo');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_PATH = path.join(ROOT, 'out', 'all-players', 'nba-players.csv');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'fields.json'), 'utf8'));

// ---------------------------------------------------------------------------
// A player qualifies for this "NBA Players" export if they have at least one
// NBA season, per Player Season Info.csv — independent of which fields happen
// to be enabled in config/fields.json, so toggling fields never changes who's
// included in the output.
// ---------------------------------------------------------------------------
function findNbaPlayerIds() {
  const seasonIndex = loadSourceIndex(DATA_DIR, 'Player Season Info.csv');
  const ids = new Set();
  for (const [playerId, rows] of seasonIndex) {
    if (rows.some((r) => r.lg === 'NBA')) ids.add(playerId);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Some names are shared by more than one NBA player (e.g. two "Patrick
// Ewing"s). Ranker's #primary,Name field needs unique values, so append the
// birth year to every player sharing a name.
// ---------------------------------------------------------------------------
function assignDisplayNames(players) {
  const byName = new Map();
  for (const p of players) {
    if (!byName.has(p.player)) byName.set(p.player, []);
    byName.get(p.player).push(p);
  }
  let collisions = 0;
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    collisions += 1;
    for (const p of group) {
      const year = (p.birth_date || '').slice(0, 4) || '?';
      p.displayName = `${p.player} (${year})`;
    }
  }
  for (const p of players) {
    if (!p.displayName) p.displayName = p.player;
  }
  return collisions;
}

// ---------------------------------------------------------------------------
// Meta header: generated from config/fields.json (no baseline file exists for
// this script), so it always matches whatever fields are currently defined.
// ---------------------------------------------------------------------------
function buildMetaLines() {
  const lines = [`#category,${CONFIG.category}`, `#primary,${CONFIG.primary}`];
  for (const field of CONFIG.fields) lines.push(`#field,${field.name},optional`);
  return lines;
}

function main() {
  const nbaIds = findNbaPlayerIds();
  const allCareerRecords = loadCareerInfoRecords(DATA_DIR);
  const careerRecords = allCareerRecords.filter((r) => nbaIds.has(r.player_id));

  const collisions = assignDisplayNames(careerRecords);
  careerRecords.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const enabledFields = CONFIG.fields.filter((f) => f.enabled);
  const sourceFiles = [...new Set(enabledFields.map((f) => f.source))];
  const sourceIndexes = new Map(sourceFiles.map((f) => [f, loadSourceIndex(DATA_DIR, f)]));

  const header = [CONFIG.primary, ...CONFIG.fields.map((f) => f.name)];
  const outRows = [header];

  for (const r of careerRecords) {
    const row = [r.displayName];
    for (const field of CONFIG.fields) {
      if (!field.enabled) {
        row.push(''); // no baseline to preserve for this script — left blank
        continue;
      }
      row.push(String(computeField(field, r.player_id, sourceIndexes)));
    }
    outRows.push(row);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const outText =
    buildMetaLines().join('\n') + '\n' + outRows.map((r) => stringifyCsvRow(r)).join('\n') + '\n';
  fs.writeFileSync(OUT_PATH, outText, 'utf8');

  console.log(`Career Info players: ${allCareerRecords.length}`);
  console.log(`NBA-qualifying players: ${careerRecords.length}`);
  console.log(`Duplicate-name collisions resolved: ${collisions}`);
  console.log(`Wrote out/all-players/nba-players.csv (${careerRecords.length} players)`);
}

main();
