'use strict';

/**
 * statusline.js — OPTIONAL, opt-in live clock for the Claude Code status line.
 *
 * This is NOT part of the plugin's automatic behaviour. A plugin cannot set a
 * main status line without overriding whatever the user already has, so this
 * is shipped as an extra you switch on yourself. See README > Optional: live
 * clock in the status line for the exact one-time setup.
 *
 * When wired up with `"refreshInterval": 1000`, Claude Code re-runs this every
 * second, giving you a ticking clock at the bottom of the terminal:
 *
 *     ⏱ 14:23:01 · Tue 14 May 2026 · claude-opus-4-7 · CLAUDE TIMESTAPS
 *
 * It reuses the plugin's own render/config modules, so it honours the same
 * config.json (time format, seconds, prefix, separator, color).
 *
 * Safety: like the hooks, this never throws and always exits 0. A status-line
 * command that errors would clutter the UI, so on any failure it prints a
 * single minimal time string and exits cleanly.
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
    // Fallback: a bare ISO-ish time, no dependencies.
    var n = new Date();
    process.stdout.write(
      String(n.getHours()).padStart(2, '0') + ':' +
      String(n.getMinutes()).padStart(2, '0') + ':' +
      String(n.getSeconds()).padStart(2, '0')
    );
    return;
  }

  var cfg = config.load();
  var info = {};
  try {
    var raw = await readStdin(1500);
    if (raw && raw.trim()) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') info = parsed;
    }
  } catch (_) {
    info = {};
  }

  var now = new Date();
  var parts = [];
  if (cfg.prefix) parts.push(cfg.prefix);
  parts.push(render.formatTime(now, cfg));
  parts.push(render.formatDate(now));
  if (info.model) parts.push(String(info.model));
  if (info.cwd) parts.push(path.basename(String(info.cwd)));

  var line = render.colorize(parts.join(cfg.separator), cfg.color);
  try { process.stdout.write(line); } catch (_) {}
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
