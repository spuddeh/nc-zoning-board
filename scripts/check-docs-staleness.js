#!/usr/bin/env node
/**
 * UserPromptSubmit hook — two checks on every session start:
 *
 *  1. Wiki staleness — warns if docs/ files changed since the last wiki ingest.
 *  2. Location sync  — warns if origin/main has new location data not in the local tree.
 *
 * Outputs nothing when everything is current (silent = no disruption).
 * Register in .claude/settings.json under hooks.UserPromptSubmit.
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, '.claude', 'wiki-ingest-state.json');

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// ── 1. Wiki staleness ────────────────────────────────────────────────────────

function checkWikiStaleness() {
  let lastCommit = null;
  if (fs.existsSync(STATE_FILE)) {
    try {
      lastCommit = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).commit;
    } catch (_) {}
  }

  if (!lastCommit) {
    console.log(
      '[wiki] No wiki ingest state found. After ingesting docs/, run:\n' +
      '  node scripts/update-wiki-ingest-state.js'
    );
    return;
  }

  let changed = [];
  try {
    const diff = git(`git diff --name-only ${lastCommit}..HEAD -- docs/`);
    if (diff) changed = diff.split('\n').filter(Boolean);
  } catch (_) {
    return;
  }

  try {
    const untracked = git('git ls-files --others --exclude-standard -- docs/');
    if (untracked) changed.push(...untracked.split('\n').filter(Boolean));
  } catch (_) {}

  if (changed.length === 0) return;

  const fileList = changed.map(f => `  - ${path.basename(f)}`).join('\n');
  console.log(
    `[wiki] ⚠ These docs/ files changed since the last wiki ingest:\n` +
    `${fileList}\n` +
    `  Run: wiki ingest <file>  — or  wiki ingest all`
  );
}

// ── 2. Location sync ─────────────────────────────────────────────────────────

function checkLocationSync() {
  // Fetch origin/main quietly — skip if offline or no remote
  try {
    execSync('git fetch origin main --quiet', { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
  } catch (_) {
    return;
  }

  try {
    const mergeBase = git('git merge-base HEAD origin/main');
    const diff = git(`git diff --name-only ${mergeBase}..origin/main -- data/locations/ data/tags.json`);
    if (!diff) return;

    const files = diff.split('\n').filter(Boolean);
    const locationCount = files.filter(f => f.startsWith('data/locations/')).length;
    const tagsChanged = files.some(f => f === 'data/tags.json');

    if (locationCount === 0 && !tagsChanged) return;

    const parts = [];
    if (locationCount > 0) parts.push(`${locationCount} new location(s)`);
    if (tagsChanged) parts.push('tags.json updated');

    const branch = git('git rev-parse --abbrev-ref HEAD');
    const pullCmd = branch === 'main'
      ? 'git pull origin main'
      : 'git fetch origin main && git merge origin/main';

    console.log(
      `[locations] 📦 origin/main has ${parts.join(' + ')} not in local copy.\n` +
      `  Run: ${pullCmd}`
    );
  } catch (_) {}
}

// ── Run both ─────────────────────────────────────────────────────────────────

checkWikiStaleness();
checkLocationSync();
