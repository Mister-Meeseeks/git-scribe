#!/usr/bin/env node

const { main } = require('../src/index');

main(process.argv.slice(2)).catch((error) => {
  const stackEnabled = process.env.SCRIBE_DEBUG_STACK === '1';
  const output = stackEnabled && error.stack ? error.stack : error.message;
  console.error(output);
  process.exitCode = 1;
});
