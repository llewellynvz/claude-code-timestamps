'use strict';

/**
 * timestamp-hook.js — the live timestamp hook entry point.
 *
 * Invoked by Claude Code for two hook events (see hooks/hooks.json):
 *   node timestamp-hook.js prompt    <- UserPromptSubmit
 *   node timestamp-hook.js stop      <- Stop
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAFETY CONTRACT — non-negotiable. This runs on EVERY prompt the user sends.
 *   1. The process ALWAYS exits 0. It never blocks, fails, or delays a prompt.
 *   2. Every operation is wrapped; an exception can never escape `main`.
 *   3. A hard timeout guard forces a clean exit well under the hook's 5s limit.
 *   4. Worst case on any error: it prints nothing and exits cleanly.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Output behaviour (per the Claude Code hooks reference):
 *   - prompt: prints a PLAIN-TEXT line. A UserPromptSubmit hook's plain stdout
 *             is shown in the transcript (it is also added to context — a
 *             one-line timestamp is negligible, and arguably useful).
 *   - stop:   prints a JSON object {"systemMessage": "..."}. A Stop hook's
 *             plain stdout goes only to the debug log, so `systemMessage` is
 *             the documented channel for surfacing a line to the user.
 */

var config, render, state;
try {
  config = require('./lib/config');
  render = require('./lib/render');
  state = require('./lib/state');
} catch (_) {
  // If the library files cannot even be loaded, honour the safety contract:
  // do nothing, exit cleanly. (The guard below also covers this.)
  config = null;
}

/**
 * Read all of stdin as a string. Resolves on `end`, on `error`, on a TTY (no
 * piped input), or after `timeoutMs` — whichever comes first. Never rejects.
 */
function readStdin(timeoutMs) {
  return new Promise(function (resolve) {
    var data = '';
    var settled = false;
    var timer = null;
    function finish() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { process.stdin.pause(); } catch (_) {}
      resolve(data);
    }
    try {
      if (process.stdin.isTTY) return finish();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', function (chunk) { data += chunk; });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      timer = setTimeout(finish, timeoutMs);
      if (timer && timer.unref) timer.unref();
    } catch (_) {
      finish();
    }
  });
}

function safeParse(text) {
  try {
    var v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (_) {
    return {};
  }
}

async function main() {
  if (!config) return; // libraries failed to load — contract: do nothing.

  var event = String(process.argv[2] || '').toLowerCase();
  if (event !== 'prompt' && event !== 'stop') return;

  var cfg;
  try {
    cfg = config.load();
  } catch (_) {
    cfg = config.normalize(null);
  }
  if (!cfg || !cfg.enabled) return; // master off-switch.

  var payload = {};
  try {
    var raw = await readStdin(2000);
    if (raw && raw.trim()) payload = safeParse(raw);
  } catch (_) {
    payload = {};
  }

  var sessionId = payload.session_id;
  var now = new Date();

  if (event === 'prompt') {
    // Record when this turn started so the Stop hook can show elapsed time.
    try { state.recordPrompt(sessionId, now); } catch (_) {}
    var promptLine = render.buildLine({ event: 'prompt', date: now, cfg: cfg });
    try { process.stdout.write(promptLine + '\n'); } catch (_) {}
  } else {
    // event === 'stop'
    var elapsedMs;
    try {
      var prev = state.readPrompt(sessionId);
      if (prev) elapsedMs = now.getTime() - prev.promptTime;
      state.clearPrompt(sessionId);
    } catch (_) {}
    var stopLine = render.buildLine({
      event: 'stop',
      date: now,
      elapsedMs: elapsedMs,
      cfg: cfg,
    });
    // A Stop hook must emit JSON for the text to reach the user.
    try {
      process.stdout.write(JSON.stringify({ systemMessage: stopLine }));
    } catch (_) {}
  }

  // Opportunistic, bounded, silent housekeeping of abandoned state files.
  try { state.cleanupStale(); } catch (_) {}
}

// ── Runner: enforces the safety contract ──────────────────────────────────
(function run() {
  // Hard ceiling. If anything hangs, force a clean exit before the 5s hook
  // timeout. unref() so this timer never keeps the process alive on its own.
  var guard = setTimeout(function () {
    try { process.exit(0); } catch (_) {}
  }, 4500);
  if (guard && guard.unref) guard.unref();

  Promise.resolve()
    .then(main)
    .catch(function () { /* swallow — contract: never fail */ })
    .then(function () {
      try { clearTimeout(guard); } catch (_) {}
      // Let the event loop drain naturally (stdout flushes, then exit 0).
    });
})();
