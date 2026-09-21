#!/usr/bin/env node
// Stage Time — local-first stage timer.
//
// Zero dependencies, Node standard library only. That is deliberate: if setup needed
// `npm install`, setup would need working internet, and hostile venue internet is the
// entire reason this exists. A fresh clone has to run on a machine that has never
// seen the network.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import * as S from './lib/state.js';
import * as P from './lib/persist.js';
import * as C from './lib/con.js';
import { diffSessions, protectedSessionIds } from './lib/diff.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const SHOWS = path.join(ROOT, 'shows');

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function has(name) {
  return args.includes(`--${name}`);
}

const PORT = Number(flag('port', process.env.PORT || 7373));
const SHOW_FILE = flag('show', null);
const FRESH = has('fresh');
const MAX_RESUME_AGE = Number(flag('max-resume-age', P.DEFAULT_MAX_AGE_HOURS));
const RUN_DIR = path.join(ROOT, 'run');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state = S.makeState({ title: 'Untitled Show', sessions: [] });
let showPath = null;

function loadShow(file) {
  const p = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  state = S.makeState(raw);
  showPath = p;
  return raw;
}

// --- boot: which show, and do we resume a crashed session? --------------------

const snapshotRead = FRESH
  ? { ok: false, reason: 'skipped' }
  : P.read(RUN_DIR, { maxAgeHours: MAX_RESUME_AGE });

function firstShowFile() {
  try {
    return fs.readdirSync(SHOWS).filter((f) => f.endsWith('.json')).sort()[0] || null;
  } catch {
    return null;
  }
}

// An explicit --show always wins. Otherwise a plain `npm start` picks up whatever
// was on air when the process died, because that is what you want at 10:15 on a
// show day: the same command, back where you were.
let wanted = SHOW_FILE;
if (!wanted && snapshotRead.ok && snapshotRead.snap.showFile) {
  const candidate = path.join(SHOWS, snapshotRead.snap.showFile);
  if (fs.existsSync(candidate)) wanted = candidate;
}
if (!wanted) {
  const first = firstShowFile();
  if (first) wanted = path.join(SHOWS, first);
}

if (wanted) {
  try {
    loadShow(wanted);
  } catch (err) {
    console.error(`Could not load show file ${wanted}: ${err.message}`);
    process.exit(1);
  }
}

const writer = P.createWriter(RUN_DIR, {
  onError: (err) => console.error(`  ⚠  could not write crash snapshot: ${err.message}`),
});

// What the banner tells the operator about the resume. Being explicit matters:
// silently restoring a live timer is alarming, and silently discarding one is worse.
let resumeNote = null;

if (snapshotRead.ok && showPath && snapshotRead.snap.showFile === path.basename(showPath)) {
  const { droppedActive } = P.restore(state, snapshotRead.snap);
  const gap = Math.round(snapshotRead.ageMs / 1000);
  if (droppedActive) {
    resumeNote = `Resumed, but the session that was on air is no longer in the show file.`;
  } else if (state.timer.activeSessionId) {
    const s = S.sessionById(state, state.timer.activeSessionId);
    const rem = Math.round(S.remainingNow(state));
    const sign = rem < 0 ? '-' : '';
    const mm = String(Math.floor(Math.abs(rem) / 60)).padStart(2, '0');
    const ss = String(Math.abs(rem) % 60).padStart(2, '0');
    resumeNote =
      `Resumed "${s?.title}" ${state.timer.isRunning ? 'still running' : 'paused'} ` +
      `at ${sign}${mm}:${ss}, after ${gap}s down.`;
  } else {
    resumeNote = `Resumed display settings. No session was armed.`;
  }
} else if (snapshotRead.reason === 'stale') {
  const hrs = Math.round(snapshotRead.ageMs / 3600_000);
  resumeNote = `Ignored a snapshot from ${hrs}h ago. Too old to be this show.`;
} else if (snapshotRead.reason === 'unreadable') {
  resumeNote = `Ignored an unreadable snapshot.`;
} else if (snapshotRead.ok) {
  resumeNote = `Ignored a snapshot: it belongs to ${snapshotRead.snap.showFile}.`;
}

