#!/usr/bin/env node
process.argv.splice(2, 0, 'push');
await import('../dist/cli.js');
