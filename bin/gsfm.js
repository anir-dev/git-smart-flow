#!/usr/bin/env node
'use strict';
process.argv.splice(2, 0, 'merge');
require('../dist/cli.js');
