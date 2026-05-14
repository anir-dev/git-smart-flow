#!/usr/bin/env node
'use strict';
process.argv.splice(2, 0, 'pr');
require('../dist/cli.js');
