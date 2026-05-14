'use strict';

/**
 * paths.js — resolves a writable directory for plugin state.
 *
 * Order of preference:
 *   1. ${CLAUDE_PLUGIN_DATA}        — the official persistent plugin data dir
 *                                     (survives plugin updates; created by Claude Code)
 *   2. <os tmp>/claude-timestamps   — fallback when CLAUDE_PLUGIN_DATA is absent
 *                                     (e.g. when loaded via --plugin-dir during dev)
 *
 * Every function here is best-effort and never throws. If no directory can be
 * created, callers receive `null` and silently skip state — the plugin still
 * prints timestamps, it just cannot show "elapsed" time for that turn.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Try to create `dir` (recursively). Returns true if it exists & is usable. */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Confirm it is actually a directory we can see.
    return fs.statSync(dir).isDirectory();
  } catch (_) {
    return false;
  }
}

/**
 * Resolve the base data directory. Returns an absolute path string, or `null`
 * if nothing writable could be found. Result is NOT cached — cheap enough to
 * recompute, and avoids stale state across the short-lived hook process.
 */
function dataDir() {
  const candidates = [];

  if (process.env.CLAUDE_PLUGIN_DATA && process.env.CLAUDE_PLUGIN_DATA.trim()) {
    candidates.push(process.env.CLAUDE_PLUGIN_DATA.trim());
  }
  // Fallback: a stable, per-user temp location.
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

/**
 * Resolve the sub-directory that holds per-session state files.
 * Returns an absolute path string, or `null` if unavailable.
 */
function stateDir() {
  const base = dataDir();
  if (!base) return null;
  const dir = path.join(base, 'state');
  return ensureDir(dir) ? dir : null;
}

module.exports = { dataDir, stateDir, ensureDir };
