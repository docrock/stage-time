# Teardown: EventTimer's three output views — 2026-09-03

Studied the presenter, public, and agenda views on demo code `DEMOG1EU`, including the
DOM, the CSS technique, and the network traffic underneath them.

## Verdict up front

There is nothing here we can't build. The hard-looking part (huge digits that fill any
screen, perfectly in sync across devices) is two well-known tricks, and I found both.

## How it's actually built

Plain **Vite + React SPA**, Tailwind, Inter as the typeface. One JS bundle
(`/assets/index-*.js`). No framework exotica — not even Next.js.

### Trick 1: the digits scale with CSS container queries, not JavaScript

Each digit is its own `<span>`, sized with:

```
text-[min(34cqw,84cqh)]
```

`cqw`/`cqh` are container-query units — percentages of the container's width and height —
inside a `[container-type:size]` wrapper. `min()` of the two means the digits grow to fill
whatever box you give them and never overflow in either dimension. No resize listeners, no
JS measurement, no font-size math. It just works at any aspect ratio, which is exactly what
you need when the same URL has to look right on a 16:9 confidence monitor, a vertical
lobby screen, and a small Ecamm widget box.

Digits are individually wrapped in `relative overflow-hidden` — that's the setup for a
sliding odometer-style digit animation.

The glow is one Tailwind utility: `drop-shadow-[0_0_30px_hsl(var(--timer-running)/0.5)]`,
where the colour comes from a CSS variable that changes with timer state. That's the entire
warning system — one variable swap drives green → amber → red across every view.

### Trick 2: they don't stream the countdown — they sync a start timestamp

This is the important one. I pulled the API payload directly:

`GET /api/demo-session/DEMOG1EU` returns the **entire** application state:

```json
{
  "sessions": [
    {
      "id": "demo-1",
      "title": "Opening Keynote",
      "duration": 600,
      "timerMode": "countdown",
      "order": 0,
      "speakerName": "Sarah Johnson",
      "description": "Welcome address and event overview",
      "color": "#10B981",
      "wrapUpSettings": {
        "yellow": { "offsetSeconds": 60, "chime": "none", "flashCount": 0 },
        "red":    { "offsetSeconds": 15, "chime": "none", "flashCount": 0 },
        "end":    { "offsetSeconds": 0,  "chime": "none", "flashCount": 0 }
      }
    }
  ],
  "timer": {
    "isRunning": true,
    "activeSessionId": "demo-2",
    "remainingTime": 900,
    "startedAt": 1788461411440,
    "mode": "countdown",
    "autoAdvance": false,
    "showProgressBar": true,
    "showClock": true,
    "clockTimezone": "local",
    "blackoutEnabled": false,
    "showSessionInfo": true
  },
  "message": null,
  "accessCode": "DEMOG1EU"
}
```

Note `startedAt` (epoch ms) alongside `remainingTime`. The server never ticks. Each client
computes `remaining = remainingTime - (now - startedAt)` locally at 60fps. That's why the
views look perfectly synced — they aren't being fed the count, they're each running the same
arithmetic from the same two numbers. Network latency and jitter become irrelevant.

**This is the single most important thing to copy.** It's also why their "50ms WebSocket
sync" marketing is beside the point.

### And they're not even using WebSockets

The network log for the demo shows repeated `GET /api/demo-session/{code}` on a short
interval, plus periodic `POST /api/demo-session/{code}/device` heartbeats (that's how the
connected-device counter works, and how they enforce the device cap). **No WebSocket
connection at all.** Just HTTP polling.

Caveat worth stating plainly: this is demo mode, and the signed-in app may well use real
WebSockets. But the feature page's "WebSocket-powered, every change within 50ms" is not
what the demo does.

## What each view actually shows

| | Presenter | Public | Agenda |
|---|---|---|---|
| Giant digits | ✓ | ✓ | small, on live row only |
| Session title | top | top | per row |
| "UP NEXT" | ✓ | ✓ | NEXT badge |
| Progress bar | bottom edge | bottom edge | top, whole-event |
| Wall clock | ✓ | ✓ | ✓ |
| Event name | — | footer | header |
| Speaker name | — | — | ✓ |
| Description | — | — | ✓ |
| Messages | ✓ | — | — |

**Presenter and public are nearly the same screen.** The real differences are that presenter
receives operator messages and public shows the event name. That's it. Two "views" is
generous marketing for one component with two flags.

**Agenda is the genuinely different one** and the most useful of the three. Full rundown as
a card list: a done row (dimmed, checkmark, "Done"), the live row (highlighted, coloured
left border, LIVE badge, live countdown on the right), and upcoming rows with scheduled
clock times and a NEXT badge. Header carries event name and wall clock; a bar underneath
shows "1 of 3 complete" and "6m 53s remaining" for the whole event. This is the green-room
and backstage screen, and it's the one that would actually help on an Ecamm show.

## What this means for Stage Time

Everything above is a weekend or two of work, not a product moat:

- Digit sizing: solved by three CSS units.
- Sync: solved by shipping a timestamp instead of a tick.
- Views: one timer component plus a config object per view.
- Device counting: a heartbeat POST — which exists mainly to *enforce the paywall*. We have
  no paywall to enforce, so we can drop it entirely. That's their 5-device cap gone.

Where we can be straightforwardly better:

1. **Transparent background mode.** Their views are all black. An Ecamm/OBS overlay wants
   `background: transparent` so the timer keys over the program feed with no chroma work.
   A `?transparent=1` flag costs nothing and they don't offer it.
2. **No device cap, no plan gates, no account.**
3. **Runs on the local machine / LAN.** No internet dependency — the thing both they and
   StageTimer punt to a paid desktop app or a roadmap item.
4. **Layout flags in the URL.** Every display option in that `timer` object could be a query
   param, so one URL is one preset. Ecamm widgets are configured by URL — this makes the
   whole product configurable from the widget box.
