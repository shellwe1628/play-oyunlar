import { describe, expect, it } from 'vitest';
import { awayCredit } from '../../src/sim/clock';

const H = 3600_000;

describe('away time (clock farming)', () => {
  it('credits the time since the stored last-seen and moves it forward', () => {
    expect(awayCredit(1000, 1000 + 2 * H)).toEqual({ seconds: 7200, lastSeen: 1000 + 2 * H });
  });

  it('never moves last-seen backwards and pays nothing for a rewound clock', () => {
    const t0 = 100 * H;
    // clock pushed 10 h forward: one capped haul (the cap is the sim's job)
    const a = awayCredit(t0, t0 + 10 * H);
    expect(a.seconds).toBe(36_000);
    // clock set back to real time: nothing, and the stored value stays in the future
    const b = awayCredit(a.lastSeen, t0 + 1 * H);
    expect(b).toEqual({ seconds: 0, lastSeen: t0 + 10 * H });
    // forward again to the same future time: nothing
    expect(awayCredit(b.lastSeen, t0 + 10 * H).seconds).toBe(0);
    // only time beyond the stored value pays
    expect(awayCredit(b.lastSeen, t0 + 11 * H).seconds).toBe(3600);
  });

  it('a first launch (no last-seen) pays nothing', () => {
    expect(awayCredit(0, 5 * H)).toEqual({ seconds: 0, lastSeen: 5 * H });
  });
});
