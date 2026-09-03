# Stage Time — architecture

Decided 2026-09-03, after studying EventTimer and the overlays.uno control model.

## The shape of it

**Local-first.** One Mac on the show runs a small Node server. Everything else — control
screens, stage displays, Ecamm widgets, phones — is a browser pointed at that machine over
the local network. No cloud, no account, no internet. Convention-hall wifi can be as bad as
it wants; we never touch it.

```
        ┌──────────────────────────────────────────┐
        │  HOST MAC — stage-time server (Node)      │
        │  holds the show state, serves every view  │
        └──────────────────────────────────────────┘
                          │  LAN / direct cable
   ┌──────────────┬───────┴───────┬──────────────┬─────────────┐
   │              │               │              │             │
Doc control   Producer edit   Stage display   Ecamm widget   Phone
/control      /rundown        /presenter      /presenter     /control
                                              ?transparent=1
```

## Routes

| Route | Who | What |
|---|---|---|
| `/control` | Doc | Transport: start, pause, reset, next, ±time, messages |
| `/rundown` | Marielou | Build and reorder the show, edit durations and titles |
| `/presenter` | Stage | Giant countdown, up-next, messages |
| `/public` | Audience / stream | Same, minus messages |
| `/agenda` | Green room / backstage | Full rundown, live row, whole-event remaining |

Every display option is a URL parameter, uno-style, so one URL is one preset and the Ecamm
widget box is the entire configuration UI. `?transparent=1` keys the timer straight over the
program feed — the thing neither EventTimer nor StageTimer offers.

## The two rules that make it robust

**1. Ship a timestamp, not a tick.** Lifted from EventTimer, and it's the right call. State
carries `startedAt` (epoch ms) and `remainingTime`. Every client computes
`remaining = remainingTime - (now - startedAt)` locally at frame rate.

The consequence worth caring about: **if the host Mac dies mid-session, the stage timer keeps
counting.** The display isn't being fed numbers, it's doing arithmetic from two it already
has. That plus a `localStorage` cache of last-known state means a dead server degrades to a
still-correct stage clock instead of a black screen in front of 400 people.

Clock skew between machines is the one caveat — a Mac whose clock is off by 8 seconds shows a
timer off by 8 seconds. Fix: on connect, each client measures its offset from the host and
applies it. Standard NTP-style trick, a dozen lines.

**2. A producer's edit must never yank a running timer.** This is the actual design problem in
a two-operator show, and it's the thing Doc asked for.

Marielou edits on `/rundown`. Her changes land on Doc's `/control` as a **pending change
banner** — "Marielou moved Q&A before Demo · 3 changes" — with the diff visible and one button
to accept. Nothing about the running timer moves until Doc clicks.

Exception: edits to a session that isn't live and isn't next can apply silently, because there's
no way for them to bite. Everything touching the current or next item waits for Doc.

That split is the whole feature. Marielou keeps working at her pace, Doc stays the only person
who can change what's on stage right now.

## Networking, worst case first

Venue wifi is assumed hostile or absent. In order of how much I'd trust them live:

1. **Thunderbolt or Ethernet cable between the two Macs.** Zero config — macOS self-assigns
   link-local addresses and Bonjour resolves `hostname.local`. Nothing to break, no radio,
   no DHCP server, no venue involvement. This is the one to rehearse with.
2. **A cheap travel router in the kit.** Both Macs plus any phone or tablet join it. Best
   option when more than two devices need in.
3. **macOS Internet Sharing as an ad-hoc network** from the host Mac. Works, but macOS has
   been progressively hostile to it, and it fights with the Mac's own wifi.
4. **Bluetooth PAN.** Technically possible. Don't. Bandwidth and stability are not worth the
   trouble on a live show, and the payload is tiny anyway — a cable is strictly better.

Access is by URL: `http://<host>.local:7373/presenter`. Print the QR codes for the show file
and stick them to the console.

## Portability: the repo is the install

The host is not a machine, it's whichever Mac has this repo running that week. Doc's
production machine rotates — right now it's Darth Nihilus, a new M5 Ultra Mac Studio is
inbound to displace Max Rebo, and the show machine changes with the gig. So the setup story
has to be:

```
git clone git@github.com:docrock/stage-time.git
cd stage-time
npm start
```

That's it. Which forces a few rules on us:

**Zero runtime dependencies.** Node's standard library only — `http`, `fs`, `path`. No
Express, no framework, no build step for the server. This is not minimalism for its own sake:
if setup requires `npm install`, then setting up at a venue requires a working internet
connection, and the entire premise of this project is that the venue's internet is garbage or
absent. A fresh clone must run on a machine that has never seen the network. Anything we
genuinely need gets vendored into the repo.

**No native modules in core.** A compiled addon turns "clone and run" into "clone, install
build tools, pray." That's the second reason NDI lives in its own optional module — a plain
clone must never fail because of a thing most shows won't use.

**Nothing hardcoded about the machine.** No baked hostnames or IPs. On boot the server finds
its own LAN addresses and prints the full set of URLs plus QR codes to the terminal:

```
Stage Time running.
  Control    http://Darth-Nihilus-2.local:7373/control
             http://192.168.1.44:7373/control
  Presenter  http://192.168.1.44:7373/presenter
  Ecamm      http://192.168.1.44:7373/presenter?transparent=1
```

Both the Bonjour name and the raw IP, because `.local` resolution is the flakiest link in the
chain and a raw IP always works.

**Shows are portable files.** A rundown is one JSON file in `shows/`. It travels with the
clone, diffs readably in git, and can be handed to Marielou or pulled onto a different
machine without an export step. The show file *is* the document.

**Pin the Node version.** `.nvmrc` and an engines field, so a machine with an ancient or
bleeding-edge Node fails loudly at setup instead of weirdly at showtime.

Rehearsal rule that follows from all this: clone it onto the show machine and run it *before*
you leave the house, on your own wifi. The venue is not where you find out.

## Build order

1. Server plus state model, one `/presenter` view, transparent mode. → useful in Ecamm alone.
2. `/control` with transport and rundown, `/public`, `/agenda`.
3. Live sync across machines, then the pending-change flow for the second operator.
4. Messages, sound cues, wrap-up colour thresholds.
5. Session analytics — planned vs actual, who ran long.
6. NDI, scoped on its own. See notes in the teardown doc; the free path is NDI Screen
   Capture pointed at a fullscreen view, the real path is a native helper.

## Deliberately not building

Accounts, plans, device caps, device heartbeats, a marketing site, SEO landing pages. The
device counter in EventTimer exists to enforce a paywall we don't have.
