#!/usr/bin/env node
process.argv.splice(2, 0, 'merge');
await import('../dist/cli.js');
