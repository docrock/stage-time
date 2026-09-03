// Show state: the single source of truth the server holds in memory.
//
// The one rule that matters: we never tick a countdown here. The timer carries
// `startedAt` (epoch ms) and `remainingAtStart` (seconds), and every client does its
// own arithmetic. Network hiccups, GC pauses, and a dead server all stop mattering —
// a display that already has those two numbers keeps counting correctly on its own.

import { randomUUID } from 'node:crypto';

export const DEFAULT_WRAP_UP = { yellow: 120, red: 30 };

export function makeSession(input = {}) {
  return {
    id: input.id || randomUUID().slice(0, 8),
    title: input.title || 'Untitled',
    speaker: input.speaker || '',
    notes: input.notes || '',
    duration: Number.isFinite(input.duration) ? input.duration : 300,
    mode: input.mode || 'countdown', // countdown | countup | clock
    color: input.color || '#6366f1',
    // Wall-clock pin. "12:20" means this segment is supposed to start at 12:20 local.
    // hard:true means it CANNOT slip — the talent is leaving for another commitment.
    // This is the thing EventTimer and StageTimer cannot express at all.
    pinnedAt: input.pinnedAt || null,
    hard: Boolean(input.hard),
    wrapUp: { ...DEFAULT_WRAP_UP, ...(input.wrapUp || {}) },
    done: Boolean(input.done),
    actualDuration: Number.isFinite(input.actualDuration) ? input.actualDuration : null,
  };
}

export function makeState(show = {}) {
  return {
    show: {
      title: show.title || 'Untitled Show',
      subtitle: show.subtitle || '',
      date: show.date || null,
    },
    sessions: (show.sessions || []).map(makeSession),
    timer: {
      isRunning: false,
      activeSessionId: null,
      remainingAtStart: 0,
      startedAt: null,
      elapsedBeforePause: 0,
      mode: 'countdown',
      autoAdvance: false,
      showProgressBar: true,
      showClock: true,
      showSessionInfo: true,
      showUpNext: true,
      blackout: false,
    },
    message: null,
    // Producer edits that touch the live or next session wait here until the TD arms them.
    pending: null,
    revision: 0,
  };
}

// Seconds remaining right now, computed the same way every client computes it.
export function remainingNow(state, now = Date.now()) {
  const t = state.timer;
  if (!t.activeSessionId) return 0;
  if (!t.isRunning) return t.remainingAtStart;
  const elapsed = (now - t.startedAt) / 1000;
  return t.remainingAtStart - elapsed;
}

export function sessionById(state, id) {
  return state.sessions.find((s) => s.id === id) || null;
}

export function indexOfActive(state) {
  return state.sessions.findIndex((s) => s.id === state.timer.activeSessionId);
}

export function nextSession(state) {
  const i = indexOfActive(state);
  if (i === -1) return state.sessions.find((s) => !s.done) || null;
  return state.sessions[i + 1] || null;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export function selectSession(state, id) {
  const s = sessionById(state, id);
  if (!s) return;
  state.timer.activeSessionId = id;
  state.timer.mode = s.mode;
  state.timer.remainingAtStart = s.mode === 'countup' ? 0 : s.duration;
  state.timer.startedAt = null;
  state.timer.isRunning = false;
  state.timer.elapsedBeforePause = 0;
}

export function start(state, now = Date.now()) {
  if (!state.timer.activeSessionId) {
    const first = state.sessions.find((s) => !s.done);
    if (!first) return;
    selectSession(state, first.id);
  }
  if (state.timer.isRunning) return;
  state.timer.isRunning = true;
  state.timer.startedAt = now;
}

export function pause(state, now = Date.now()) {
  if (!state.timer.isRunning) return;
  const rem = remainingNow(state, now);
  state.timer.remainingAtStart = rem;
  state.timer.isRunning = false;
  state.timer.startedAt = null;
}

export function reset(state) {
  const s = sessionById(state, state.timer.activeSessionId);
  state.timer.isRunning = false;
  state.timer.startedAt = null;
  state.timer.remainingAtStart = s ? (s.mode === 'countup' ? 0 : s.duration) : 0;
}

// Nudge the running clock. Positive seconds give the speaker more time.
export function adjust(state, seconds, now = Date.now()) {
  if (state.timer.isRunning) {
    const rem = remainingNow(state, now);
    state.timer.remainingAtStart = rem + seconds;
    state.timer.startedAt = now;
  } else {
    state.timer.remainingAtStart += seconds;
  }
}

export function advance(state, now = Date.now()) {
  const cur = sessionById(state, state.timer.activeSessionId);
  if (cur) {
    cur.done = true;
    const planned = cur.duration;
    const used = planned - remainingNow(state, now);
    cur.actualDuration = Math.max(0, Math.round(used));
  }
  const next = nextSession(state);
  if (!next) {
    state.timer.isRunning = false;
    state.timer.activeSessionId = null;
    return;
  }
  const wasRunning = state.timer.isRunning;
  selectSession(state, next.id);
  if (wasRunning && state.timer.autoAdvance) start(state, now);
}

export function setMessage(state, { text, level = 'info', seconds = 0 }, now = Date.now()) {
  if (!text) {
    state.message = null;
    return;
  }
  state.message = {
    text,
    level, // info | warning | urgent
    at: now,
    expiresAt: seconds > 0 ? now + seconds * 1000 : null,
  };
}

export function expireMessage(state, now = Date.now()) {
  if (state.message?.expiresAt && now >= state.message.expiresAt) state.message = null;
}

// ---------------------------------------------------------------------------
// Wall-clock projection — the bit that makes pinned segments useful.
// Walks forward from the live session and works out when each later one will
// actually start if nothing changes. Compare that against `pinnedAt` and you get
// slack: how much room you have before you blow a hard constraint.
// ---------------------------------------------------------------------------

export function projectSchedule(state, now = Date.now()) {
  const out = [];
  const activeIdx = indexOfActive(state);
  let cursor = now;
  if (activeIdx >= 0) cursor = now + Math.max(0, remainingNow(state, now)) * 1000;

  const startFrom = activeIdx >= 0 ? activeIdx + 1 : 0;
  for (let i = startFrom; i < state.sessions.length; i++) {
    const s = state.sessions[i];
    if (s.done) continue;
    const projectedStart = cursor;
    let slackSeconds = null;
    if (s.pinnedAt) {
      const pinned = pinnedAtToEpoch(s.pinnedAt, now);
      if (pinned != null) slackSeconds = Math.round((pinned - projectedStart) / 1000);
    }
    out.push({ id: s.id, projectedStart, slackSeconds, hard: s.hard, pinnedAt: s.pinnedAt });
    cursor += s.duration * 1000;
  }
  return out;
}

// "12:20" -> epoch ms for that time today, in the server's local timezone.
export function pinnedAtToEpoch(hhmm, now = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}
