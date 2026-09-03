// Shared client runtime. Every view loads this.
//
// Two jobs:
//   1. Keep a live copy of show state over SSE, with an offline fallback.
//   2. Do the countdown arithmetic locally so the display never depends on the
//      network — or on the server still being alive.

export const params = new URLSearchParams(location.search);

export function opt(name, fallback) {
  if (!params.has(name)) return fallback;
  const v = params.get(name);
  if (v === '' || v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v;
}

// ---------------------------------------------------------------------------
// Clock skew. Two Macs whose clocks differ by 8 seconds would otherwise show
// timers 8 seconds apart. Measure the offset against the server and correct.
// ---------------------------------------------------------------------------

let skew = 0;

export function now() {
  return Date.now() + skew;
}

async function measureSkew() {
  try {
    const t0 = Date.now();
    const r = await fetch('/api/time', { cache: 'no-store' });
    const { serverNow } = await r.json();
    const t1 = Date.now();
    const latency = (t1 - t0) / 2;
    skew = serverNow + latency - t1;
  } catch { /* offline: keep whatever we had */ }
}

// ---------------------------------------------------------------------------
// State stream
// ---------------------------------------------------------------------------

const CACHE_KEY = 'stage-time:last-state';

export const store = {
  state: null,
  connected: false,
  listeners: new Set(),
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) fn(this.state, this.connected); },
  set(s) {
    this.state = s;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
    this.emit();
  },
};

export function connect() {
  // Show something instantly from cache — and, if the server is dead, keep showing
  // a still-correct countdown rather than a black screen in front of an audience.
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) store.state = JSON.parse(cached);
  } catch { /* ignore */ }

  measureSkew();
  setInterval(measureSkew, 60000);

  let es;
  const open = () => {
    es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      store.connected = true;
      store.set(JSON.parse(e.data));
    };
    es.onerror = () => {
      store.connected = false;
      store.emit();
      es.close();
      setTimeout(open, 2000);
    };
  };
  open();
  if (store.state) store.emit();
}

export async function command(action, extra = {}) {
  try {
    await fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
  } catch { /* offline — the operator will see the disconnected badge */ }
}

// ---------------------------------------------------------------------------
// Timer maths — the same two numbers, the same arithmetic, on every device.
// ---------------------------------------------------------------------------

export function remaining(state, at = now()) {
  const t = state?.timer;
  if (!t || !t.activeSessionId) return 0;
  if (!t.isRunning) return t.remainingAtStart;
  return t.remainingAtStart - (at - t.startedAt) / 1000;
}

export function activeSession(state) {
  return state?.sessions?.find((s) => s.id === state.timer.activeSessionId) || null;
}

export function nextSession(state) {
  if (!state?.sessions?.length) return null;
  const i = state.sessions.findIndex((s) => s.id === state.timer.activeSessionId);
  if (i === -1) return state.sessions.find((s) => !s.done) || null;
  return state.sessions[i + 1] || null;
}

// running | warning | danger | over
export function phase(state, at = now()) {
  const s = activeSession(state);
  if (!s) return 'idle';
  const rem = remaining(state, at);
  if (rem <= 0) return 'over';
  if (rem <= (s.wrapUp?.red ?? 30)) return 'danger';
  if (rem <= (s.wrapUp?.yellow ?? 120)) return 'warning';
  return 'running';
}

export function fmtClock(seconds) {
  const neg = seconds < 0;
  let s = Math.floor(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n) => String(n).padStart(2, '0');
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return (neg ? '-' : '') + body;
}

export function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function fmtTimeOfDay(epoch) {
  return new Date(epoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Drive a callback every animation frame, so the digits never visibly stutter.
//
// The interval underneath is not redundant. Browsers throttle requestAnimationFrame to
// a full stop when a window is occluded or backgrounded, which on a live show means a
// presenter view buried behind other windows freezes on a stale number until someone
// clicks it. The interval keeps it correct while hidden, and we force one more render
// the moment it becomes visible again.
export function tick(fn) {
  let raf;
  const loop = () => { fn(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  const safety = setInterval(() => { if (document.hidden) fn(); }, 250);
  const onVisible = () => { if (!document.hidden) fn(); };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(safety);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// Apply ?transparent=1 / ?chrome=0 / ?theme= before first paint.
export function applyChrome() {
  if (opt('transparent', false)) document.documentElement.classList.add('transparent');
  if (opt('chrome', true) === false) document.documentElement.classList.add('no-chrome');
  const flip = opt('flip', false);
  if (flip) document.documentElement.classList.add('flip');
}
