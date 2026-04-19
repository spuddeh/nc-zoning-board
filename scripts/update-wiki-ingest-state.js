#!/usr/bin/env node
/**
 * Run this after any wiki ingest to record the current git HEAD.
 * The check-docs-staleness.js hook uses this to detect docs/ changes
 * between sessions.
 *
 * Usage: node scripts/update-wiki-ingest-state.js
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.claude', 'wiki-ingest-state.json');

const commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const date = new Date().toISOString();

fs.writeFileSync(STATE_FILE, JSON.stringify({ commit, date }, null, 2) + '\n');
console.log(`Wiki ingest state updated: ${commit.slice(0, 7)} (${date})`);
