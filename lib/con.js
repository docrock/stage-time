// "The con" — who is currently driving the show.
//
// Two people run these shows. Doc is the TD, but he is also mixing audio and managing
// the stage, and there are stretches where he physically cannot reach the keyboard.
// Marielou needs to be able to take the desk in those moments.
//
// The design rules, and the reasoning, because they are easy to get wrong:
//
// 1. TAKING IS IMMEDIATE, NOT A REQUEST. A request-and-approve flow fails at exactly
//    the moment it is needed: the person you are asking has both hands full. Anyone
//    with an operator console can take the con in one confirmed click.
//
// 2. NOTHING IS SILENT. Every take, hand-off and release is announced on every
//    operator console and stamped with a time.
//
// 3. THE DANGER IS NOT A TUG OF WAR, IT IS AN EMPTY CHAIR. Two people fighting over
//    the timer is loud and self-correcting. Both of them assuming the other one has
//    it, while a segment runs past its wrap, is silent and ruinous. So the holder is
//    stated permanently on screen, and if the holder's console disappears we say so
//    loudly rather than quietly carrying on.
//
// 4. NO AUTOMATIC TRANSFER. When a holder vanishes we surface it and offer one click.
//    A desk that reassigns itself is a desk nobody trusts.
//
// 5. RUNDOWN EDITING IS UNAFFECTED. The producer edits the running order whoever holds
//    the con, and the pending gate is unchanged. Override is about the transport, not
//    about the document.

// Commands that move what the audience and the talent can see. These are the ones the
// con protects. Editing the rundown is deliberately not in this list.
export const TRANSPORT = new Set([
  'select', 'start', 'pause', 'toggle', 'reset', 'adjust', 'next',
  'adhoc', 'endAdhoc',
  'message', 'clearMessage',
  'toggleOption',
  'acceptPending', 'rejectPending',
  'loadShow',
]);

export function isHeld(state) {
  return Boolean(state.con?.holder);
}

export function holds(state, clientId) {
  return Boolean(clientId) && state.con?.holder === clientId;
}

export function take(state, client, now = Date.now()) {
  const prev = state.con?.holder && state.con.holder !== client.id
    ? { id: state.con.holder, name: state.con.name, role: state.con.role }
    : null;
  state.con = {
    holder: client.id,
    name: client.name || 'Operator',
    role: client.role || 'operator',
    since: now,
    takenFrom: prev,
  };
  return prev;
}

export function release(state, clientId) {
  if (!holds(state, clientId)) return false;
  state.con = { holder: null, name: null, role: null, since: null, takenFrom: null };
  return true;
}

// Decide whether a command is allowed through.
//
// Returns { ok } or { ok: false, reason, holder }.
//
//  - Anything that is not transport is always allowed.
//  - An unheld con is claimed by the first identified operator to act, so a solo
//    operator never has to think about any of this.
//  - An unidentified caller (curl, a script) is allowed only while the con is unheld.
//    This is not a security boundary, it is an accident boundary: on a LAN with no
//    auth the point is to stop two humans clobbering each other, not to stop an
//    attacker who is already inside the room.
export function authorize(state, action, client, now = Date.now()) {
  if (!TRANSPORT.has(action)) return { ok: true };

  if (!isHeld(state)) {
    if (client?.id) {
      take(state, client, now);
      return { ok: true, claimed: true };
    }
    return { ok: true };
  }

  if (holds(state, client?.id)) return { ok: true };

  return {
    ok: false,
    reason: client?.id ? 'not-holder' : 'unidentified',
    holder: { id: state.con.holder, name: state.con.name, role: state.con.role },
  };
}

// Is the holder's console still connected? A holder who has closed their laptop is
// the empty-chair case, and the thing every operator screen has to shout about.
export function holderPresent(state, operators) {
  if (!isHeld(state)) return true;
  return operators.some((o) => o.id === state.con.holder);
}
