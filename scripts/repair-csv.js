#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { repairCsv } = require('../server/src/mapping/csv');

const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output || flags.some(flag => flag !== '--accept-repairs')) {
  console.error('Usage: node scripts/repair-csv.js input.csv output.csv [--accept-repairs]');
  process.exit(1);
}
try {
  if (path.resolve(input) === path.resolve(output)) throw new Error('Use a separate output file to preserve the original CSV.');
  const result = repairCsv(fs.readFileSync(input, 'utf8'));
  console.log(JSON.stringify({ rows: result.totalRows, repairs: result.repairs, errors: result.errors }, null, 2));
  if (result.errors.length) process.exit(1);
  if (result.repairs.length && !flags.includes('--accept-repairs')) {
    console.error('Review the proposed repairs, then run again with --accept-repairs to write the corrected CSV.');
    process.exit(2);
  }
  fs.writeFileSync(output, result.correctedCsv, { flag: 'wx' });
  console.log(`Wrote ${output}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
