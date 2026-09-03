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
import { diffSessions, protectedSessionIds } from './lib/diff.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const SHOWS = path.join(ROOT, 'shows');

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = Number(flag('port', process.env.PORT || 7373));
const SHOW_FILE = flag('show', null);

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

if (SHOW_FILE) {
  try {
    loadShow(SHOW_FILE);
  } catch (err) {
    console.error(`Could not load show file ${SHOW_FILE}: ${err.message}`);
    process.exit(1);
  }
} else {
  // Nothing specified — pick the first show file if there is one, so `npm start`
  // on a fresh clone lands somewhere useful instead of an empty screen.
  try {
    const first = fs.readdirSync(SHOWS).filter((f) => f.endsWith('.json')).sort()[0];
    if (first) loadShow(path.join(SHOWS, first));
  } catch { /* no shows dir yet — fine */ }
}

function saveShow() {
  if (!showPath) return;
  const doc = {
    title: state.show.title,
    subtitle: state.show.subtitle,
    date: state.show.date,
    sessions: state.sessions.map((s) => ({
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

function payload() {
  return {
    serverNow: Date.now(),
    revision: state.revision,
    show: state.show,
    sessions: state.sessions,
    timer: state.timer,
    message: state.message,
    pending: state.pending,
    projection: S.projectSchedule(state),
  };
}

function broadcast() {
  state.revision++;
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
    case 'message': S.setMessage(state, body); break;
    case 'clearMessage': S.setMessage(state, { text: '' }); break;
    case 'toggleOption': {
      const k = body.key;
      if (k in state.timer) state.timer[k] = !state.timer[k];
      break;
    }
    case 'acceptPending': {
      if (state.pending) {
        state.sessions = state.pending.sessions.map(S.makeSession);
        // Preserve done-flags and actuals from the live copy where ids still match.
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

// Producer submits the whole rundown. We split it: anything that cannot bite the
// running show is applied immediately; anything that can waits for the TD.
function handleRundown(body) {
  const proposed = (body.sessions || []).map(S.makeSession);
  const guardIds = protectedSessionIds(state);
  const changes = diffSessions(state.sessions, proposed, guardIds);
  if (!changes.length) return { ok: true, applied: 0, pending: 0 };

  const guarded = changes.filter((c) => c.guarded);
  if (guarded.length === 0) {
    const doneById = new Map(state.sessions.map((s) => [s.id, s]));
    state.sessions = proposed.map((p) => {
      const prev = doneById.get(p.id);
      return prev ? { ...p, done: prev.done, actualDuration: prev.actualDuration } : p;
    });
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
    res.write(`data: ${JSON.stringify(payload())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
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
