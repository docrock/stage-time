# Decision log — Stage Time

Newest first. One line per decision: date, what we decided, why.
- 2026-09-03 — Local-first: Node server on one show Mac, everything else a browser on the LAN. Venue wifi is assumed hostile, so we never depend on it.
- 2026-09-03 — Copy EventTimer's "ship a timestamp, not a tick" sync. Side benefit: stage timer survives the host Mac dying.
- 2026-09-03 — Two operators, split roles. Producer edits the rundown; her changes arrive on Doc's control screen as a pending diff he arms with one click. Nothing touches a live timer without him.
- 2026-09-03 — Adopt the overlays.uno pattern: output URL + separate control page, all display options as URL params. Adds `?transparent=1` for Ecamm/OBS keying.
- 2026-09-03 — Preferred show network: direct Thunderbolt/Ethernet cable between the two Macs. Travel router as backup. Not Bluetooth.
- 2026-09-03 — NDI deferred to its own phase, not v1.

- 2026-09-03 — Project created at `~/Docrock/HQ/projects/stage-time`, own git repo, GitHub `docrock/stage-time` (private). Kept out of the docrock-hq repo so it can ship on its own.
- 2026-09-03 — Portability is a hard requirement: production Mac rotates (Darth Nihilus now, new M5 Ultra Mac Studio inbound). Setup = clone + `npm start`, nothing else.
- 2026-09-03 — Zero runtime dependencies, Node stdlib only, no build step for the server. Reason: needing `npm install` at a venue means needing venue internet, which defeats the whole project. Vendor anything essential.
- 2026-09-03 — No native modules in core; second reason NDI stays an optional separate module.
- 2026-09-03 — Rundowns are plain JSON files in `shows/`, versioned with the repo. The show file is the document; no export step.
- 2026-09-03 — Built v0.1: zero-dep Node server, five views, wall-clock pins with live slack, producer gate, 15 smoke tests. Real Dallas rundowns in `shows/`.
- 2026-09-03 — Push over SSE, not polling. EventTimer's demo polls; SSE is lighter, instant, and still stdlib-only.
- 2026-09-03 — `ST.tick()` pairs requestAnimationFrame with a 250ms interval, because browsers throttle rAF to zero in a hidden window and a backgrounded presenter view would otherwise freeze on a stale number mid-show.
- 2026-09-03 — The progress bar survives `transparent=1` and only disappears under `chrome=0`. On an Ecamm overlay the colour bar is usually the point.
- 2026-09-03 — Applying a pending change writes the show JSON back to disk. The file is the document, so the file is what gets updated.
