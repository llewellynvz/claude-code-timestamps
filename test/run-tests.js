'use strict';

/**
 * run-tests.js — self-contained test harness for the timestamps plugin (v2.0.0).
 *
 * Pure Node, zero dependencies. Run with:  node test/run-tests.js
 *
 * Covers:
 *   - config.js     defaults + defensive normalization + resolveUserLabel
 *   - render.js     time / clock / date formatting
 *   - transcript.js project-key transform, path-validation guard, JSONL parsing
 *   - log.js        end-to-end against a real fixture transcript: the
 *                   "[HH:MM:SS] Name:" timeline format, the no-transcript path,
 *                   and invocation through a path that contains spaces
 *   - statusline.js runs cleanly and emits a time string
 *   - JSON validity of every shipped manifest
 *
 * Exit code is 0 only if every assertion passes.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PLUGIN_ROOT = path.join(__dirname, '..');
const LOG = path.join(PLUGIN_ROOT, 'scripts', 'log.js');
const STATUSLINE = path.join(PLUGIN_ROOT, 'extras', 'statusline.js');
const WORK = path.join(__dirname, '.work');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : e));
  }
}

function section(title) {
  console.log('');
  console.log('— ' + title + ' —');
}

function freshWorkDir() {
  try {
    fs.rmSync(WORK, { recursive: true, force: true });
  } catch (_) {}
  fs.mkdirSync(WORK, { recursive: true });
  return WORK;
}

// ──────────────────────────────────────────────────────────────────────────
console.log('timestamps plugin — test suite (v2.0.0)');
console.log('plugin root: ' + PLUGIN_ROOT);
freshWorkDir();

// ── config.js ─────────────────────────────────────────────────────────────
section('config.js');
const config = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'config'));

test('defaults load when no file exists', function () {
  const cfg = config.load(path.join(WORK, 'does-not-exist.json'));
  assert.strictEqual(cfg.timeFormat, '24h');
  assert.strictEqual(cfg.showSeconds, true);
  assert.strictEqual(cfg.labels.user, 'auto');
  assert.strictEqual(cfg.labels.assistant, 'Claude');
  assert.strictEqual(cfg.dateHeaders, true);
  assert.strictEqual(cfg.previewLength, 200);
  assert.strictEqual(cfg.includeToolCalls, false);
});

test('malformed JSON config falls back to defaults (no throw)', function () {
  const bad = path.join(WORK, 'bad.json');
  fs.writeFileSync(bad, '{ this is not json', 'utf8');
  const cfg = config.load(bad);
  assert.strictEqual(cfg.timeFormat, '24h');
});

test('out-of-range / wrong-type values are clamped or rejected', function () {
  const f = path.join(WORK, 'weird.json');
  fs.writeFileSync(
    f,
    JSON.stringify({
      timeFormat: 'banana',
      showSeconds: 'yes',
      previewLength: 999999,
      dateHeaders: 'maybe',
      labels: { user: '', assistant: 'AI' },
    }),
    'utf8'
  );
  const cfg = config.load(f);
  assert.strictEqual(cfg.timeFormat, '24h', 'invalid timeFormat -> default');
  assert.strictEqual(cfg.showSeconds, true, 'non-boolean -> default');
  assert.strictEqual(cfg.previewLength, 2000, 'clamped to max 2000');
  assert.strictEqual(cfg.dateHeaders, true, 'non-boolean -> default');
  assert.strictEqual(cfg.labels.user, 'auto', 'empty label -> default');
  assert.strictEqual(cfg.labels.assistant, 'AI', 'valid label override kept');
});

test('valid config overrides are honoured', function () {
  const f = path.join(WORK, 'good.json');
  fs.writeFileSync(
    f,
    JSON.stringify({
      timeFormat: '12h',
      showSeconds: false,
      previewLength: 50,
      includeToolCalls: true,
      labels: { user: 'Llewellyn' },
    }),
    'utf8'
  );
  const cfg = config.load(f);
  assert.strictEqual(cfg.timeFormat, '12h');
  assert.strictEqual(cfg.showSeconds, false);
  assert.strictEqual(cfg.previewLength, 50);
  assert.strictEqual(cfg.includeToolCalls, true);
  assert.strictEqual(cfg.labels.user, 'Llewellyn');
});

test('resolveUserLabel: explicit string is used verbatim', function () {
  const cfg = config.normalize({ labels: { user: 'Llewellyn' } });
  assert.strictEqual(config.resolveUserLabel(cfg), 'Llewellyn');
});

test('resolveUserLabel: "auto" resolves to a non-empty name', function () {
  const cfg = config.normalize(null); // default labels.user === "auto"
  const label = config.resolveUserLabel(cfg);
  assert.strictEqual(typeof label, 'string');
  assert.ok(label.length > 0, 'auto must resolve to something non-empty');
  assert.notStrictEqual(label, 'auto', 'auto must be resolved, not passed through');
});

// ── render.js ─────────────────────────────────────────────────────────────
section('render.js');
const render = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'render'));

test('formatTime 24h with seconds', function () {
  const d = new Date(2026, 4, 14, 9, 5, 3);
  assert.strictEqual(
    render.formatTime(d, { timeFormat: '24h', showSeconds: true }),
    '09:05:03'
  );
});

test('formatTime 24h without seconds', function () {
  const d = new Date(2026, 4, 14, 14, 23, 1);
  assert.strictEqual(
    render.formatTime(d, { timeFormat: '24h', showSeconds: false }),
    '14:23'
  );
});

test('formatTime 12h am/pm', function () {
  const noon = new Date(2026, 4, 14, 12, 0, 0);
  const midnight = new Date(2026, 4, 14, 0, 30, 0);
  assert.strictEqual(
    render.formatTime(noon, { timeFormat: '12h', showSeconds: false }),
    '12:00 pm'
  );
  assert.strictEqual(
    render.formatTime(midnight, { timeFormat: '12h', showSeconds: true }),
    '12:30:00 am'
  );
});

test('formatClock wraps the time in brackets', function () {
  const d = new Date(2026, 4, 14, 14, 51, 52);
  assert.strictEqual(
    render.formatClock(d, { timeFormat: '24h', showSeconds: true }),
    '[14:51:52]'
  );
});

test('formatDate is fixed and locale-independent', function () {
  // 2026-05-14 is a Thursday.
  const d = new Date(2026, 4, 14, 0, 0, 0);
  assert.strictEqual(render.formatDate(d), 'Thu 14 May 2026');
});

// ── transcript.js ─────────────────────────────────────────────────────────
section('transcript.js');
const transcript = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'transcript'));

test('projectKey transform matches Claude Code convention', function () {
  assert.strictEqual(
    transcript.projectKey('D:\\GITHUB REPOS\\CLAUDE TIMESTAPS'),
    'D--GITHUB-REPOS-CLAUDE-TIMESTAPS'
  );
  assert.strictEqual(transcript.projectKey('/Users/me/proj'), '-Users-me-proj');
});

test('validateTranscriptPath rejects paths outside ~/.claude/projects', function () {
  let threw = false;
  try {
    transcript.validateTranscriptPath(os.tmpdir());
  } catch (_) {
    threw = true;
  }
  assert.ok(threw, 'must reject a path outside ~/.claude/projects/');
});

test('validateTranscriptPath rejects a non-.jsonl file', function () {
  let threw = false;
  try {
    transcript.validateTranscriptPath(__filename); // this .js file
  } catch (_) {
    threw = true;
  }
  assert.ok(threw);
});

// A fixture exercising every entry kind: a user message, junk, a text reply,
// a tool-only assistant entry, an assistant entry with BOTH a tool call and
// text, and an unrelated system entry.
const MIXED_FIXTURE = [
  JSON.stringify({
    type: 'user',
    timestamp: '2026-05-14T12:00:01.000Z',
    message: { content: 'Hello there' },
  }),
  'this is not json — must be skipped',
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-14T12:00:05.000Z',
    message: { content: [{ type: 'text', text: 'Hi! How can I help?' }] },
  }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-14T12:00:06.000Z',
    message: { content: [{ type: 'tool_use', name: 'Read' }] },
  }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-14T12:00:07.000Z',
    message: {
      content: [
        { type: 'tool_use', name: 'Bash' },
        { type: 'text', text: 'Running that now.' },
      ],
    },
  }),
  JSON.stringify({ type: 'system', message: { content: 'ignored' } }),
  '',
].join('\n');

test('extractPreview classifies text / tool / empty correctly', function () {
  assert.strictEqual(
    transcript.extractPreview({ message: { content: 'hi' } }).kind,
    'text'
  );
  assert.strictEqual(
    transcript.extractPreview({
      message: { content: [{ type: 'tool_use', name: 'Read' }] },
    }).kind,
    'tool'
  );
  // Text wins even when a tool_use block comes first.
  const both = transcript.extractPreview({
    message: {
      content: [
        { type: 'tool_use', name: 'Bash' },
        { type: 'text', text: 'done' },
      ],
    },
  });
  assert.strictEqual(both.kind, 'text');
  assert.strictEqual(both.preview, 'done');
  assert.strictEqual(
    transcript.extractPreview({ message: { content: [] } }).kind,
    'empty'
  );
});

test('readMessages: tool-only entries are skipped by default', async function () {
  const fixture = path.join(WORK, 'mixed.jsonl');
  fs.writeFileSync(fixture, MIXED_FIXTURE, 'utf8');
  const msgs = await transcript.readMessages(fixture);
  // user + "Hi!" + "Running that now." — the tool-ONLY entry is dropped.
  assert.strictEqual(msgs.length, 3, 'tool-only entry filtered out');
  assert.strictEqual(msgs[0].preview, 'Hello there');
  assert.strictEqual(msgs[1].preview, 'Hi! How can I help?');
  assert.strictEqual(msgs[2].preview, 'Running that now.', 'tool+text kept as text');
  for (const m of msgs) {
    assert.ok(m.preview.indexOf('[tool:') === -1, 'no tool markers in default view');
  }
});

test('readMessages: includeToolCalls=true keeps tool-only entries', async function () {
  const fixture = path.join(WORK, 'mixed2.jsonl');
  fs.writeFileSync(fixture, MIXED_FIXTURE, 'utf8');
  const msgs = await transcript.readMessages(fixture, 200, true);
  assert.strictEqual(msgs.length, 4, 'tool-only entry now included');
  assert.strictEqual(msgs[2].preview, '[tool: Read]');
});

test('readMessages respects the previewLength argument', async function () {
  const fixture = path.join(WORK, 'long.jsonl');
  const longText = 'x'.repeat(500);
  fs.writeFileSync(
    fixture,
    JSON.stringify({
      type: 'user',
      timestamp: '2026-05-14T12:00:01.000Z',
      message: { content: longText },
    }),
    'utf8'
  );
  const msgs = await transcript.readMessages(fixture, 40);
  assert.ok(msgs[0].preview.length <= 40, 'preview trimmed to <= 40 chars');
  assert.ok(msgs[0].preview.endsWith('...'), 'trimmed preview ends with ...');
});

// ── log.js — end-to-end against a real fixture transcript ─────────────────
section('log.js — the /timestamps:log timeline');

// log.js + validateTranscriptPath require the transcript to live inside
// ~/.claude/projects/. Create a throwaway project dir there for the test.
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');
const FIXTURE_PROJECT = path.join(PROJECTS_ROOT, '__timestamps-selftest-' + process.pid);
const FIXTURE_TRANSCRIPT = path.join(FIXTURE_PROJECT, 'selftest.jsonl');

function withFixtureTranscript(run) {
  fs.mkdirSync(FIXTURE_PROJECT, { recursive: true });
  fs.writeFileSync(
    FIXTURE_TRANSCRIPT,
    [
      JSON.stringify({
        type: 'user',
        timestamp: '2026-05-14T09:00:00.000Z',
        message: { content: 'what is the time?' },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-05-14T09:00:04.000Z',
        message: { content: [{ type: 'text', text: 'It is 9am.' }] },
      }),
    ].join('\n'),
    'utf8'
  );
  try {
    return run();
  } finally {
    try {
      fs.rmSync(FIXTURE_PROJECT, { recursive: true, force: true });
    } catch (_) {}
  }
}

function runLog(args, opts) {
  return spawnSync(process.execPath, [LOG].concat(args || []), {
    encoding: 'utf8',
    timeout: 8000,
    cwd: (opts && opts.cwd) || PLUGIN_ROOT,
  });
}

test('log.js renders the "[HH:MM:SS] Name:" timeline from a real transcript', function () {
  withFixtureTranscript(function () {
    const res = runLog(['10', FIXTURE_TRANSCRIPT]);
    assert.strictEqual(res.status, 0, 'log.js exits 0');
    const o = res.stdout;
    assert.ok(o.indexOf('--- Message Timeline ---') !== -1, 'has the header');
    assert.ok(/\[\d\d:\d\d:\d\d\]/.test(o), 'has a [HH:MM:SS] clock');
    assert.ok(/\[\d\d:\d\d:\d\d\] .+:/.test(o), 'has a "[clock] Name:" header line');
    assert.ok(o.indexOf('what is the time?') !== -1, 'shows the user message text');
    assert.ok(o.indexOf('It is 9am.') !== -1, 'shows the assistant message text');
    assert.ok(o.indexOf('Claude:') !== -1, 'assistant labelled "Claude"');
    assert.ok(o.indexOf('2026') !== -1, 'has a date header with the year');
    assert.ok(o.indexOf('Showing 2 of 2 messages.') !== -1, 'has the count footer');
  });
});

test('log.js puts the message text on its own line under the header', function () {
  withFixtureTranscript(function () {
    const res = runLog(['10', FIXTURE_TRANSCRIPT]);
    // The line after a "[clock] Name:" header is the message text itself.
    const lines = res.stdout.split('\n');
    let found = false;
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\[\d\d:\d\d:\d\d\] .+:$/.test(lines[i]) &&
          lines[i + 1] === 'what is the time?') {
        found = true;
        break;
      }
    }
    assert.ok(found, 'message text appears on the line below its header');
  });
});

test('log.js with no transcript anywhere -> exit 0, clean "not found" message', function () {
  const res = runLog([], { cwd: os.tmpdir() });
  assert.strictEqual(res.status, 0);
  assert.ok(
    res.stdout.indexOf('No transcript found') !== -1,
    'reports no transcript cleanly'
  );
});

test('log.js rejects a transcript path outside ~/.claude/projects -> clean message', function () {
  const outside = path.join(WORK, 'outside.jsonl');
  fs.writeFileSync(outside, '{}', 'utf8');
  const res = runLog(['10', outside]);
  assert.strictEqual(res.status, 0);
  assert.ok(
    res.stdout.indexOf('Cannot read transcript') !== -1,
    'rejects the out-of-bounds path cleanly, no crash'
  );
});

test('log.js works invoked through a path containing spaces (Windows reality)', function () {
  // LOG itself lives under "...\\CLAUDE TIMESTAPS\\..." — a path with a space.
  assert.ok(LOG.indexOf(' ') !== -1, 'precondition: plugin path has a space');
  withFixtureTranscript(function () {
    const res = runLog(['5', FIXTURE_TRANSCRIPT]);
    assert.strictEqual(res.status, 0);
    assert.ok(/\[\d\d:\d\d:\d\d\]/.test(res.stdout));
  });
});

// ── statusline.js ─────────────────────────────────────────────────────────
section('extras/statusline.js');

test('statusline.js runs, exits 0, emits a time string', function () {
  const res = spawnSync(process.execPath, [STATUSLINE], {
    input: JSON.stringify({ model: 'claude-opus-4-7', cwd: PLUGIN_ROOT }),
    encoding: 'utf8',
    timeout: 8000,
  });
  assert.strictEqual(res.status, 0, 'statusline exits 0');
  assert.ok(/\d\d:\d\d/.test(res.stdout), 'output contains a HH:MM time');
});

test('statusline.js survives empty stdin -> exit 0', function () {
  const res = spawnSync(process.execPath, [STATUSLINE], {
    input: '',
    encoding: 'utf8',
    timeout: 8000,
  });
  assert.strictEqual(res.status, 0);
});

// ── manifest JSON validity ────────────────────────────────────────────────
section('shipped manifests are valid JSON with required fields');

test('.claude-plugin/plugin.json is valid, kebab-case name, version 2.0.0', function () {
  const p = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.ok(/^[a-z0-9-]+$/.test(p.name), 'name is kebab-case: ' + p.name);
  assert.strictEqual(p.name, 'timestamps');
  assert.strictEqual(p.version, '2.0.0');
});

test('.claude-plugin/marketplace.json is valid with name/owner/plugins', function () {
  const m = JSON.parse(
    fs.readFileSync(
      path.join(PLUGIN_ROOT, '.claude-plugin', 'marketplace.json'),
      'utf8'
    )
  );
  assert.ok(/^[a-z0-9-]+$/.test(m.name), 'marketplace name kebab-case');
  assert.ok(m.owner && typeof m.owner.name === 'string', 'owner.name present');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length === 1, 'one plugin');
  assert.strictEqual(m.plugins[0].name, 'timestamps');
  assert.strictEqual(m.plugins[0].source, './');
});

test('the plugin ships NO hooks (v2.0.0 removed them)', function () {
  assert.ok(
    !fs.existsSync(path.join(PLUGIN_ROOT, 'hooks')),
    'hooks/ directory must not exist'
  );
  const p = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  assert.strictEqual(p.hooks, undefined, 'plugin.json declares no inline hooks');
});

test('config.example.json is valid JSON and normalizes cleanly', function () {
  const c = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, 'config.example.json'), 'utf8')
  );
  delete c._comment;
  const norm = config.normalize(c);
  assert.strictEqual(norm.timeFormat, '24h');
  assert.strictEqual(norm.previewLength, 200);
});

// ── summary ───────────────────────────────────────────────────────────────
console.log('');
console.log('────────────────────────────────────────');
console.log('  ' + passed + ' passed, ' + failed + ' failed');
console.log('────────────────────────────────────────');

try {
  fs.rmSync(WORK, { recursive: true, force: true });
} catch (_) {}

if (failed > 0) {
  console.log('');
  console.log('FAILURES:');
  for (const f of failures) {
    console.log('  - ' + f.name);
  }
  process.exit(1);
}
process.exit(0);
