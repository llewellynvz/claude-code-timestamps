'use strict';

/**
 * state.js — tiny per-session state store, used ONLY to remember when the
 * current turn's prompt was submitted so the Stop hook can show elapsed time.
 *
 * Design guarantees:
 *  - One file per session, keyed by a SANITIZED session id. A crafted session
 *    id can never escape the state directory (path-traversal safe).
 *  - Every function is best-effort and never throws. If state can't be written
 *    or read, elapsed time is simply omitted — timestamps still print.
 *  - Stale files are swept opportunistically so the directory never grows
 *    without bound.
 */

const fs = require('fs');
const path = require('path');
const { stateDir } = require('./paths');

// Files older than this are considered abandoned and cleaned up.
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Reduce an arbitrary session id to a safe, bounded filename component.
 * Anything outside [A-Za-z0-9_-] becomes "-". Empty results become "unknown".
 */
function sanitizeSessionId(id) {
  let s = (id == null ? '' : String(id)).replace(/[^A-Za-z0-9_-]/g, '-');
  if (s.length > 128) s = s.slice(0, 128);
  if (!s || /^[-]+$/.test(s)) s = 'unknown';
  return s;
}

/** Absolute path to a session's state file, or null if no state dir. */
function statePath(sessionId) {
  const dir = stateDir();
  if (!dir) return null;
  // path.basename() is a belt-and-braces second guard on top of sanitize().
  const name = path.basename(sanitizeSessionId(sessionId) + '.json');
  return path.join(dir, name);
}

/**
 * Record that a prompt was submitted "now" for `sessionId`.
 * @param {string} sessionId
 * @param {Date}   [when] — defaults to new Date()
 * @returns {boolean} true if the state was persisted
 */
function recordPrompt(sessionId, when) {
  const file = statePath(sessionId);
  if (!file) return false;
  const date = when instanceof Date ? when : new Date();
  try {
    const payload = JSON.stringify({
      promptTime: date.getTime(),
      promptIso: date.toISOString(),
    });
    fs.writeFileSync(file, payload, 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Read back the prompt time for `sessionId`.
 * @returns {{promptTime:number}|null}
 */
function readPrompt(sessionId) {
  const file = statePath(sessionId);
  if (!file) return null;
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && Number.isFinite(data.promptTime)) {
      return { promptTime: data.promptTime };
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Delete a session's state file (called after the Stop hook consumes it). */
function clearPrompt(sessionId) {
  const file = statePath(sessionId);
  if (!file) return;
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_) {
    /* best-effort */
  }
}

/**
 * Opportunistically delete state files older than STALE_MS. Cheap, bounded,
 * and silent on any error. Safe to call on every hook invocation.
 */
function cleanupStale(maxAgeMs) {
  const dir = stateDir();
  if (!dir) return;
  const cutoff = Date.now() - (Number.isFinite(maxAgeMs) ? maxAgeMs : STALE_MS);
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const full = path.join(dir, entry);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full);
      } catch (_) {
        /* skip this entry */
      }
    }
  } catch (_) {
    /* directory unreadable — nothing to do */
  }
}

module.exports = {
  sanitizeSessionId,
  statePath,
  recordPrompt,
  readPrompt,
  clearPrompt,
  cleanupStale,
  STALE_MS,
};
