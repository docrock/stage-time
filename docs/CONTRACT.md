# Client contract

Everything a view needs to know. The server and `public/st.js` are already written and
are NOT to be modified — build against them.

## Hard rules

- **Zero dependencies.** No npm packages, no CDN links, no external fonts, no build step.
  Plain ES modules loaded with `<script type="module">`. If the venue has no internet the
  page must still render perfectly.
- Import shared helpers from `./st.js`. Load `./st.css` first, then a small view-specific
  `<style>` block in the same HTML file.
- Views are single self-contained `.html` files in `public/`.
- Dark UI. Never assume a light background.
- No em dashes in user-facing copy. Use commas, colons, or separate sentences.

## State shape

`store.state` (also the SSE payload) looks like:

```js
{
  serverNow: 1788470000000,
  revision: 12,
  show: { title, subtitle, date },
  sessions: [{
    id, title, speaker, notes,
    duration,            // seconds, planned
    mode,                // 'countdown' | 'countup' | 'clock'
    color,               // hex
    pinnedAt,            // "12:20" local wall-clock, or null
    hard,                // true = cannot slip, talent leaves for another commitment
    wrapUp: { yellow, red },   // seconds remaining at which the display changes colour
    done,                // finished
    actualDuration       // seconds actually used, once done
  }],
  timer: {
    isRunning, activeSessionId,
    remainingAtStart,    // seconds remaining at the moment `startedAt` was stamped
    startedAt,           // epoch ms, or null when paused
    mode, autoAdvance,
    showProgressBar, showClock, showSessionInfo, showUpNext, blackout
  },
  message: { text, level: 'info'|'warning'|'urgent', at, expiresAt } | null,
  pending: { by, at, changes: [{ kind, summary, guarded, ... }], sessions: [...] } | null,
  projection: [{ id, projectedStart, slackSeconds, hard, pinnedAt }]
}
```

`projection` only covers sessions after the live one. `slackSeconds` is how many seconds
of room remain before a pinned start is missed. Negative means you are already going to
be late.

## API from `st.js`

```js
import * as ST from './st.js';

ST.connect();                       // opens the SSE stream, call once
ST.store.on((state, connected) => {});   // fires on every update
ST.store.state                      // current state, may be a cached copy when offline
ST.now()                            // clock-skew-corrected epoch ms — always use this
ST.remaining(state)                 // seconds left, may be negative when over
ST.phase(state)                     // 'idle'|'running'|'warning'|'danger'|'over'
ST.activeSession(state)
ST.nextSession(state)
ST.fmtClock(seconds)                // "04:31", "1:02:03", "-00:12"
ST.fmtDuration(seconds)             // "6m", "6m 30s"
ST.fmtTimeOfDay(epochMs)            // "12:20 PM"
ST.tick(fn)                         // requestAnimationFrame loop, returns a stop fn
ST.opt('name', fallback)            // URL query parameter, coerces 1/0/true/false
ST.applyChrome()                    // applies ?transparent ?chrome ?flip — call before paint
ST.command(action, extra)           // POST /api/command
```

## Commands

`select {id}`, `start`, `pause`, `toggle`, `reset`, `adjust {seconds}`, `next`,
`message {text, level, seconds}`, `clearMessage`, `toggleOption {key}`,
`acceptPending`, `rejectPending`.

`POST /api/rundown` with `{ sessions: [...], by: 'Marielou' }` submits a whole rundown
from the producer view. The server applies changes that cannot affect the live or next
session immediately, and parks the rest in `state.pending` for the TD to arm.

## Shared CSS you should reuse

`.st-stage .st-timerbox .st-digits .st-progress .st-top .st-bottom .st-message
.st-blackout .st-offline .st-title .st-upnext .st-label .st-clock`
and the primitives `.btn .field .card .pill .muted .dim .mono`.

`.st-digits` already sizes itself with container-query units. Put it inside
`.st-timerbox` and it fills any box on any aspect ratio. Set `data-phase` and
`data-running` on it. Wrap the colon in `<span class="colon">:</span>`.

## URL parameters every display view must honour

| param | effect |
|---|---|
| `transparent=1` | transparent background for Ecamm / OBS browser sources |
| `chrome=0` | hide all header and footer furniture, timer only |
| `flip=1` | rotate 180° for a mirrored or ceiling-mounted monitor |
| `clock=0` | hide the wall clock |
| `upnext=0` | hide the up-next line |
| `progress=0` | hide the progress bar |
| `title=0` | hide the session title |
| `scale=0.8` | multiply digit size |

`applyChrome()` handles `transparent`, `chrome` and `flip`. Handle the rest yourself
with `ST.opt(...)`, and let the operator's `timer.show*` toggles switch things off too:
a thing is visible only if BOTH the URL param and the state toggle allow it.

## Offline behaviour

`store.state` may come from `localStorage` when the server is unreachable. Keep
rendering it. Show `<div class="st-offline">OFFLINE</div>` when the `connected`
argument is false, and hide that badge entirely in `transparent` mode so it never
lands on the program feed.
