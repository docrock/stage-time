#!/usr/bin/env node
// Smoke tests. No framework, same reason there are no dependencies anywhere else.
// Run with: node test/run.js

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as S from '../lib/state.js';
import * as P from '../lib/persist.js';
import { diffSessions, protectedSessionIds } from '../lib/diff.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
  }
}

const show = () => ({
  title: 'Test',
  sessions: [
    { id: 'a', title: 'Open', duration: 600 },
    { id: 'b', title: 'Interview', duration: 900, pinnedAt: '12:20', hard: true },
    { id: 'c', title: 'Game', duration: 300 },
    { id: 'd', title: 'Close', duration: 60 },
  ],
});

console.log('\nstate');

test('countdown is derived from startedAt, never ticked', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const t0 = 1_000_000_000_000;
  S.start(st, t0);
  assert.equal(Math.round(S.remainingNow(st, t0)), 600);
  assert.equal(Math.round(S.remainingNow(st, t0 + 90_000)), 510);
  // The server did nothing in between. That is the point.
});

test('pause freezes, resume continues from where it stopped', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const t0 = 1_000_000_000_000;
  S.start(st, t0);
  S.pause(st, t0 + 100_000);
  assert.equal(Math.round(S.remainingNow(st, t0 + 500_000)), 500, 'paused clock must not drift');
  S.start(st, t0 + 500_000);
  assert.equal(Math.round(S.remainingNow(st, t0 + 560_000)), 440);
});

test('overrun keeps counting negative instead of clamping', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'd');
  const t0 = 1_000_000_000_000;
  S.start(st, t0);
  assert.equal(Math.round(S.remainingNow(st, t0 + 90_000)), -30);
});

test('adjust adds time to a running clock without a jump', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const t0 = 1_000_000_000_000;
  S.start(st, t0);
  S.adjust(st, 60, t0 + 60_000);
  assert.equal(Math.round(S.remainingNow(st, t0 + 60_000)), 600);
});

test('advance records planned versus actual', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const t0 = 1_000_000_000_000;
  S.start(st, t0);
  S.advance(st, t0 + 660_000); // ran a minute long
  const a = st.sessions.find((s) => s.id === 'a');
  assert.equal(a.done, true);
  assert.equal(a.actualDuration, 660);
  assert.equal(st.timer.activeSessionId, 'b');
});

console.log('\nwall-clock pins');

test('slack is positive when there is room', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const noon = S.pinnedAtToEpoch('12:00');
  S.start(st, noon); // 'a' runs 10 min, so 'b' projects to start at 12:10
  const proj = S.projectSchedule(st, noon);
  const b = proj.find((p) => p.id === 'b');
  assert.equal(b.slackSeconds, 600, 'pinned 12:20, projected 12:10, so 10 minutes of room');
});

test('slack goes negative once the show is going to be late', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const noon = S.pinnedAtToEpoch('12:00');
  S.start(st, noon);
  S.adjust(st, 900, noon); // gave the opener 15 extra minutes
  const proj = S.projectSchedule(st, noon);
  const b = proj.find((p) => p.id === 'b');
  assert.equal(b.slackSeconds, -300, 'projected 12:25 against a 12:20 pin is 5 minutes late');
  assert.equal(b.hard, true, 'and it is a hard constraint, so this is the loud case');
});

test('pinnedAt parses to today at that local time', () => {
  const e = S.pinnedAtToEpoch('12:20');
  const d = new Date(e);
  assert.equal(d.getHours(), 12);
  assert.equal(d.getMinutes(), 20);
});

console.log('\nproducer gate');

test('live and next sessions are protected', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const ids = protectedSessionIds(st);
  assert.ok(ids.has('a'), 'live session is protected');
  assert.ok(ids.has('b'), 'next session is protected');
  assert.ok(!ids.has('c'), 'anything further down is fair game');
});

test('an edit to a far-away session is not guarded', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const proposed = st.sessions.map((s) => (s.id === 'c' ? { ...s, duration: 420 } : s));
  const changes = diffSessions(st.sessions, proposed, protectedSessionIds(st));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].guarded, false, 'must apply immediately, producer should not have to wait');
});

test('an edit to the live session IS guarded', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const proposed = st.sessions.map((s) => (s.id === 'a' ? { ...s, duration: 1200 } : s));
  const changes = diffSessions(st.sessions, proposed, protectedSessionIds(st));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].guarded, true, 'a producer must never yank a running timer');
});

test('reordering while live is guarded', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const proposed = [st.sessions[0], st.sessions[2], st.sessions[1], st.sessions[3]];
  const changes = diffSessions(st.sessions, proposed, protectedSessionIds(st));
  assert.ok(changes.some((c) => c.kind === 'reorder' && c.guarded), 'moving the next item must wait');
});

test('change summaries read like English', () => {
  const st = S.makeState(show());
  const proposed = st.sessions.map((s) => (s.id === 'c' ? { ...s, duration: 420 } : s));
  const changes = diffSessions(st.sessions, proposed, new Set());
  assert.equal(changes[0].summary, '"Game" duration: 5m → 7m');
});

console.log('\ncrash survival');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-time-test-'));

