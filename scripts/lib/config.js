'use strict';

/**
 * config.js — loads and validates the timestamps plugin configuration.
 *
 * Configuration is OPTIONAL. With no config file at all, the built-in
 * DEFAULTS below are used. A user may drop a `config.json` into the plugin
 * data directory (see README > Configuration) to override any subset of keys.
 *
 * This module is defensive by contract: it NEVER throws. A missing file, a
 * malformed file, or an out-of-range value all degrade gracefully to the
 * default for that single field.
 */

const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

/** Built-in defaults. Every supported key is listed here exactly once. */
const DEFAULTS = Object.freeze({
  // Master switch. When false, the hooks run but print nothing.
  enabled: true,

  // "24h" -> 14:23:01   |   "12h" -> 2:23:01 pm
  timeFormat: '24h',
  // Include ":SS" in the time.
  showSeconds: true,

  // "always" -> show the date on every prompt line
  // "never"  -> never show the date
  dateMode: 'always',
  // Also show the date on the "Claude finished" line (off by default — the
  // prompt line above it already carries the date for that exchange).
  dateOnStopLine: false,

  // Show "· 46s" elapsed time on the "Claude finished" line.
  showElapsed: true,

  // Leading glyph for each line. Set to "" for none.
  prefix: '⏱', // ⏱
  // Separator between fields.
  separator: ' · ', // " · "
  // Spaces of left indentation.
  indent: 0,
  // Blank lines printed BEFORE the prompt line (separates exchanges).
  gapBeforePrompt: 1,
  // Blank lines printed BEFORE the "Claude finished" line (same exchange).
  gapBeforeStop: 0,
  // Wrap lines in ANSI "dim". Off by default for maximum terminal safety.
  color: false,

  // Display labels for each side of the conversation.
  labels: Object.freeze({ user: 'you', assistant: 'Claude' }),
});

const VALID_TIME_FORMATS = ['24h', '12h'];
const VALID_DATE_MODES = ['always', 'never'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Clamp a value to an integer within [min, max], or fall back to `def`. */
function intInRange(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.round(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/**
 * Merge a raw (untrusted) config object over the DEFAULTS, validating each
 * field. Unknown keys are ignored. Returns a complete, safe config object.
 */
function normalize(raw) {
  const cfg = {
    enabled: DEFAULTS.enabled,
    timeFormat: DEFAULTS.timeFormat,
    showSeconds: DEFAULTS.showSeconds,
    dateMode: DEFAULTS.dateMode,
    dateOnStopLine: DEFAULTS.dateOnStopLine,
    showElapsed: DEFAULTS.showElapsed,
    prefix: DEFAULTS.prefix,
    separator: DEFAULTS.separator,
    indent: DEFAULTS.indent,
    gapBeforePrompt: DEFAULTS.gapBeforePrompt,
    gapBeforeStop: DEFAULTS.gapBeforeStop,
    color: DEFAULTS.color,
    labels: { user: DEFAULTS.labels.user, assistant: DEFAULTS.labels.assistant },
  };

  if (!isPlainObject(raw)) return cfg;

  if (typeof raw.enabled === 'boolean') cfg.enabled = raw.enabled;

  if (VALID_TIME_FORMATS.indexOf(raw.timeFormat) !== -1) {
    cfg.timeFormat = raw.timeFormat;
  }
  if (typeof raw.showSeconds === 'boolean') cfg.showSeconds = raw.showSeconds;

  if (VALID_DATE_MODES.indexOf(raw.dateMode) !== -1) cfg.dateMode = raw.dateMode;
  if (typeof raw.dateOnStopLine === 'boolean') cfg.dateOnStopLine = raw.dateOnStopLine;

  if (typeof raw.showElapsed === 'boolean') cfg.showElapsed = raw.showElapsed;

  if (typeof raw.prefix === 'string') cfg.prefix = raw.prefix;
  if (typeof raw.separator === 'string' && raw.separator.length > 0) {
    cfg.separator = raw.separator;
  }
  cfg.indent = intInRange(raw.indent, 0, 40, DEFAULTS.indent);
  cfg.gapBeforePrompt = intInRange(raw.gapBeforePrompt, 0, 5, DEFAULTS.gapBeforePrompt);
  cfg.gapBeforeStop = intInRange(raw.gapBeforeStop, 0, 5, DEFAULTS.gapBeforeStop);
  if (typeof raw.color === 'boolean') cfg.color = raw.color;

  if (isPlainObject(raw.labels)) {
    if (typeof raw.labels.user === 'string' && raw.labels.user.length > 0) {
      cfg.labels.user = raw.labels.user;
    }
    if (typeof raw.labels.assistant === 'string' && raw.labels.assistant.length > 0) {
      cfg.labels.assistant = raw.labels.assistant;
    }
  }

  return cfg;
}

/** Absolute path to the (optional) user config file, or null if no data dir. */
function configPath() {
  const base = dataDir();
  return base ? path.join(base, 'config.json') : null;
}

/**
 * Load the effective configuration. Never throws.
 * @param {string} [explicitPath] — override the config file location (tests).
 */
function load(explicitPath) {
  const file = explicitPath || configPath();
  if (!file) return normalize(null);
  try {
    if (!fs.existsSync(file)) return normalize(null);
    const text = fs.readFileSync(file, 'utf8');
    const raw = JSON.parse(text);
    return normalize(raw);
  } catch (_) {
    // Malformed or unreadable config — fall back to defaults silently.
    return normalize(null);
  }
}

module.exports = { load, normalize, configPath, DEFAULTS };
