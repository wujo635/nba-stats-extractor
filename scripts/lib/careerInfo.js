'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsvObjects } = require('./csv');

/** Load data/Player Career Info.csv: one record per player (name, player_id,
 *  birth_date, etc.) as it appears in the Kaggle dataset. */
function loadCareerInfoRecords(dataDir) {
  const text = fs.readFileSync(path.join(dataDir, 'Player Career Info.csv'), 'utf8');
  return parseCsvObjects(text).records;
}

module.exports = { loadCareerInfoRecords };