test('a running timer resumes still running, having lost the downtime', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const t0 = Date.now();
  S.start(st, t0);

  const snap = P.snapshot(st, 'test.json');
  // Process dies. Two minutes pass. Meanwhile every display has been counting down
  // from its own cached copy, so the server must come back in step with them.
  const fresh = S.makeState(show());
  P.restore(fresh, snap);

  assert.equal(fresh.timer.isRunning, true);
  assert.equal(fresh.timer.activeSessionId, 'a');
  assert.equal(Math.round(S.remainingNow(fresh, t0 + 120_000)), 480, 'the clock kept running');
});

test('done flags and actual durations survive', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'a');
  const t0 = Date.now();
  S.start(st, t0);
  S.advance(st, t0 + 660_000);

  const fresh = S.makeState(show());
  P.restore(fresh, P.snapshot(st, 'test.json'));
  const a = fresh.sessions.find((s) => s.id === 'a');
  assert.equal(a.done, true);
  assert.equal(a.actualDuration, 660);
});

test('a parked producer batch survives a restart', () => {
  const st = S.makeState(show());
  st.pending = { by: 'Marielou', at: Date.now(), changes: [{ summary: 'x', guarded: true }], sessions: [] };
  const fresh = S.makeState(show());
  P.restore(fresh, P.snapshot(st, 'test.json'));
  assert.equal(fresh.pending.by, 'Marielou', 'her work must not vanish because the server blinked');
});

test('a session deleted from the show file while down is not resurrected', () => {
  const st = S.makeState(show());
  S.selectSession(st, 'c');
  S.start(st);
  const snap = P.snapshot(st, 'test.json');

  const trimmed = show();
  trimmed.sessions = trimmed.sessions.filter((s) => s.id !== 'c');
  const fresh = S.makeState(trimmed);
  const { droppedActive } = P.restore(fresh, snap);

  assert.equal(droppedActive, true);
  assert.equal(fresh.timer.activeSessionId, null);
  assert.equal(fresh.timer.isRunning, false, 'never resume onto a session that no longer exists');
});

test('yesterday\'s show does not walk back in', () => {
  const dir = path.join(TMP, 'stale');
  const w = P.createWriter(dir);
  const st = S.makeState(show());
  w.save(st, 'test.json');
  w.flush();

  const dayLater = Date.now() + 26 * 3600_000;
  const r = P.read(dir, { maxAgeHours: 12, now: dayLater });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'stale');
});

test('a recent snapshot reads back', () => {
  const dir = path.join(TMP, 'recent');
  const w = P.createWriter(dir);
  const st = S.makeState(show());
  S.selectSession(st, 'b');
  S.start(st);
  w.save(st, 'test.json');
  w.flush();

  const r = P.read(dir);
  assert.equal(r.ok, true);
  assert.equal(r.snap.showFile, 'test.json');
  assert.equal(r.snap.timer.activeSessionId, 'b');
});

test('missing and corrupt snapshots fail safely', () => {
  assert.equal(P.read(path.join(TMP, 'nothing-here')).reason, 'none');
  const dir = path.join(TMP, 'corrupt');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), '{ this is not json');
  assert.equal(P.read(dir).reason, 'unreadable');
});

test('writes are atomic, so a crash mid-write cannot poison the next boot', () => {
  const dir = path.join(TMP, 'atomic');
  const w = P.createWriter(dir);
  const st = S.makeState(show());
  for (let i = 0; i < 20; i++) {
    S.adjust(st, 1);
    w.save(st, 'test.json');
  }
  w.flush();
  assert.equal(fs.existsSync(path.join(dir, 'state.json.tmp')), false, 'no temp file left behind');
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')));
});

console.log('\nreal show files');

for (const file of fs.readdirSync(path.join(ROOT, 'shows')).filter((f) => f.endsWith('.json'))) {
  test(`${file} loads and every pin is reachable in order`, () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'shows', file), 'utf8'));
    const st = S.makeState(raw);
    assert.ok(st.sessions.length > 0, 'has sessions');

    const ids = new Set();
    for (const s of st.sessions) {
      assert.ok(!ids.has(s.id), `duplicate session id ${s.id}`);
      ids.add(s.id);
      assert.ok(s.duration > 0, `${s.title} needs a duration`);
      if (s.pinnedAt) assert.ok(S.pinnedAtToEpoch(s.pinnedAt) !== null, `bad pinnedAt on ${s.title}`);
    }

    // Walk the rundown from the first pin and confirm the plan is internally
    // consistent: nothing pinned should be unreachable before its own start time.
    const pins = st.sessions.filter((s) => s.pinnedAt);
    if (pins.length > 1) {
      let cursor = S.pinnedAtToEpoch(pins[0].pinnedAt);
      const startIdx = st.sessions.indexOf(pins[0]);
      for (let i = startIdx; i < st.sessions.length; i++) {
        const s = st.sessions[i];
        if (s.pinnedAt) {
          const pin = S.pinnedAtToEpoch(s.pinnedAt);
          const lateBy = Math.round((cursor - pin) / 1000);
          assert.ok(
            lateBy <= 60,
            `${s.title} pinned ${s.pinnedAt} but the plan reaches it ${Math.round(lateBy / 60)}m late`,
          );
          cursor = Math.max(cursor, pin);
        }
        cursor += s.duration * 1000;
      }
    }
  });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
