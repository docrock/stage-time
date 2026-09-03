# Decision log — Stage Time

Newest first. One line per decision: date, what we decided, why.
- 2026-09-03 — Local-first: Node server on one show Mac, everything else a browser on the LAN. Venue wifi is assumed hostile, so we never depend on it.
- 2026-09-03 — Copy EventTimer's "ship a timestamp, not a tick" sync. Side benefit: stage timer survives the host Mac dying.
- 2026-09-03 — Two operators, split roles. Producer edits the rundown; her changes arrive on Doc's control screen as a pending diff he arms with one click. Nothing touches a live timer without him.
- 2026-09-03 — Adopt the overlays.uno pattern: output URL + separate control page, all display options as URL params. Adds `?transparent=1` for Ecamm/OBS keying.
- 2026-09-03 — Preferred show network: direct Thunderbolt/Ethernet cable between the two Macs. Travel router as backup. Not Bluetooth.
- 2026-09-03 — NDI deferred to its own phase, not v1.

- 2026-09-03 — Project created at `~/Docrock/HQ/projects/stage-time`, own git repo, GitHub `docrock/stage-time` (private). Kept out of the docrock-hq repo so it can ship on its own.
