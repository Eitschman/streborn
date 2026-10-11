import { describe, it, expect } from 'vitest';
import { nextStuckBuffering, STUCK_BUFFERING_MS } from './stuckbuffering.js';

// Feed a sequence of [playState, at] polls for one key and collect when it
// reported stuck.
function run(polls, key = 'box#4') {
  let tracker = null;
  const stuckAt = [];
  for (const [ps, at] of polls) {
    const r = nextStuckBuffering(tracker, key, ps, at);
    tracker = r.tracker;
    if (r.stuck) stuckAt.push(at);
  }
  return stuckAt;
}

describe('nextStuckBuffering', () => {
  it('turns into an error after 30 s of continuous buffering, once', () => {
    const polls = [];
    for (let at = 0; at <= 70000; at += 2000) polls.push(['BUFFERING_STATE', at]);
    expect(run(polls)).toEqual([STUCK_BUFFERING_MS]);
  });

  it('stays quiet when the stream starts playing in time', () => {
    expect(run([
      ['BUFFERING_STATE', 0],
      ['BUFFERING_STATE', 20000],
      ['PLAY_STATE', 25000],
      ['PLAY_STATE', 40000],
    ])).toEqual([]);
  });

  it('starts over after the stream played, so a short rebuffer is not stuck', () => {
    expect(run([
      ['BUFFERING_STATE', 0],
      ['PLAY_STATE', 10000],
      ['BUFFERING_STATE', 20000],
      ['BUFFERING_STATE', 45000],
    ])).toEqual([]);
  });

  it('starts over when another key becomes active', () => {
    let r = nextStuckBuffering(null, 'box#4', 'BUFFERING_STATE', 0);
    r = nextStuckBuffering(r.tracker, 'box#2', 'BUFFERING_STATE', 25000);
    r = nextStuckBuffering(r.tracker, 'box#2', 'BUFFERING_STATE', 40000);
    expect(r.stuck).toBe(false);
    r = nextStuckBuffering(r.tracker, 'box#2', 'BUFFERING_STATE', 55000);
    expect(r.stuck).toBe(true);
  });

  it('does nothing without an active key', () => {
    expect(nextStuckBuffering(null, null, 'BUFFERING_STATE', 0)).toEqual({ tracker: null, stuck: false });
  });

  it('ends the episode on stop or standby', () => {
    expect(run([
      ['BUFFERING_STATE', 0],
      ['STOP_STATE', 20000],
      ['BUFFERING_STATE', 25000],
      ['BUFFERING_STATE', 50000],
    ])).toEqual([]);
  });
});
