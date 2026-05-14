'use strict';

/**
 * render.js — turns a Date (+ optional elapsed time) into the formatted
 * timestamp line, according to a normalized config object from config.js.
 *
 * All formatting is done manually (no locale APIs) so the output is byte-for-byte
 * identical on every machine, OS, and locale. Times and dates use the LOCAL
 * timezone of the machine running Claude Code.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ANSI "dim" / reset. Built from a char code so the escape byte survives
// every editor, copy-paste, and file-encoding round-trip.
const ESC = String.fromCharCode(27);
const ANSI_DIM = ESC + '[2m';
const ANSI_RESET = ESC + '[0m';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "14:23:01" (24h) or "2:23:01 pm" (12h); seconds optional. */
function formatTime(date, cfg) {
  const m = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  let h = date.getHours();
  let suffix = '';
  let hourStr;

  if (cfg.timeFormat === '12h') {
    suffix = h < 12 ? ' am' : ' pm';
    h = h % 12;
    if (h === 0) h = 12;
    hourStr = String(h);
  } else {
    hourStr = pad2(h);
  }

  let out = hourStr + ':' + m;
  if (cfg.showSeconds) out += ':' + s;
  return out + suffix;
}

/** "Tue 14 May 2026" — fixed, locale-independent. */
function formatDate(date) {
  return (
    WEEKDAYS[date.getDay()] +
    ' ' +
    pad2(date.getDate()) +
    ' ' +
    MONTHS[date.getMonth()] +
    ' ' +
    date.getFullYear()
  );
}

/**
 * Human-friendly elapsed time. Returns null for missing/invalid input so the
 * caller can simply omit the field.
 *   42000   -> "42s"
 *   105000  -> "1m 45s"
 *   3700000 -> "1h 1m"
 */
function formatElapsed(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return totalSec + 's';
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return totalMin + 'm ' + sec + 's';
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return hr + 'h ' + min + 'm';
}

/** Wrap in ANSI "dim" if color is enabled. */
function colorize(text, on) {
  return on ? ANSI_DIM + text + ANSI_RESET : text;
}

/**
 * Build the core (single-line) timestamp string — no gap, no indent.
 *
 * @param {object}  opts
 * @param {'prompt'|'stop'} opts.event
 * @param {Date}    opts.date        — the moment to display
 * @param {number} [opts.elapsedMs] — elapsed since the prompt (stop event only)
 * @param {object}  opts.cfg         — normalized config
 * @returns {string}
 */
function buildCore(opts) {
  const { event, date, elapsedMs, cfg } = opts;

  // Fields are joined with `separator`. The prefix is NOT a field — it is a
  // visual anchor attached to the front with a single space, so the output
  // reads "⏱ 14:23:01 · …" and never "⏱ · 14:23:01 · …".
  const fields = [];
  fields.push(formatTime(date, cfg));

  const wantDate =
    event === 'prompt'
      ? cfg.dateMode === 'always'
      : cfg.dateMode !== 'never' && cfg.dateOnStopLine;
  if (wantDate) fields.push(formatDate(date));

  const label = event === 'prompt' ? cfg.labels.user : cfg.labels.assistant;
  fields.push(label);

  if (event === 'stop' && cfg.showElapsed) {
    const el = formatElapsed(elapsedMs);
    if (el) fields.push(el);
  }

  let core = fields.join(cfg.separator);
  if (cfg.prefix) core = cfg.prefix + ' ' + core;
  return core;
}

/**
 * Build the full line to emit, including the leading blank-line gap and
 * indentation. Does NOT include a trailing newline — the caller adds that.
 */
function buildLine(opts) {
  const { event, cfg } = opts;
  const core = colorize(buildCore(opts), cfg.color);
  const indent = ' '.repeat(Math.max(0, cfg.indent | 0));
  const gap = event === 'prompt' ? cfg.gapBeforePrompt : cfg.gapBeforeStop;
  return '\n'.repeat(Math.max(0, gap | 0)) + indent + core;
}

module.exports = {
  formatTime,
  formatDate,
  formatElapsed,
  buildCore,
  buildLine,
  colorize,
};
