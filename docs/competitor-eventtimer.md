# Study: EventTimer (eventtimer.co) — read 2026-09-03

Browser-based stage timer / event countdown SaaS. Direct competitor to StageTimer.io.
Studied: marketing site, `/us/features`, `/us/compare/vs-stagetimer`, and a hands-on run
through the live no-signup demo at `/demo`.

## What the product actually is

One-sentence version: **a fullscreen countdown you show on stage, controlled remotely from
another device, with a rundown behind it and a way to message the speaker mid-talk.**

Everything is browser-based. No app, no install. The whole thing hangs on one idea:
one event = one code, and that code spawns several different URLs, each showing a
different slice of the same synced state.

### The four views (this is the core architecture)

From the demo, an event code `DEMO5134` produced:

| View | URL | Who it's for |
|---|---|---|
| Controller | `/demo?code=` | Operator — full control panel |
| Presenter | `/demo/presenter?code=` | Stage confidence monitor |
| Public | `/demo/public?code=` | Audience screen / stream overlay |
| Agenda | `/demo/agenda?code=` | Rundown display |

I opened controller and presenter side by side. Started the timer in one, the other was
counting down in lockstep — no visible lag. They claim WebSockets, sub-50ms. Held up.

### What the controller screen has

Three columns:

- **Left — Rundown.** Ordered list of sessions (Opening Keynote 10m, Product Showcase 15m,
  Q&A Panel 5m). Each row: title, duration, mode, plus play / edit / delete. Below it a
  **Connected Devices** panel with a live count against your plan cap. Worth noting: the
  controller itself counts as one of your connected devices. On the free tier that means
  you really get two others.
- **Center — the timer.** Giant digits. Countdown / Clock / Count Up mode switch.
  Start → Pause / Reset / Next Session. Quick nudge buttons: ±1m, ±5m, ±10m — that's the
  panic button when a speaker runs long and you decide to eat it. A "Next: Product Showcase"
  line, a progress bar underneath, and toggles for Auto-advance, Progress bar, Show clock,
  **Blackout Mode**, Session info.
- **Right — Messages to Presenter.** Three severities (Info / Warning / Urgent), text size
  and bold controls, an auto-hide timer in seconds, Send. Under that, the Share Views panel
  with copy buttons and QR codes for each of the four URLs.

### On the presenter screen

Enormous digits, green glow while healthy, session title at top, "UP NEXT: Product Showcase"
underneath, progress bar along the bottom edge. Colour is the whole warning system — it
shifts as you approach and pass zero. Nothing else on screen. That restraint is correct;
a confidence monitor with a busy UI is a confidence monitor nobody reads.

## The feature list

Timer modes (countdown / count-up / time-of-day / scheduled), real-time sync, the multiple
views, session analytics (planned vs actual, overrun tracking, exportable), live colour-coded
messaging, custom branding, scheduled auto-start with session chaining, QR/link sharing,
sound cues, password-protected links, browser-only, phone control.

Integrations are just "it's a URL": OBS browser source, vMix web input, Zoom screen share,
YouTube Live, Twitch.

## Pricing

| | Free | Pro | Premium |
|---|---|---|---|
| Price | $0 | $8/mo billed yearly ($96/yr), or $9.99 monthly | $15/mo billed yearly ($180/yr), or $19.99 monthly |
| Devices | 3 | 5 | 50 |
| Timers | 3 | 50 | 500 |
| Outputs | Public, view only | Private, view + edit | Private, view + edit |
| API | ✕ | ✓ | ✓ |
| CSV | ✕ | ✓ | ✓ |
| Custom logo | ✕ | ✓ | ✓ |
| Custom theming | ✕ | ✕ | ✓ |

The gate that matters: **5 connected devices on the $8 tier.** A real production is easily
controller + stage monitor + FOH + stream machine + a phone in someone's pocket. You hit 5
fast, and the jump to 50 is nearly double the price. That's the squeeze point.

## Their roadmap (stated)

Audience Q&A (Q3 2026), custom output designer (Q3 2026), offline desktop app (Q4 2026),
password-protected links (Q2 2026), flash messages (Q2 2026), advanced analytics (Q4 2026).

Note the dates against today — the two "Almost Ready" Q2 items are already past due, and
the Q3 items have weeks left. Their shipping pace may not match the "we ship fast" claim.

## How they position against StageTimer.io

They run a dedicated comparison page. Their argument: cheaper, session analytics that
StageTimer has at no tier, and try-before-signup. They concede StageTimer wins on the
drag-and-drop custom output designer, NDI output, and a true offline desktop app — and
frame all three as niche broadcast concerns.

They also make a lot of StageTimer's free tier capping at 3 total messages.

## Things worth being skeptical about

Read the site with a cold eye and some of it doesn't hold:

1. **The social proof looks manufactured.** Animated stat counters sit at literal
   "0+ Events Managed / 0% Uptime Guarantee / 0+ Hours Timed / 0+ Countries." The
   testimonial rail repeats the same ten people three times in a loop. Logos include
   Deloitte and Boston University with no case study behind them. "SOC 2 Compliant,"
   "99.9% Uptime SLA," "4.9 on G2 based on 2,847 reviews," and a "View All Reviews on G2"
   button — none verified from the site itself.
2. **Their own pricing contradicts itself.** The pricing section says Pro is $8/mo billed
   yearly at $96/yr. The StageTimer comparison page says Pro is $9.99/mo at $119.88/yr and
   builds its entire "save $60+ a year" math on that number. Two different prices for the
   same plan on the same site.
3. **Roadmap items are marketed as if shipped.** Password-protected links and flash messages
   appear in the feature list and the comparison table as things you get, while the roadmap
   lists them as "Almost Ready, Q2 2026."

None of that means the product is bad — the demo genuinely works and works well. It means
the marketing is running well ahead of the company.

## Read on the opportunity

The engineering here is not exotic. A synced timer over WebSockets with a few view modes is
a weekend-to-a-few-weeks build. What they've actually accumulated is the boring surface
area: CSV import, sound cues, auto-advance chaining, QR sharing, branding, analytics, and a
large pile of SEO landing pages (15+ use-case pages, 6 competitor comparison pages, duration
pages like `/timers/5-minutes`).

Their weak flanks, in order of how much I'd trust them:

- **The device cap.** 5 devices at the paid entry tier is stingy for real productions.
- **Trust.** The fake-looking proof is a liability against anyone who shows real receipts.
- **Offline.** Both they and StageTimer treat it as premium or roadmap. Venues with bad wifi
  are a genuine, recurring pain, and it's a hard problem neither has solved cheaply.
- **The operator, not the buyer.** Everything is built for the person clicking. Nothing is
  built for the speaker who wants to know how they did, or for the producer assembling a
  show across many rooms.
