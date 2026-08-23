'use strict';

/** Collapse a player name to a loose key: strips accents, punctuation, and spacing
 *  so "Nikola Jokic" (accented) / "Nikola Jokic" (plain), or "Karl-Anthony Towns" /
 *  "Karl Anthony-Towns", land on the same key without needing an explicit alias. */
function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

module.exports = { normalizeName };
