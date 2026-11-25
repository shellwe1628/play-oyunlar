import { describe, expect, it } from 'vitest';
import { flyArrow, hitParts } from '../../src/sim/arrow';
import { ballisticAt } from '../../src/sim/geom';
import { createRagdoll, PARTS, PT, setPose } from '../../src/sim/ragdoll';
import { stepBody } from '../../src/sim/body';
import { TUNING } from '../../src/sim/tuning';

const DT = 1 / 120;

function standing(): ReturnType<typeof createRagdoll> {
  const b = createRagdoll(400, 500, -1, 1);
  for (let i = 0; i < 240; i++) {
    setPose(b, 400, 500, -1, Math.PI, 0, 1, 0);
    stepBody(b, DT, []);
  }
  return b;
}

describe('arrow flight', () => {
  it('stepping matches the closed-form arc to sub-pixel precision', () => {
    const a = { x: 0, y: 0, vx: 900, vy: -700 };
    for (let i = 0; i < 120; i++) flyArrow(a, DT, TUNING.gravity);
    const exact = ballisticAt(0, 0, 900, -700, TUNING.gravity, 1);
    expect(a.x).toBeCloseTo(exact.x, 6);
    expect(a.y).toBeCloseTo(exact.y, 6);
    expect(a.vy).toBeCloseTo(-700 + TUNING.gravity, 6);
  });
});

describe('hit detection by body part', () => {
  const b = standing();
  const at = (i: number) => ({ x: b.x[i] as number, y: b.y[i] as number });
  const kindAt = (x0: number, y0: number, x1: number, y1: number) => {
    const h = hitParts(b, 1, PARTS, x0, y0, x1, y1);
    return h ? PARTS[h.part]?.kind : null;
  };

  it('finds head, body, arm and leg from several angles', () => {
    const head = at(PT.head);
    const mid = { x: ((b.x[PT.neck] as number) + (b.x[PT.pelvis] as number)) / 2, y: ((b.y[PT.neck] as number) + (b.y[PT.pelvis] as number)) / 2 };
    const shin = { x: ((b.x[PT.kneeB] as number) + (b.x[PT.footB] as number)) / 2, y: ((b.y[PT.kneeB] as number) + (b.y[PT.footB] as number)) / 2 };
    const fore = { x: ((b.x[PT.elbowF] as number) + (b.x[PT.handF] as number)) / 2, y: ((b.y[PT.elbowF] as number) + (b.y[PT.handF] as number)) / 2 };
    for (const ang of [0, 0.4, -0.5, 0.9, -1.1]) {
      const c = Math.cos(ang);
      const s = Math.abs(Math.sin(ang)); // always from above or level
      // from behind (this archer faces left, its arms reach out to the left)
      const thru = (p: { x: number; y: number }) => kindAt(p.x + c * 200, p.y - s * 200, p.x - c * 10, p.y + s * 10);
      expect(thru(head), `head @${ang}`).toBe('head');
      expect(thru(mid), `body @${ang}`).toBe('body');
      // and the head from the front too
      if (ang >= 0) expect(kindAt(head.x - c * 200, head.y - s * 200, head.x, head.y), `head front @${ang}`).toBe('head');
    }
    // limbs from the side they stick out on (from behind the body they would hit the torso first)
    expect(kindAt(fore.x - 300, fore.y - 20, fore.x + 4, fore.y)).toBe('arm');
    expect(kindAt(shin.x - 300, shin.y + 30, shin.x, shin.y)).toBe('leg');
    // a clean miss above the head
    expect(kindAt(head.x - 300, head.y - 60, head.x + 300, head.y - 60)).toBeNull();
  });

  it('a very fast arrow cannot tunnel through a thin limb (one huge step across it)', () => {
    const shin = { x: ((b.x[PT.kneeF] as number) + (b.x[PT.footF] as number)) / 2, y: ((b.y[PT.kneeF] as number) + (b.y[PT.footF] as number)) / 2 };
    for (const speed of [600, 1500, 3000, 8000, 30000]) {
      // one tick of travel at this speed, centred on the limb
      const len = speed * DT;
      const h = hitParts(b, 1, PARTS, shin.x - len / 2, shin.y + 1, shin.x + len / 2, shin.y + 1);
      expect(h, `speed ${speed}`).not.toBeNull();
      expect(PARTS[h!.part]?.kind).toBe('leg');
    }
  });

  it('reports the entry point, not the far side', () => {
    const head = at(PT.head);
    const h = hitParts(b, 1, PARTS, head.x - 300, head.y, head.x + 300, head.y);
    expect(h).not.toBeNull();
    expect(h!.x).toBeCloseTo(head.x - PARTS[0]!.r, 0);
  });
});
