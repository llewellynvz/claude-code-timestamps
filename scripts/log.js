'use strict';

/**
 * log.js — the /timestamps:log conversation timeline (the plugin's core feature).
 *
 * Finds the current project's transcript, parses it, and prints a clean,
 * date-grouped timeline where every message carries a "[HH:MM:SS] Name:" header:
 *
 *     --- Message Timeline ---
 *
 *     Thu 14 May 2026
 *
 *     [14:51:52] Llewellyn:
 *     what is the time?
 *
 *     [14:51:55] Claude:
 *     It's 2:51 PM.
 *
 *     Showing 2 of 48 messages.
 *
 * Pure Node, cross-platform, zero dependencies.
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
  const userLabel = config.resolveUserLabel(cfg);
  const assistantLabel = cfg.labels.assistant;

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

  const messages = await transcript.readMessages(
    validated,
    cfg.previewLength,
    cfg.includeToolCalls
  );
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

    // Date header when the day changes (if enabled).
    if (cfg.dateHeaders) {
      const dayHeader = d ? render.formatDate(d) : 'Unknown date';
      if (dayHeader !== lastDay) {
        out('');
        out(dayHeader);
        lastDay = dayHeader;
      }
    }

    const clock = d ? render.formatClock(d, cfg) : '[--:--:--]';
    const label = m.role === 'user' ? userLabel : assistantLabel;

    // Blank line between entries, then "[HH:MM:SS] Name:" then the message.
    out('');
    out(clock + ' ' + label + ':');
    out(m.preview);
  }

  out('');
  out('Showing ' + tail.length + ' of ' + messages.length + ' messages.');
  if (messages.length > tail.length) {
    out('Run /timestamps:log ' + Math.min(messages.length, MAX_COUNT) + ' to see the full conversation.');
  }
}

// User-invoked, so it finishes quietly on error rather than dumping a stack
// trace into the skill output. Always exits 0.
Promise.resolve()
  .then(main)
  .catch(function (e) {
    out('Cannot build timeline: ' + (e && e.message ? e.message : 'unknown error'));
  });
