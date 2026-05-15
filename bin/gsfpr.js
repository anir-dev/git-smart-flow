#!/usr/bin/env node
process.argv.splice(2, 0, 'pr');
await import('../dist/cli.js');
