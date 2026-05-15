#!/usr/bin/env node
process.argv.splice(2, 0, 'commit');
await import('../dist/cli.js');
