# Testing Stage Time

Everything here runs against `shows/demo-creator-summit.json`, a made-up conference with
made-up people. No real event, no real contacts. Use it rather than the live show files.

## Setup

```bash
git clone git@github.com:docrock/stage-time.git
cd stage-time
node server.js --show shows/demo-creator-summit.json --fresh
```

There is nothing to install. If `npm install` ever becomes necessary, that is a bug: the
whole point is that this runs at a venue with no working internet.

Needs Node 20 or newer (`node -v`). The terminal prints every URL when it starts.

`--fresh` ignores any saved state from a previous run. Leave it off when you are
deliberately testing crash recovery.

## The five screens

| URL | Who |
|---|---|
| `/control` | The operator. Transport, messages, share links |
| `/rundown` | The producer. Builds and reorders the show |
| `/presenter` | The stage monitor |
| `/public` | Audience or stream overlay |
| `/agenda` | Green room board |

Open `/control` and `/presenter` side by side to start. That is the core of it.

## What to actually try

Work through these in order. Each one is checking something specific.

### 1. The basics

Arm "Opening Hype Reel", press Start. Watch `/presenter` follow it exactly. Use the nudge
buttons and confirm both screens move together. Let a timer run past zero: it should keep
counting in red with a minus sign, not stop at 00:00.

**Looking for:** any lag between screens, any stutter in the digits, anything that stops
counting when it should not.

### 2. Hard stops and slack

Open `/agenda`. Arm the opener and start it, then add ten or fifteen minutes with the nudge
buttons. Watch the slack to "Interview: Priya Raman" (pinned 11:00, hard) shrink from green
to amber to red, and the alarm banner appear across the top of the agenda board.

**Looking for:** whether you can tell at a glance, from across the room, that the show is
in trouble. That is the entire job of that screen.

### 3. The ad-hoc timer

Mid-segment, hit 5m in the Ad-hoc panel. The stage should show a five minute break and the
running segment should be held. End it and confirm the segment comes back with exactly the
time it had left, not a fresh clock.

**Looking for:** the speaker must not lose a second, and the break should visibly cost you
slack against the hard stops.

### 4. Two people

Open `/rundown` in another browser (or on another machine on the same network, which is the
real test). Give yourself a name.

- Edit a session near the bottom and save. It should apply immediately.
- Edit the session that is live, or the one that is next, and save. It should NOT apply.
  It should land on the operator's `/control` screen as a pending change with the diff
  spelled out and a button to arm it.

**Looking for:** a producer must never be able to yank a running timer by accident.

### 5. Taking the desk

Both consoles show who has the con. Take it from the other one. Confirm the other screen
notices within a second and that its transport controls go dead with an explanation.

Then the important one: **close the browser tab of whoever holds it.** The other console
should go red and say the holder's console is gone. It should offer a button, and it should
never hand the desk over on its own.

**Looking for:** the failure being designed against is both operators assuming the other one
is driving. If that state is ever quiet or ambiguous, that is a bug worth reporting.

### 6. The published schedule

Publish the schedule from `/control`, then run the show long by several minutes.

`/public` should hold the published times and not flinch. `/agenda` should show how far
behind the internal show has drifted. That is deliberate: the rundown is padded, and the
producer absorbs overruns by trimming a host block or pulling a promo reel. The demo show
marks those items FLEX in their notes.

Republish only when the padding genuinely cannot absorb it.

**Looking for:** an audience screen that announces a delay which is about to be absorbed is
worse than useless.

### 7. Crash recovery

With a timer running, kill the server hard:

```bash
pkill -9 -f "node server.js"
```

Then start it again with no arguments:

```bash
node server.js
```

It should come back to the same show and the same session, still running, with the clock
having lost the seconds that actually passed while it was dead.

**Looking for:** anything that comes back wrong, or comes back silently when it should say
what it did.

### 8. In Ecamm or OBS

Add a web widget or browser source pointing at:

```
http://<the IP the terminal printed>:7373/presenter?transparent=1
```

**Type `http://` yourself.** Ecamm assumes `https://` on a pasted URL and the connection
will fail with an SSL error. Use the raw IP, not the `.local` name.

**Looking for:** a genuinely transparent background with no black box behind the digits.

## Known rough edges

Please do not re-report these, they are already on the list:

- Never tested on real phone hardware or in Safari.
- Drag and drop in the rundown editor has not been exercised on a real trackpad.
- No QR codes for the share links yet. Type the IP.
- No sound cues yet.
- Analytics are shown live on `/agenda` but are not saved anywhere after the show ends.
- No NDI output. The free workaround is a display view fullscreen on a second screen with
  NDI Screen Capture.

## Reporting

Open an issue with:

1. Which screen, and which URL including any parameters.
2. What you did, in order.
3. What you expected, and what happened.
4. The terminal output from the server if anything looked wrong there.
5. Browser and OS.

If it happened during a live show, say so. Those go to the top of the list.

## Running the tests

```bash
npm test
```

No framework, no dependencies. Everything should pass before anything is merged.
