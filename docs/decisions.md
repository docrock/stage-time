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
- 2026-09-20 — Rejected inverting to web-first with a local cache fallback. Caching solves asset delivery, not coordination between devices; an emergency-only path fails in emergencies; and the local server has to be running for the fallback anyway. Remote access instead comes from tunnelling OUT of local (Tailscale first, Cloudflare Tunnel for public links). A hosted instance is a second deployment of the same code, never a second mode.
- 2026-09-20 — Restart survival shipped. Atomic snapshot after every change; a resumed timer keeps running and absorbs the downtime, because the displays never stopped counting and the server must come back in step with them. Snapshots older than 12h, orphaned, or corrupt are refused.
- 2026-09-20 — Marielou needs producer override: the ability to take transport when Doc is tied up in audio. Moved into Phase 1. It is a permission model with a visible "who has the con", not a button. The failure to design against is both operators thinking the other has it.
- 2026-09-20 — Tailscale is up on Darth Nihilus. Max Rebo and the iPhone still to join.
- 2026-09-20 — Ad-hoc timer lives IN the rundown array rather than as a parallel side timer, inserted immediately before the session it suspends. Every downstream thing then works with no special cases, and crucially the wall-clock projection counts it, so an unplanned break visibly eats slack from the next hard call. A parallel timer would have hidden the one consequence you most need to see. It is excluded from the show file, from planned-versus-actual, and from producer diffs.
- 2026-09-21 — Producer override shipped as "the con". Taking is immediate and confirmed, never a request: the person you would be asking has both hands full, which is the whole reason for the feature. Presence is the SSE connection itself, so a closed laptop stops being a connected operator with no heartbeat plumbing. A holder whose console vanishes raises a loud alarm and the desk never auto-transfers, because the real failure mode is an empty chair, not a tug of war. Rundown editing stays ungated.
