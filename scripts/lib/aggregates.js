'use strict';

/** Aggregate functions available to config/fields.json's "aggregate" key.
 *  Each receives the array of already-filtered source records for one player. */
const AGGREGATES = {
  sum(records, field) {
    let total = 0;
    for (const r of records) {
      const v = parseFloat(r[field.column]);
      if (!Number.isNaN(v)) total += v;
    }
    return total;
  },

  count_distinct(records, field) {
    const seen = new Set();
    for (const r of records) seen.add(r[field.column]);
    return seen.size;
  },

  count_rows(records) {
    return records.length;
  },
};

function runAggregate(name, records, field) {
  const fn = AGGREGATES[name];
  if (!fn) throw new Error(`Unknown aggregate "${name}" (field "${field.name}"). Supported: ${Object.keys(AGGREGATES).join(', ')}`);
  return fn(records, field);
}

module.exports = { runAggregate, AGGREGATES };
