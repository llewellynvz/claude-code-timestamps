'use strict';

/**
 * paths.js — resolves the directory that holds the optional config.json.
 *
 * Order of preference:
 *   1. ${CLAUDE_PLUGIN_DATA}        — the official persistent plugin data dir
 *                                     (survives plugin updates; created by Claude Code)
 *   2. <os tmp>/claude-timestamps   — fallback when CLAUDE_PLUGIN_DATA is absent
 *                                     (e.g. when loaded via --plugin-dir during dev)
 *
 * Every function here is best-effort and never throws. If no directory can be
 * found, callers receive `null` and simply fall back to built-in defaults.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Try to create `dir` (recursively). Returns true if it exists & is usable. */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return fs.statSync(dir).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Resolve the base data directory. Returns an absolute path string, or `null`
 * if nothing usable could be found. Not cached — cheap to recompute and avoids
 * stale state across short-lived script processes.
 */
function dataDir() {
  const candidates = [];

  if (process.env.CLAUDE_PLUGIN_DATA && process.env.CLAUDE_PLUGIN_DATA.trim()) {
    candidates.push(process.env.CLAUDE_PLUGIN_DATA.trim());
  }
  try {
    candidates.push(path.join(os.tmpdir(), 'claude-timestamps'));
  } catch (_) {
    /* os.tmpdir() should never throw, but stay defensive. */
  }

  for (const dir of candidates) {
    if (ensureDir(dir)) return dir;
  }
  return null;
}

module.exports = { dataDir, ensureDir };
