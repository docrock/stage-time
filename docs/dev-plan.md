# Stage Time — development plan

Written 2026-09-20. Revisit after the next show.

## Where it stands

v0.1 is built, tested, and running: zero-dependency Node server, five views, SSE push,
wall-clock pins with live slack, the producer gate, 31 smoke tests, and both real Card
Party Dallas rundowns in `shows/`.

What has NOT happened yet: a full rehearsal on two machines over a real network, and any
use under show pressure that we have notes from. Everything below is ordered by that gap.

## The architecture is settled

Local-first, and staying that way. The September 20 discussion considered inverting it:
host everything on the web and cache the show locally as a fallback. Rejected, for
reasons worth keeping written down:

1. **Caching solves asset delivery, not coordination.** A service worker can make the page
   load with no internet. It cannot make five devices agree on what is running. That needs
   a server all of them can reach. Without one, the control screen and the stage display
   become separate islands: the timer keeps counting, but nothing can be changed.
2. **A fallback path that only runs in emergencies does not work in emergencies.** We would
   find its bugs at 10:04 on a Saturday with an audience watching.
3. **The fallback requires the local server to be running anyway.** If it has to be there,
   it should be the primary.

The remote-access need behind that idea is real. The answer is to **tunnel out from local,
not host away and cache back**: keep the local server as the source of truth and expose it
when needed. Tailscale first (private tailnet, works over cellular, and on site it routes
over the LAN so it survives the internet dying). Cloudflare Tunnel when a public link is
needed for a guest or a client.

A hosted instance for demos is fine, but as a **second deployment of the same code**, never
as a second mode of one system.

## Phases

### Phase 1 — trust it on a show day

The point of this phase is that nothing surprises us live. No new features.

- Rehearse two Macs on one network, including the producer gate end to end with a human on
  the other machine. This has only ever been tested by one process talking to itself.
- Real trackpad drag and drop in the rundown editor. Built and code-reviewed, never dragged.
- Make the Ecamm link impossible to get wrong. The September 20 failure was Ecamm silently
  assuming `https://` on a pasted URL. The server now prints a hint, but the Copy button on
  the control page should emit an explicit `http://` plus the raw IP, never the `.local`
  name.
- **Producer override.** Confirmed needed on 2026-09-20. See below.

### Phase 2 — before it is reachable from outside the room

Nothing here matters on a LAN. All of it matters the moment there is a public URL.

- **Access codes on `/control` and `/rundown`.** There is currently no authentication of any
  kind. On your own network that is a feature. On a public URL it means anyone with the link
  can start, stop, and retitle the show while it airs. The display views can stay open.
- Option to bind the server to a specific interface, so it is not listening on every network
  the machine happens to be on.
- Decide what a hosted demo instance is for and where it lives. Fly.io or a small VPS, both
  of which run a persistent process. Not Vercel or Netlify: serverless has no persistent
  memory between invocations, which is exactly what a running timer is.

### Phase 3 — the things that make it nicer than the paid tools

- Sound cues at the wrap-up thresholds.
- QR codes for the share links, generated locally with no library and no external service.
- Post-show report. Planned versus actual is tracked live and shown on the agenda screen but
  is thrown away when the process exits. Write it to `shows/reports/` so a rundown improves
  each time it is used. This is the feature EventTimer charges for and StageTimer does not
  have at any tier.
- Multi-day shows in one file, so switching from Saturday to Sunday is not a reload.

### Phase 4 — NDI

Deliberately last and deliberately separate. A native module turns "clone and run" into
"clone, install build tools, pray," which breaks the one constraint the whole project rests
on. Keep it an optional module that a plain clone never touches.

Free path that works today: put a display view fullscreen on a second screen and use NDI
Screen Capture from NDI Tools.

## Producer override

Answered 2026-09-20: **yes, Marielou needs to be able to take transport when Doc is tied up
in audio.** That changes the model, so it belongs in Phase 1 rather than getting bolted on.

The current design has one correct instinct worth keeping: a producer's edit must never
yank a running timer by accident. Override is not a hole in that, it is the deliberate
version of it. The distinction to build is between *an edit that happens to affect the live
session* and *a person consciously taking the desk*.

Sketch, to be designed properly before any code:

- Roles rather than routes. A person is TD or Producer, and either can hold **the con**.
- One visible "who has the con" indicator on every operator screen. The failure mode to
  design against is not two people fighting over the timer, it is both of them thinking the
  other one has it and nobody starting the next segment.
- Taking the con is explicit and announced: the other console says so immediately and loudly.
  Handing it over is a single action. No silent transfer.
- The pending gate stays exactly as it is for ordinary rundown edits. Override is a separate
  deliberate act, not a way to skip the queue.
- Doc can always take it back. He is the TD.

## Open questions

- v0.1 was **not** used at Card Party Dallas (confirmed 2026-09-20), so there are no show
  notes to fold in. The two-Mac rehearsal in Phase 1 is therefore the first real test this
  software will ever get, which raises its priority rather than lowering it.
