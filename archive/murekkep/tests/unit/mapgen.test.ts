import { describe, expect, it } from 'vitest';
import { generateMap, neighbours4, START_ROOM } from '../../src/sim/mapgen';

function flood(land: Uint8Array, w: number, h: number, from: number): number {
  const seen = new Uint8Array(land.length);
  const stack = [from];
  seen[from] = 1;
  let n = 0;
  while (stack.length) {
    const c = stack.pop()!;
    n++;
    for (const d of neighbours4(c, w, h)) {
      if (land[d] && !seen[d]) {
        seen[d] = 1;
        stack.push(d);
      }
    }
  }
  return n;
}

const SIZES = [
  { width: 30, height: 42 },
  { width: 48, height: 72 },
];

describe('generateMap', () => {
  it('produces one connected landmass with gaps, for many seeds', () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 40; seed++) {
        const m = generateMap(seed, size, 4);
        let land = 0;
        let first = -1;
        for (let i = 0; i < m.land.length; i++) {
          if (m.land[i]) {
            land++;
            if (first < 0) first = i;
          }
        }
        expect(land).toBe(m.landCount);
        expect(flood(m.land, m.width, m.height, first), `seed ${seed}`).toBe(land);
        const frac = land / (m.width * m.height);
        expect(frac).toBeGreaterThan(0.4);
        expect(frac).toBeLessThan(0.8);
      }
    }
  });

  it('gives every colony a start with room around it, spaced apart', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const colonies of [3, 6]) {
        const m = generateMap(seed, { width: 48, height: 72 }, colonies);
        expect(m.starts).toHaveLength(colonies);
        for (const s of m.starts) {
          const sx = s % m.width;
          const sy = Math.floor(s / m.width);
          for (let dy = -START_ROOM; dy <= START_ROOM; dy++) {
            for (let dx = -START_ROOM; dx <= START_ROOM; dx++) {
              if (dx * dx + dy * dy > START_ROOM * START_ROOM) continue;
              expect(m.land[(sy + dy) * m.width + sx + dx], `seed ${seed} start ${s}`).toBe(1);
            }
          }
        }
        for (let a = 0; a < m.starts.length; a++) {
          for (let b = a + 1; b < m.starts.length; b++) {
            const pa = m.starts[a]!;
            const pb = m.starts[b]!;
            const d = Math.abs((pa % m.width) - (pb % m.width)) + Math.abs(Math.floor(pa / m.width) - Math.floor(pb / m.width));
            expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(10);
          }
        }
      }
    }
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = generateMap(7, { width: 48, height: 72 }, 5);
    const b = generateMap(7, { width: 48, height: 72 }, 5);
    const c = generateMap(8, { width: 48, height: 72 }, 5);
    expect(Array.from(a.land)).toEqual(Array.from(b.land));
    expect(a.starts).toEqual(b.starts);
    expect(Array.from(a.land)).not.toEqual(Array.from(c.land));
  });

  it('never places two starts closer than the minimum gap, even when crowded', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let m;
      try {
        m = generateMap(seed, { width: 18, height: 22 }, 6);
      } catch {
        continue; // refusing a crowded sheet is fine; cramming starts is not
      }
      for (let a = 0; a < m.starts.length; a++) {
        for (let b = a + 1; b < m.starts.length; b++) {
          const pa = m.starts[a]!;
          const pb = m.starts[b]!;
          const d = Math.abs((pa % m.width) - (pb % m.width)) + Math.abs(Math.floor(pa / m.width) - Math.floor(pb / m.width));
          expect(d).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });
});
