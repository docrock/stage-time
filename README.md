# Stage Time

A stage timer that runs on your own machine, on your own network, with nothing to install
and nobody to pay.

Built because the hosted options want $8 to $20 a month to cap you at five connected
devices, and because every one of them falls over in exactly the venue where you need
them most: a convention hall whose wifi is either hostile or being sold back to you at
5 Mbps.

## Run it

```bash
git clone git@github.com:docrock/stage-time.git
cd stage-time
npm start
```

That is the whole install. **Zero dependencies.** Node standard library only, no build
step, no package downloads. A fresh clone runs on a machine that has never seen the
network, which is the entire point.

Requires Node 20 or newer. Check with `node -v`.

On boot it prints every URL, discovered from the machine it is actually running on:

```
  STAGE TIME  ·  Card Party Dallas — Day 1
  35 sessions loaded from card-party-dallas-day1.json
  ──────────────────────────────────────────────────────────
  Control  (you)         http://192.168.1.44:7373/control
  Rundown  (producer)    http://192.168.1.44:7373/rundown
  Presenter (stage)      http://192.168.1.44:7373/presenter
  Public   (audience)    http://192.168.1.44:7373/public
  Agenda   (green room)  http://192.168.1.44:7373/agenda
  Ecamm / OBS overlay    http://192.168.1.44:7373/presenter?transparent=1&chrome=0
  ──────────────────────────────────────────────────────────
```

Pick a specific show: `node server.js --show shows/card-party-dallas-day2.json`
Pick a port: `node server.js --port 8080`

## The five views

| Route | Who looks at it |
|---|---|
| `/control` | You. Transport, nudges, messages, share links |
| `/rundown` | The producer. Builds and reshuffles the running order |
| `/presenter` | The stage. Giant countdown, up next, your messages |
| `/public` | Audience screen or stream overlay. No private messages |
| `/agenda` | Green room. Whole show at a glance, and whether you are going to make your hard calls |

## For Ecamm and OBS

Drop this into a web widget or browser source:

```
http://<your-ip>:7373/presenter?transparent=1
```

`transparent=1` gives you a genuinely transparent background so the timer keys straight
over your program feed. No black box, no chroma key. Neither EventTimer nor StageTimer
offers this at any price. You keep the session title, the up-next line, and the thin
colour bar along the bottom.

Want the digits and nothing else, for a tight corner of the frame? Add `&chrome=0`.

Every display option is a URL parameter, so one URL is one preset and the widget box is
the whole configuration screen:

| param | what it does |
|---|---|
| `transparent=1` | transparent background for overlays |
| `chrome=0` | timer only, no header or footer |
| `flip=1` | rotate 180° for a mirrored or ceiling-mounted monitor |
| `clock=0` | hide the wall clock |
| `upnext=0` | hide the up-next line |
| `progress=0` | hide the progress bar |
| `title=0` | hide the session title |

## Two people, one show

The producer edits the rundown while you drive the timer. The rule the server enforces:

**An edit that touches the live or next session never applies on its own.** It arrives on
your control screen as a pending change, with the diff spelled out, and one button to arm
it. Everything further down the rundown applies silently so the producer is not pinging
you about slide four.

She works at her pace. You stay the only person who can change what is on stage right now.

## Sessions pinned to the clock

The feature the paid tools cannot express. A rundown item is not always "fifteen minutes,
whenever we get there." Sometimes it is "12:20, because the guest is walking over from a
meet-and-greet and leaving straight after."

```json
{ "title": "Interview: SuperDuperDani", "duration": 900, "pinnedAt": "12:20", "hard": true }
```

`pinnedAt` is a wall-clock start. `hard: true` means it cannot slip. Every view then
projects forward from the live timer and shows you the **slack**: how much room is left
before you blow that constraint. Green when you are fine, amber under two minutes, red
and explicit once you are going to be late. If a hard session is projecting late, the
agenda screen says so across the top in letters you can read from across a green room.

That is the number a technical director actually needs, and no competitor computes it.

## Why the countdown survives a dead laptop

State carries `startedAt` and `remainingAtStart`. Every display does its own arithmetic
from those two numbers, so the network is never in the loop for the count itself. If the
host machine dies mid-session, the stage timer keeps counting correctly on a cached copy
instead of going black in front of four hundred people.

Clocks that disagree are corrected: each client measures its offset against the server on
connect and every minute after, so two Macs whose clocks differ by eight seconds still
show the same timer.

## Networking, worst case first

Assume the venue is hostile. In order of how much to trust them live:

1. **Thunderbolt or Ethernet cable, Mac to Mac.** Zero config, no radio, no DHCP, no venue
   involvement. Rehearse with this one.
2. **A cheap travel router in the kit.** Best when phones and tablets need in too.
3. **macOS Internet Sharing** as an ad-hoc network. Works, but macOS fights you.
4. **Bluetooth PAN.** Do not. A twelve dollar cable beats it on every axis.

Hand other machines the **raw IP**, not the `.local` name. Bonjour resolution is the
flakiest link in the chain and an IP always works.

## Shows are files

A rundown is one JSON file in `shows/`. It travels with the clone, diffs readably in git,
and hands to anyone without an export step. The show file is the document. Last year's
conference is still sitting there when the client rebooks.

Real ones are in there now: `card-party-dallas-day1.json` and `day2.json`, built from
Marielou's run of show.

## The rule that matters most

**Clone it and run it on the show machine before you leave the house, on your own wifi.**
The venue is not where you find out. Especially true when the production machine changes
every few gigs.

## Not built yet

- NDI output. Kept out of the core on purpose: a native module would turn "clone and run"
  into "clone, install build tools, pray." Today's free path is to put a display view
  fullscreen on a second screen and use NDI Screen Capture from the free NDI Tools.
- QR codes for the share links. Type the IP for now.
- Sound cues.
- Saved analytics across shows. Planned versus actual is tracked live and shown on the
  agenda view, but it is not yet written anywhere after the show ends.

## Deliberately not building

Accounts, plans, device caps, device heartbeats, a marketing site. EventTimer counts your
connected devices in order to enforce a paywall. There is no paywall here, so there is no
counter, and no cap.
