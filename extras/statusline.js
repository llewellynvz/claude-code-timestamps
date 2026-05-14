'use strict';

/**
 * statusline.js — OPTIONAL, opt-in live clock for the Claude Code status line.
 *
 * This is the plugin's clean, always-visible timestamp option. A plugin cannot
 * set the main status line without overriding whatever the user already has,
 * so this is shipped as an extra you switch on yourself. See README > Optional:
 * a live clock in the status line for the one-time setup.
 *
 * With "refreshInterval": 1000 in your settings, Claude Code re-runs this every
 * second, giving a ticking clock at the bottom of the terminal:
 *
 *     ⏱ 14:51:55 · Thu 14 May 2026
 *
 * It reuses the plugin's own render/config modules, so it honours the same
 * config.json (time format, seconds, prefix, whether to show the date).
 *
 * Safety: never throws, always exits 0. A status-line command that errored
 * would clutter the UI, so on any failure it prints a minimal time and exits.
 */

const path = require('path');

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
      process.stdin.on('data', function (c) { data += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      timer = setTimeout(finish, timeoutMs);
      if (timer && timer.unref) timer.unref();
    } catch (_) {
      finish();
    }
  });
}

async function main() {
  var render, config;
  try {
    render = require(path.join(__dirname, '..', 'scripts', 'lib', 'render'));
    config = require(path.join(__dirname, '..', 'scripts', 'lib', 'config'));
  } catch (_) {
    // Fallback: a bare time string, no dependencies.
    var n = new Date();
    process.stdout.write(
      String(n.getHours()).padStart(2, '0') + ':' +
      String(n.getMinutes()).padStart(2, '0') + ':' +
      String(n.getSeconds()).padStart(2, '0')
    );
    return;
  }

  var cfg = config.load();

  // Drain stdin (Claude Code sends session JSON) so the process exits cleanly;
  // this status line doesn't need any of those fields.
  try { await readStdin(1500); } catch (_) {}

  var now = new Date();
  var parts = [];
  if (cfg.prefix) parts.push(cfg.prefix);
  parts.push(render.formatTime(now, cfg));
  if (cfg.statuslineShowDate) parts.push(render.formatDate(now));

  try { process.stdout.write(parts.join(' · ')); } catch (_) {}
}

(function run() {
  var guard = setTimeout(function () {
    try { process.exit(0); } catch (_) {}
  }, 4000);
  if (guard && guard.unref) guard.unref();
  Promise.resolve()
    .then(main)
    .catch(function () {})
    .then(function () {
      try { clearTimeout(guard); } catch (_) {}
    });
})();
