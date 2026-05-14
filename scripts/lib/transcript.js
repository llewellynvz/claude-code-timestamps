'use strict';

/**
 * transcript.js — locate and parse Claude Code transcript files.
 *
 * Claude Code records every conversation as a JSON-Lines file under
 * ~/.claude/projects/<project-key>/<session-id>.jsonl, and stamps every API
 * call with an ISO timestamp. This module finds the right file for a working
 * directory and yields a clean list of {timestamp, role, preview} records.
 *
 * Used by scripts/log.js (the /timestamps:log skill). Never throws from the
 * read path — a malformed line is skipped, a missing file yields [].
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

/**
 * Claude Code's project-key transform: every character that is not a letter or
 * digit becomes "-". Verified against real project dirs on both Windows
 * ("D:\\GITHUB REPOS\\X" -> "D--GITHUB-REPOS-X") and Unix
 * ("/Users/me/x" -> "-Users-me-x").
 */
function projectKey(cwd) {
  return String(cwd || '').replace(/[^A-Za-z0-9]/g, '-');
}

/** Absolute path to ~/.claude/projects. */
function projectsRoot() {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Find the most recently modified transcript .jsonl for a working directory.
 * @returns {string|null} absolute path, or null if none found.
 */
function findTranscript(cwd) {
  try {
    const dir = path.join(projectsRoot(), projectKey(cwd));
    if (!fs.existsSync(dir)) return null;
    const candidates = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const full = path.join(dir, f);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch (_) {
          /* ignore unreadable entry */
        }
        return { full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return candidates.length ? candidates[0].full : null;
  } catch (_) {
    return null;
  }
}

/**
 * Validate that `p` is a real .jsonl file located inside ~/.claude/projects/.
 * Throws an Error with a human-readable message if not. This is a security
 * guard: it stops the log skill from being pointed at arbitrary files.
 * @returns {string} the resolved, validated absolute path.
 */
function validateTranscriptPath(p) {
  if (!p || typeof p !== 'string') {
    throw new Error('no transcript path provided');
  }
  let root;
  try {
    root = fs.realpathSync(projectsRoot());
  } catch (_) {
    throw new Error('~/.claude/projects does not exist yet');
  }
  let resolved;
  try {
    resolved = fs.realpathSync(p);
  } catch (_) {
    throw new Error('transcript file not found');
  }
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('transcript path must be inside ~/.claude/projects/');
  }
  if (!resolved.toLowerCase().endsWith('.jsonl')) {
    throw new Error('transcript file must be a .jsonl file');
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch (_) {
    throw new Error('transcript file not found');
  }
  if (!st.isFile()) {
    throw new Error('transcript path is not a file');
  }
  return resolved;
}

/** Extract a short text preview from one transcript entry. */
function extractPreview(entry) {
  const msg = entry && entry.message ? entry.message : {};
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text') return block.text || '';
      if (block.type === 'tool_use') return '[tool: ' + (block.name || '?') + ']';
    }
  }
  return '';
}

/** Collapse whitespace and truncate to `maxLen` characters. */
function truncate(text, maxLen) {
  const limit = maxLen || 80;
  const collapsed = String(text).split(/\s+/).join(' ').trim();
  if (collapsed.length > limit) return collapsed.slice(0, limit - 3) + '...';
  return collapsed || '(no text content)';
}

/**
 * Stream the transcript and resolve to an ordered array of
 * {timestamp, role, preview}. Streaming (not readFileSync) keeps memory flat
 * on very large transcripts. Never rejects — returns whatever parsed cleanly.
 */
function readMessages(transcriptPath, previewLen) {
  return new Promise((resolve) => {
    const messages = [];
    let stream;
    try {
      stream = fs.createReadStream(transcriptPath, { encoding: 'utf8' });
    } catch (_) {
      return resolve(messages);
    }
    stream.on('error', () => resolve(messages));

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch (_) {
        return; // skip malformed line
      }
      if (!entry || (entry.type !== 'user' && entry.type !== 'assistant')) return;
      const preview = truncate(extractPreview(entry), previewLen);
      if (preview === '(no text content)') return; // skip tool-only entries
      messages.push({
        timestamp: entry.timestamp || '',
        role: entry.type,
        preview,
      });
    });
    rl.on('error', () => resolve(messages));
    rl.on('close', () => resolve(messages));
  });
}

module.exports = {
  projectKey,
  projectsRoot,
  findTranscript,
  validateTranscriptPath,
  extractPreview,
  truncate,
  readMessages,
};
