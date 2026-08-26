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

  min(records, field) {
    const values = records.map((r) => parseInt(r[field.column], 10)).filter((v) => !Number.isNaN(v));
    return values.length ? Math.min(...values) : '';
  },

  max(records, field) {
    const values = records.map((r) => parseInt(r[field.column], 10)).filter((v) => !Number.isNaN(v));
    return values.length ? Math.max(...values) : '';
  },

  /** Distinct integer values of `column`, collapsed into runs of consecutive
   *  years, e.g. [2001,2002,2003,2005,2006] -> "2001-2003, 2005-2006". */
  year_ranges(records, field) {
    const years = [...new Set(records.map((r) => parseInt(r[field.column], 10)))]
      .filter((v) => !Number.isNaN(v))
      .sort((a, b) => a - b);
    if (years.length === 0) return '';

    const ranges = [];
    let start = years[0];
    let end = years[0];
    for (let i = 1; i < years.length; i++) {
      if (years[i] === end + 1) {
        end = years[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = end = years[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
  },
};

function runAggregate(name, records, field) {
  const fn = AGGREGATES[name];
  if (!fn) throw new Error(`Unknown aggregate "${name}" (field "${field.name}"). Supported: ${Object.keys(AGGREGATES).join(', ')}`);
  return fn(records, field);
}

module.exports = { runAggregate, AGGREGATES };
