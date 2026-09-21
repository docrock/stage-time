# Stage Time — TODO

Ordered by what would hurt most on a show day. Reasoning lives in `docs/dev-plan.md`.

## Now — before the next show

- [ ] **Two-Mac rehearsal on a real network.** The producer gate has only ever been tested by
      one process talking to itself. Doc on `/control`, Marielou on `/rundown`, edits landing
      as pending, arming them live. Do this at home, not at a venue.
- [ ] **Real trackpad drag and drop** in `/rundown`. Built and reviewed, never actually dragged.
- [ ] **Bulletproof the Ecamm link.** Make the control page's Copy button emit an explicit
      `http://` plus the raw LAN IP, never `.local`. This is the exact failure from Sept 20.
- [ ] **Producer override.** Marielou needs a way to take transport when Doc is tied up in
      audio. Decided 2026-09-20. This is a permission model, not a button: roles, a visible
      "who has the con" indicator, and a handoff that cannot leave both of them thinking the
      other has it. Design it before building it.
- [ ] **Tailscale.** Up on Darth Nihilus as of 2026-09-20. Still to add: Max Rebo and the
      iPhone 18 Pro Max. Then confirm `/control` reaches the local server from the phone on
      cellular, and that on-site it routes over the LAN rather than out to the internet.

## Before any public URL exists

- [ ] **Access codes on `/control` and `/rundown`.** There is zero authentication today. Fine
      on a LAN, unacceptable the moment the app is reachable from outside the room. Display
      views stay open.
- [ ] Flag to bind the server to one interface instead of every network the Mac is on.
- [ ] Pick a home for a demo instance if we want one. Fly.io or a small VPS (persistent
      process). Not Vercel or Netlify: serverless cannot hold a running timer in memory.

## Nice to have

- [ ] Sound cues at the yellow and red wrap-up thresholds.
- [ ] QR codes for share links, generated locally, no library, no external service.
- [ ] **Post-show report** written to `shows/reports/`. Planned versus actual is already
      tracked and displayed live, it is just thrown away on exit. This is the feature
      EventTimer charges for and StageTimer does not have at any price.
- [ ] Multi-day shows in one file, so Saturday to Sunday is not a reload.
- [ ] Visual check of the control page at phone width. It was verified by measuring computed
      styles, not by eye.

## Later

- [ ] NDI output as an optional, separate module. Never in core: a native module would break
      clone-and-run. Free path today is NDI Screen Capture pointed at a fullscreen view.

## Done

- [x] Zero-dependency server, state model, SSE push
- [x] Five views: control, rundown, presenter, public, agenda
- [x] Wall-clock pins with live slack and the hard-stop alarm banner
- [x] Producer gate: guarded edits park for the TD, safe edits apply immediately
- [x] Transparent overlay mode for Ecamm and OBS
- [x] Countdown survives a dead server (timestamp maths plus a cached copy)
- [x] Clock-skew correction between machines
- [x] 31 smoke tests, including validating the real Dallas rundowns
- [x] Both Card Party Dallas rundowns built from Marielou's ROS
- [x] Friendly terminal hint when a client tries `https://`
- [x] **Ad-hoc timer.** Presets plus count-up, suspends and restores the live session, shows
      up in the projection so a break visibly costs you slack, never touches the show file.
- [x] **Restart survival.** Atomic snapshot after every change, resume on boot with the same
      show and a still-running clock. Stale, orphaned, and corrupt snapshots all refused.
      Verified against a real `kill -9`.
