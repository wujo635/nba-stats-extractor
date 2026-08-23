'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsvObjects } = require('./csv');
const { runAggregate } = require('./aggregates');

/** Load one data/*.csv, grouped by player_id, for use by computeField().
 *  Season-level stat files (Player Totals, Per Game, etc.) give players traded
 *  mid-season BOTH a combined "2TM"/"3TM" row and one row per team for that
 *  same season. Keep only the combined row so career sums aren't double-counted. */
function loadSourceIndex(dataDir, sourceFile) {
  const text = fs.readFileSync(path.join(dataDir, sourceFile), 'utf8');
  const { records } = parseCsvObjects(text);
  const byPlayer = new Map();
  for (const r of records) {
    const id = r.player_id;
    if (!id) continue;
    if (!byPlayer.has(id)) byPlayer.set(id, []);
    byPlayer.get(id).push(r);
  }
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

/** Compute one config/fields.json field's value for a single player_id, given
 *  a Map<sourceFile, Map<player_id, records[]>> built by loadSourceIndex(). */
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

module.exports = { loadSourceIndex, recordMatchesFilter, computeField };
