'use strict';

/**
 * log.js — retrospective message timeline (the /timestamps:log skill).
 *
 * Prints a clean, date-grouped timeline of recent messages in the current
 * project's transcript, each with a full HH:MM:SS timestamp.
 *
 * This is the Node, cross-platform replacement for the upstream project's
 * python3 `parse-transcript.py` — same idea, no Python dependency, works on
 * Windows out of the box, and adds seconds + a date header to every entry.
 *
 * Usage:
 *   node log.js                 # last 20 messages from the current project
 *   node log.js 50              # last 50 messages
 *   node log.js 30 /path.jsonl  # explicit transcript path (must be a real
 *                               # .jsonl inside ~/.claude/projects/)
 */

const transcript = require('./lib/transcript');
const render = require('./lib/render');
const config = require('./lib/config');

const DEFAULT_COUNT = 20;
const MAX_COUNT = 1000;

function parseIso(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function out(line) {
  process.stdout.write((line == null ? '' : String(line)) + '\n');
}

async function main() {
  const cfg = config.load();

  // Parse args: a bare integer is the count; anything else is a path.
  let count = DEFAULT_COUNT;
  let explicitPath = null;
  for (const arg of process.argv.slice(2)) {
    if (/^\d+$/.test(arg)) {
      count = Math.max(1, Math.min(parseInt(arg, 10), MAX_COUNT));
    } else if (arg && arg.trim()) {
      explicitPath = arg.trim();
    }
  }

  let transcriptPath = explicitPath || transcript.findTranscript(process.cwd());
  if (!transcriptPath) {
    out('No transcript found for this project directory.');
    out('Run /timestamps:log from a directory with an active Claude Code session.');
    return;
  }

  let validated;
  try {
    validated = transcript.validateTranscriptPath(transcriptPath);
  } catch (e) {
    out('Cannot read transcript: ' + (e && e.message ? e.message : 'unknown error'));
    return;
  }

  const messages = await transcript.readMessages(validated);
  if (!messages.length) {
    out('Transcript found, but it has no displayable messages yet.');
    return;
  }

  const tail = messages.slice(-count);

  out('');
  out('--- Message Timeline ---');

  let lastDay = null;
  for (const m of tail) {
    const d = parseIso(m.timestamp);
    const dayHeader = d ? render.formatDate(d) : 'Unknown date';
    if (dayHeader !== lastDay) {
      out('');
      out(dayHeader);
      lastDay = dayHeader;
    }
    const time = d ? render.formatTime(d, cfg) : '--:--:--';
    const label = m.role === 'user' ? cfg.labels.user : cfg.labels.assistant;
    out('  ' + time.padEnd(11) + label.padEnd(8) + ' ' + m.preview);
  }

  out('');
  out('Showing ' + tail.length + ' of ' + messages.length + ' messages.');
  if (messages.length > tail.length) {
    out('Tip: /timestamps:log <number> shows more (e.g. /timestamps:log 50).');
  }
}

// User-invoked, so it is fine to finish quietly on error rather than dumping a
// stack trace into the skill output. Always exits 0.
Promise.resolve()
  .then(main)
  .catch(function (e) {
    out('Cannot build timeline: ' + (e && e.message ? e.message : 'unknown error'));
  });
