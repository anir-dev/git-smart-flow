#!/usr/bin/env node
'use strict';
process.argv.splice(2, 0, 'commit');
require('../dist/cli.js');
