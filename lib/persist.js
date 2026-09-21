// Crash survival.
//
// The timer lives in memory, which is fine right up until the server dies at 10:15
// with a segment on air. This writes a snapshot beside the repo after every change
// and hands it back on boot.
//
// The important decision is what a restored running timer should do. It keeps
// running, and the clock keeps the time that passed while the process was dead.
// That is not a compromise, it is the truth: the show did not pause, and every
// display has been counting down from its cached copy the whole time. Restoring it
// any other way would put the server out of step with what the stage can already see.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_MAX_AGE_HOURS = 12;

function paths(dir) {
  return {
    dir,
    file: path.join(dir, 'state.json'),
    tmp: path.join(dir, 'state.json.tmp'),
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export function snapshot(state, showFile) {
  return {
    savedAt: Date.now(),
    showFile: showFile ? path.basename(showFile) : null,
    timer: state.timer,
    message: state.message,
    pending: state.pending,
    // Only the per-session facts the operator generated. Titles and durations come
    // from the show file, which is the document and may have been edited since.
    progress: state.sessions
      .filter((s) => s.done || s.actualDuration != null)
      .map((s) => ({ id: s.id, done: s.done, actualDuration: s.actualDuration })),
  };
}

export function createWriter(dir, { onError } = {}) {
  const p = paths(dir);
  let queued = null;
  let timer = null;

  // Atomic: write a temp file then rename over the target, so a crash mid-write
  // cannot leave a half-parsed snapshot that poisons the next boot.
  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!queued) return;
    const data = queued;
    queued = null;
    try {
      fs.mkdirSync(p.dir, { recursive: true });
      fs.writeFileSync(p.tmp, JSON.stringify(data));
      fs.renameSync(p.tmp, p.file);
    } catch (err) {
      // A failed snapshot must never take the show down with it.
      onError?.(err);
    }
  }

  return {
    // Coalesce bursts. Operator actions arrive in clumps and the snapshot is small,
    // but there is no reason to hit the disk four times for one button press.
    save(state, showFile) {
      queued = snapshot(state, showFile);
      if (!timer) timer = setTimeout(flush, 200);
    },
    flush,
    clear() {
      try { fs.rmSync(p.file, { force: true }); } catch { /* nothing to clear */ }
    },
    path: p.file,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Returns { ok: false, reason } or { ok: true, snap, ageMs }.
export function read(dir, { maxAgeHours = DEFAULT_MAX_AGE_HOURS, now = Date.now() } = {}) {
  const p = paths(dir);
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(p.file, 'utf8'));
  } catch (err) {
    return { ok: false, reason: err.code === 'ENOENT' ? 'none' : 'unreadable' };
  }
  if (!snap || typeof snap.savedAt !== 'number' || !snap.timer) {
    return { ok: false, reason: 'unreadable' };
  }
  const ageMs = now - snap.savedAt;
  // Yesterday's show must not walk back in. A stale snapshot is worse than none,
  // because it looks authoritative.
  if (ageMs > maxAgeHours * 3600_000) return { ok: false, reason: 'stale', ageMs, snap };
  if (ageMs < -60_000) return { ok: false, reason: 'future', ageMs, snap };
  return { ok: true, snap, ageMs };
}

// Fold a snapshot back into a fresh state built from the show file.
export function restore(state, snap) {
  state.timer = { ...state.timer, ...snap.timer };
  state.message = snap.message ?? null;
  state.pending = snap.pending ?? null;

  const byId = new Map(state.sessions.map((s) => [s.id, s]));
  for (const p of snap.progress || []) {
    const s = byId.get(p.id);
    // Sessions that no longer exist are skipped rather than resurrected: the show
    // file wins on what the rundown contains.
    if (!s) continue;
    s.done = Boolean(p.done);
    s.actualDuration = p.actualDuration ?? null;
  }

  // If the active session was deleted from the show file while we were down, there
  // is nothing coherent to resume onto.
  if (state.timer.activeSessionId && !byId.has(state.timer.activeSessionId)) {
    state.timer.activeSessionId = null;
    state.timer.isRunning = false;
    state.timer.startedAt = null;
    return { droppedActive: true };
  }
  return { droppedActive: false };
}
