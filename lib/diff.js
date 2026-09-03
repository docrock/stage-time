// Producer edits versus live state.
//
// The rule: a producer must never be able to yank the timer out from under the TD
// mid-talk. So we split every incoming rundown into changes that are safe to apply
// right now and changes that have to wait for the TD to arm them.
//
// Safe    = touches only sessions that are neither live nor next.
// Guarded = touches the live session, the next session, or the order of either.

const FIELDS = ['title', 'speaker', 'notes', 'duration', 'mode', 'color', 'pinnedAt', 'hard'];

const LABELS = {
  title: 'title',
  speaker: 'speaker',
  notes: 'notes',
  duration: 'duration',
  mode: 'timer mode',
  color: 'colour',
  pinnedAt: 'pinned start',
  hard: 'hard constraint',
};

function fmt(field, value) {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (field === 'duration') {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  if (field === 'hard') return value ? 'yes' : 'no';
  return String(value);
}

export function diffSessions(current, proposed, protectedIds) {
  const curById = new Map(current.map((s) => [s.id, s]));
  const propById = new Map(proposed.map((s) => [s.id, s]));
  const changes = [];

  for (const p of proposed) {
    const c = curById.get(p.id);
    if (!c) {
      changes.push({
        kind: 'add',
        id: p.id,
        title: p.title,
        summary: `Added "${p.title}"`,
        guarded: false,
      });
      continue;
    }
    for (const f of FIELDS) {
      if (JSON.stringify(c[f]) !== JSON.stringify(p[f])) {
        changes.push({
          kind: 'edit',
          id: p.id,
          field: f,
          from: c[f],
          to: p[f],
          title: c.title,
          summary: `"${c.title}" ${LABELS[f]}: ${fmt(f, c[f])} → ${fmt(f, p[f])}`,
          guarded: protectedIds.has(p.id),
        });
      }
    }
  }

  for (const c of current) {
    if (!propById.has(c.id)) {
      changes.push({
        kind: 'remove',
        id: c.id,
        title: c.title,
        summary: `Removed "${c.title}"`,
        guarded: protectedIds.has(c.id),
      });
    }
  }

  // Reordering is guarded whenever it moves a protected session, or moves anything
  // past one — either way the running show's next item could change.
  const curOrder = current.map((s) => s.id).join(',');
  const propOrder = proposed.map((s) => s.id).filter((id) => curById.has(id)).join(',');
  if (curOrder !== propOrder) {
    const movedProtected = [...protectedIds].some((id) => {
      const a = current.findIndex((s) => s.id === id);
      const b = proposed.findIndex((s) => s.id === id);
      return a !== b;
    });
    changes.push({
      kind: 'reorder',
      summary: 'Rundown order changed',
      guarded: movedProtected || protectedIds.size > 0,
    });
  }

  return changes;
}

// Which sessions are off-limits to a silent edit: whatever is live, plus what's next.
export function protectedSessionIds(state) {
  const ids = new Set();
  const activeIdx = state.sessions.findIndex((s) => s.id === state.timer.activeSessionId);
  if (activeIdx >= 0) {
    ids.add(state.sessions[activeIdx].id);
    const nxt = state.sessions[activeIdx + 1];
    if (nxt) ids.add(nxt.id);
  } else if (state.sessions.length) {
    const firstUndone = state.sessions.find((s) => !s.done);
    if (firstUndone) ids.add(firstUndone.id);
  }
  return ids;
}
