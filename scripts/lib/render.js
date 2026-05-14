'use strict';

/**
 * render.js — time/date formatting shared by log.js and statusline.js.
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "14:51:52" (24h) or "2:51:52 pm" (12h); seconds optional per cfg. */
function formatTime(date, cfg) {
  const m = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  let h = date.getHours();
  let suffix = '';
  let hourStr;

  if (cfg && cfg.timeFormat === '12h') {
    suffix = h < 12 ? ' am' : ' pm';
    h = h % 12;
    if (h === 0) h = 12;
    hourStr = String(h);
  } else {
    hourStr = pad2(h);
  }

  let out = hourStr + ':' + m;
  if (!cfg || cfg.showSeconds !== false) out += ':' + s;
  return out + suffix;
}

/** "[14:51:52]" — the bracketed clock used as the message-header prefix. */
function formatClock(date, cfg) {
  return '[' + formatTime(date, cfg) + ']';
}

/** "Thu 14 May 2026" — fixed, locale-independent. */
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

module.exports = { formatTime, formatClock, formatDate };
