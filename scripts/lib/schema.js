'use strict';

/** The Ranker CSV schema (category, primary key, field list) is fully driven
 *  by config/fields.json — both scripts generate their output header/meta
 *  from it directly, rather than from whatever columns a baseline file
 *  happens to already have, so adding a field to the config is enough to
 *  add it to both outputs. */

function buildMetaLines(config) {
  const lines = [`#category,${config.category}`, `#primary,${config.primary}`];
  for (const field of config.fields) lines.push(`#field,${field.name},optional`);
  return lines;
}

function buildHeader(config) {
  return [config.primary, ...config.fields.map((f) => f.name)];
}

module.exports = { buildMetaLines, buildHeader };
