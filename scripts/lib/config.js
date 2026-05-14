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
const os = require('os');
const path = require('path');
const { dataDir } = require('./paths');

/** Built-in defaults. Every supported key is listed here exactly once. */
const DEFAULTS = Object.freeze({
  // "24h" -> 14:51:52   |   "12h" -> 2:51:52 pm
  timeFormat: '24h',
  // Include ":SS" in the time.
  showSeconds: true,

  // Names shown in the timeline. labels.user may be the literal string "auto",
  // which resolves to the operating-system username at runtime.
  labels: Object.freeze({ user: 'auto', assistant: 'Claude' }),

  // /timestamps:log — group entries under a "Thu 14 May 2026" date header.
  dateHeaders: true,
  // /timestamps:log — max characters of message text shown per entry.
  previewLength: 200,
  // /timestamps:log — include tool-call entries ("[tool: Write]"). Off by
  // default so the timeline stays a clean conversational view.
  includeToolCalls: false,

  // extras/statusline.js — leading glyph and whether to append the date.
  prefix: '⏱', // ⏱
  statuslineShowDate: true,
});

const VALID_TIME_FORMATS = ['24h', '12h'];

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
    timeFormat: DEFAULTS.timeFormat,
    showSeconds: DEFAULTS.showSeconds,
    labels: { user: DEFAULTS.labels.user, assistant: DEFAULTS.labels.assistant },
    dateHeaders: DEFAULTS.dateHeaders,
    previewLength: DEFAULTS.previewLength,
    includeToolCalls: DEFAULTS.includeToolCalls,
    prefix: DEFAULTS.prefix,
    statuslineShowDate: DEFAULTS.statuslineShowDate,
  };

  if (!isPlainObject(raw)) return cfg;

  if (VALID_TIME_FORMATS.indexOf(raw.timeFormat) !== -1) {
    cfg.timeFormat = raw.timeFormat;
  }
  if (typeof raw.showSeconds === 'boolean') cfg.showSeconds = raw.showSeconds;

  if (isPlainObject(raw.labels)) {
    if (typeof raw.labels.user === 'string' && raw.labels.user.length > 0) {
      cfg.labels.user = raw.labels.user;
    }
    if (
      typeof raw.labels.assistant === 'string' &&
      raw.labels.assistant.length > 0
    ) {
      cfg.labels.assistant = raw.labels.assistant;
    }
  }

  if (typeof raw.dateHeaders === 'boolean') cfg.dateHeaders = raw.dateHeaders;
  cfg.previewLength = intInRange(raw.previewLength, 20, 2000, DEFAULTS.previewLength);
  if (typeof raw.includeToolCalls === 'boolean') {
    cfg.includeToolCalls = raw.includeToolCalls;
  }

  if (typeof raw.prefix === 'string') cfg.prefix = raw.prefix;
  if (typeof raw.statuslineShowDate === 'boolean') {
    cfg.statuslineShowDate = raw.statuslineShowDate;
  }

  return cfg;
}

/**
 * Resolve the user label. If it is the literal "auto", use the OS username;
 * if that is unavailable, fall back to "You". Never throws.
 */
function resolveUserLabel(cfg) {
  const label = cfg && cfg.labels ? cfg.labels.user : DEFAULTS.labels.user;
  if (label !== 'auto') return label;
  try {
    const name = os.userInfo().username;
    return name && name.trim() ? name.trim() : 'You';
  } catch (_) {
    return 'You';
  }
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

module.exports = { load, normalize, resolveUserLabel, configPath, DEFAULTS };
