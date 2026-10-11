// A preset key whose stream never starts (#1077).
//
// A stereo pair whose follower could not decode the first frame left the lead
// speaker in BUFFERING_STATE for good, and the active tile said
// "stream starting ..." forever. This decides when that label turns into an
// error: the same key has been BUFFERING continuously for STUCK_BUFFERING_MS
// and never reached PLAY in that stretch. Pure, so the timing is testable.

export const STUCK_BUFFERING_MS = 30000;

// nextStuckBuffering takes the previous tracker (or null), the active key
// (any string naming speaker + slot, or null when no tile is active), the
// speaker's playStatus and the current time. It returns the new tracker and
// whether the key has JUST become stuck (true once per episode, so the caller
// sets its error once instead of on every poll).
export function nextStuckBuffering(prev, key, playState, now) {
  if (!key || playState !== 'BUFFERING_STATE') {
    // Playing, paused, stopped, standby, or no active tile: the episode ends.
    return { tracker: null, stuck: false };
  }
  if (!prev || prev.key !== key) {
    return { tracker: { key, since: now, reported: false }, stuck: false };
  }
  if (!prev.reported && now - prev.since >= STUCK_BUFFERING_MS) {
    return { tracker: { ...prev, reported: true }, stuck: true };
  }
  return { tracker: prev, stuck: false };
}
