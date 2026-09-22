// The published schedule: what the outside world was told.
//
// The internal clock and the public clock are not the same document, and treating
// them as one is a mistake that shows up on an audience screen.
//
// A rundown is padded on purpose. When a segment stretches, the producer absorbs it
// by trimming a host-led block or pulling a promo reel. The flexibility is already
// built in, so the published times stay true even while the internal projection is
// drifting. Pushing every internal wobble straight onto a public display would tell
// the audience the show is late when it is not, and would tell them three more times
// before the producer has finished absorbing it.
//
// So public-facing outputs hold the published schedule until a human republishes.
// That republish is the deliberate act: somebody looked at the drift and decided the
// padding could not swallow it.

export function makePublished() {
  return { at: null, times: {} };
}

// Snapshot the schedule as it currently projects, and call that the published truth.
export function publish(state, projectSchedule, now = Date.now()) {
  const times = {};
  const active = state.sessions.find((s) => s.id === state.timer.activeSessionId);
  if (active) times[active.id] = now;
  for (const p of projectSchedule(state, now)) times[p.id] = p.projectedStart;
  state.published = { at: now, times };
  return state.published;
}

export function publishedStart(state, sessionId) {
  return state.published?.times?.[sessionId] ?? null;
}

// How far the live projection has wandered from what was published, in seconds.
// Positive means running late. Measured against the next session that has not yet
// happened, because that is the one an audience is waiting on.
export function drift(state, projectSchedule, now = Date.now()) {
  if (!state.published?.at) return null;
  const proj = projectSchedule(state, now);
  for (const p of proj) {
    const pub = state.published.times[p.id];
    if (pub == null) continue;
    return {
      sessionId: p.id,
      seconds: Math.round((p.projectedStart - pub) / 1000),
      publishedStart: pub,
      projectedStart: p.projectedStart,
    };
  }
  return null;
}

// Which clock a view should use.
//
//   live      - follow the internal projection, drift and all
//   published - hold what the outside world was told
//
// A URL parameter always wins, so a single output can be pinned either way without
// touching the operator's settings. Otherwise public-facing outputs hold the
// published schedule and internal ones follow live, because the green room wants the
// truth and the lobby wants the plan.
export function timeSource({ param, publicFacing, followLive, hasPublished }) {
  if (param === 'live' || param === 'published') return param;
  if (!publicFacing) return 'live';
  if (followLive) return 'live';
  return hasPublished ? 'published' : 'live';
}