function saveShow() {
  if (!showPath) return;
  const doc = {
    title: state.show.title,
    subtitle: state.show.subtitle,
    date: state.show.date,
    // Ad-hoc timers never reach the show file. They were not part of the plan and
    // the plan is what this document records.
    sessions: state.sessions.filter((s) => !s.adhoc).map((s) => ({
      id: s.id,
      title: s.title,
      speaker: s.speaker,
      notes: s.notes,
      duration: s.duration,
      mode: s.mode,
      color: s.color,
      pinnedAt: s.pinnedAt,
      hard: s.hard,
      wrapUp: s.wrapUp,
    })),
  };
  fs.writeFileSync(showPath, JSON.stringify(doc, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Push: server-sent events. One long-lived GET per client, no polling, no
// dependency. EventTimer's own demo polls on a timer; this is both lighter and
// actually instant.
// ---------------------------------------------------------------------------

const clients = new Set();

// Presence is simply "has an open stream". No polling, no heartbeat endpoint: the
// stream drops when a laptop closes or sleeps, which is exactly when we need to know
// that a console is gone.
function operators() {
  const seen = new Map();
  for (const res of clients) {
    const c = res.__client;
    if (!c?.id || !c.operator) continue;
    // One person with two tabs open is one operator.
    if (!seen.has(c.id)) seen.set(c.id, { id: c.id, name: c.name, role: c.role, since: c.since });
  }
  return [...seen.values()];
}

function payload() {
  const ops = operators();
  return {
    serverNow: Date.now(),
    revision: state.revision,
    show: state.show,
    sessions: state.sessions,
    timer: state.timer,
    message: state.message,
    pending: state.pending,
    con: state.con,
    operators: ops,
    // Called out separately so no view has to work it out for itself, and so the
    // empty-chair case is impossible to render by accident as business as usual.
    conHolderPresent: C.holderPresent(state, ops),
    conLog: conLog.slice(-6),
    projection: S.projectSchedule(state),
  };
}

// A short spoken history of the desk, so someone arriving at a console can see what
// just happened rather than only the current state.
const conLog = [];
function logCon(text) {
  conLog.push({ at: Date.now(), text });
  if (conLog.length > 20) conLog.shift();
}

function broadcast() {
  state.revision++;
  writer.save(state, showPath);
  const data = `data: ${JSON.stringify(payload())}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch { clients.delete(res); }
  }
}

setInterval(() => {
  const before = state.message;
  S.expireMessage(state);
  if (before !== state.message) broadcast();
  // Heartbeat keeps proxies and sleeping laptops from silently dropping the stream.
  for (const res of clients) {
    try { res.write(': ping\n\n'); } catch { clients.delete(res); }
  }
}, 10000);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function handleCommand(body) {
  const { action } = body;
  const client = body.client && body.client.id ? body.client : null;

  // Taking the desk is deliberate and immediate. No request-and-approve: the person
  // you would be asking has both hands full, which is the whole reason for this.
  if (action === 'takeCon') {
    if (!client) return { ok: false, error: 'takeCon needs a client' };
    const prev = C.take(state, client);
    logCon(prev ? `${client.name} took the con from ${prev.name}` : `${client.name} took the con`);
    broadcast();
    return { ok: true, con: state.con };
  }
  if (action === 'releaseCon') {
    if (C.release(state, client?.id)) {
      logCon(`${client.name} released the con`);
      broadcast();
    }
    return { ok: true, con: state.con };
  }
  if (action === 'handCon') {
    if (!C.holds(state, client?.id)) return { ok: false, error: 'you do not hold the con' };
    const target = operators().find((o) => o.id === body.toId);
    if (!target) return { ok: false, error: 'that console is not connected' };
    C.take(state, target);
    logCon(`${client.name} handed the con to ${target.name}`);
    broadcast();
    return { ok: true, con: state.con };
  }

  const auth = C.authorize(state, action, client);
  if (!auth.ok) {
    return {
      ok: false,
      error: auth.reason,
      holder: auth.holder,
      message: auth.reason === 'unidentified'
        ? `${auth.holder.name} has the con. Identify this console to take it.`
        : `${auth.holder.name} has the con. Take it first.`,
    };
  }
  if (auth.claimed) logCon(`${client.name} has the con`);

  switch (action) {
    case 'select': S.selectSession(state, body.id); break;
    case 'start': S.start(state); break;
    case 'pause': S.pause(state); break;
    case 'toggle':
      if (state.timer.isRunning) S.pause(state); else S.start(state);
      break;
    case 'reset': S.reset(state); break;
    case 'adjust': S.adjust(state, Number(body.seconds) || 0); break;
    case 'next': S.advance(state); break;
    case 'adhoc':
      S.startAdhoc(state, {
        seconds: Number(body.seconds),
        title: body.title,
        mode: body.mode,
        autostart: body.autostart,
      });
      break;
    case 'endAdhoc': S.endAdhoc(state); break;
    case 'message': S.setMessage(state, body); break;
    case 'clearMessage': S.setMessage(state, { text: '' }); break;
    case 'toggleOption': {
      const k = body.key;
      if (k in state.timer) state.timer[k] = !state.timer[k];
      break;
    }
    case 'acceptPending': {
      if (state.pending) {
        applyRundown(state.pending.sessions.map(S.makeSession));
        state.pending = null;
        saveShow();
      }
      break;
    }
    case 'rejectPending': state.pending = null; break;
    default: return { ok: false, error: `unknown action: ${action}` };
  }
  broadcast();
  return { ok: true };
}

// Swap in a new rundown while keeping the two things the producer's copy cannot
// know about: what has already been played, and any ad-hoc timer running right now.
function applyRundown(next) {
  const adhocs = state.sessions.filter((s) => s.adhoc);
  const prevById = new Map(state.sessions.map((s) => [s.id, s]));

  const merged = next.map((p) => {
    const prev = prevById.get(p.id);
    return prev ? { ...p, done: prev.done, actualDuration: prev.actualDuration } : p;
  });

  // Put each ad-hoc timer back immediately before the session it suspended, matching
  // startAdhoc: that session is coming back, and the time it is still owed has to stay
  // ahead of everything downstream or the projection under-counts.
  for (const a of adhocs) {
    const anchor = a.resume?.sessionId;
    const at = anchor ? merged.findIndex((x) => x.id === anchor) : 0;
    merged.splice(at >= 0 ? at : 0, 0, a);
  }
  state.sessions = merged;
}

// Producer submits the whole rundown. We split it: anything that cannot bite the
// running show is applied immediately; anything that can waits for the TD.
function handleRundown(body) {
  const proposed = (body.sessions || []).map(S.makeSession);
  const guardIds = protectedSessionIds(state);
  // The producer's copy never contains ad-hoc timers, so they must not be diffed
  // against it or every break would read as a deletion.
  const planned = state.sessions.filter((s) => !s.adhoc);
  const changes = diffSessions(planned, proposed, guardIds);
  if (!changes.length) return { ok: true, applied: 0, pending: 0 };

  const guarded = changes.filter((c) => c.guarded);
  if (guarded.length === 0) {
    applyRundown(proposed);
    state.pending = null;
    saveShow();
    broadcast();
    return { ok: true, applied: changes.length, pending: 0 };
  }

  state.pending = {
    by: body.by || 'Producer',
    at: Date.now(),
    changes,
    sessions: proposed,
  };
  broadcast();
  return { ok: true, applied: 0, pending: changes.length };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const VIEWS = {
  '/': 'control.html',
  '/control': 'control.html',
  '/rundown': 'rundown.html',
  '/presenter': 'presenter.html',
  '/public': 'public.html',
  '/agenda': 'agenda.html',
};

function sendJSON(res, obj, code = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(s),
    'cache-control': 'no-store',
  });
  res.end(s);
}

function sendFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p === '/api/state') return sendJSON(res, payload());
  if (p === '/api/time') return sendJSON(res, { serverNow: Date.now() });

  if (p === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    // Identity rides on the stream URL so presence and the stream are the same fact.
    res.__client = {
      id: url.searchParams.get('id') || null,
      name: url.searchParams.get('name') || 'Operator',
      role: url.searchParams.get('role') || 'operator',
      operator: url.searchParams.get('operator') === '1',
      since: Date.now(),
    };
    res.write(`data: ${JSON.stringify(payload())}\n\n`);
    clients.add(res);
    // Tell everyone an operator arrived, not only when one leaves. Without this a
    // returning holder leaves the "their console is gone" alarm standing on the other
    // screens until someone happens to press a button, and a console is missing from
    // its own operator list on first paint.
    if (res.__client.operator && res.__client.id) broadcast();
    req.on('close', () => {
      const was = res.__client;
      clients.delete(res);
      // Losing the holder's console is the empty-chair case. Say so on every screen
      // rather than quietly carrying on as if someone were still driving.
      if (was?.operator && was.id && state.con.holder === was.id) {
        logCon(`${state.con.name} lost connection while holding the con`);
      }
      if (was?.operator) broadcast();
    });
    return;
  }

  if (p === '/api/command' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      return sendJSON(res, handleCommand(body));
    } catch (e) {
      return sendJSON(res, { ok: false, error: e.message }, 400);
    }
  }

  if (p === '/api/rundown' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      return sendJSON(res, handleRundown(body));
    } catch (e) {
      return sendJSON(res, { ok: false, error: e.message }, 400);
    }
  }

  if (p === '/api/shows') {
    let files = [];
    try {
      files = fs.readdirSync(SHOWS).filter((f) => f.endsWith('.json'));
    } catch { /* none */ }
    return sendJSON(res, { files, current: showPath ? path.basename(showPath) : null });
  }

  if (p === '/api/load' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      // Loading a show resets the timer, so it belongs to whoever holds the con.
      const auth = C.authorize(state, 'loadShow', body.client?.id ? body.client : null);
      if (!auth.ok) return sendJSON(res, { ok: false, error: auth.reason, holder: auth.holder }, 409);
      const name = path.basename(String(body.file || ''));
      loadShow(path.join(SHOWS, name));
      broadcast();
      return sendJSON(res, { ok: true });
    } catch (e) {
      return sendJSON(res, { ok: false, error: e.message }, 400);
    }
  }

  if (VIEWS[p]) return sendFile(res, path.join(PUBLIC, VIEWS[p]));

  // Static assets, path-traversal guarded.
  const safe = path.normalize(path.join(PUBLIC, p));
  if (!safe.startsWith(PUBLIC)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  return sendFile(res, safe);
});

// Somebody pointed an https:// URL at us. There is no certificate and there never
// will be, so the handshake dies before the request exists and the client reports a
// bare SSL error with no clue what went wrong. Ecamm and OBS both assume https when
// you paste a URL without a scheme, so this happens to real people on show day.
// Catch the TLS ClientHello (first byte 0x16) and say so in plain language.
server.on('clientError', (err, socket) => {
  const tls = err?.rawPacket?.[0] === 0x16;
  if (tls) {
    console.log('\n  ⚠  Something just tried to reach Stage Time over https://');
    console.log('     There is no certificate here. Use http:// instead, and prefer');
    console.log('     the raw IP over the .local name:');
    console.log(`     http://${lanAddresses()[0] || 'localhost'}:${PORT}/presenter?transparent=1\n`);
  }
  if (socket.writable) {
    socket.end(tls ? '' : 'HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  }
  socket.destroy();
});

// ---------------------------------------------------------------------------
// Boot banner. Nothing about the host machine is hardcoded — we discover the LAN
// addresses at start, because the production Mac changes from show to show.
// ---------------------------------------------------------------------------

function lanAddresses() {
  const out = [];
  for (const [, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  const host = os.hostname().replace(/\.local$/, '');
  const ips = lanAddresses();
  const primary = ips[0] || 'localhost';
  const bar = '─'.repeat(58);

  console.log(`\n  STAGE TIME  ·  ${state.show.title}`);
  console.log(`  ${state.sessions.length} sessions loaded${showPath ? ` from ${path.basename(showPath)}` : ''}`);
  if (resumeNote) console.log(`  ↻ ${resumeNote}`);
  console.log(`  ${bar}`);
  const rows = [
    ['Control  (you)', '/control'],
    ['Rundown  (producer)', '/rundown'],
    ['Presenter (stage)', '/presenter'],
    ['Public   (audience)', '/public'],
    ['Agenda   (green room)', '/agenda'],
    ['Ecamm / OBS overlay', '/presenter?transparent=1'],
  ];
  for (const [label, route] of rows) {
    console.log(`  ${label.padEnd(22)} http://${primary}:${PORT}${route}`);
  }
  console.log(`  ${bar}`);
  console.log(`  Bonjour name        http://${host}.local:${PORT}/control`);
  if (ips.length > 1) console.log(`  Other addresses     ${ips.slice(1).join(', ')}`);
  console.log(`\n  Hand the raw IP to other machines. .local resolution is the`);
  console.log(`  flakiest link in the chain and an IP always works.\n`);
});

// Flush the snapshot on the way out, so a deliberate quit is as recoverable as a
// crash. `--fresh` on the next boot is the way to deliberately start clean.
let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (shuttingDown) process.exit(0);
    shuttingDown = true;
    writer.flush();
    console.log('\n  Snapshot saved. Start again to resume, or use --fresh to start clean.\n');
    server.close(() => process.exit(0));
    // Open SSE streams hold the server open, so do not wait on them forever.
    setTimeout(() => process.exit(0), 300).unref();
  });
}
