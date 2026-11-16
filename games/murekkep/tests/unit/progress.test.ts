import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { applyRoundResult, SAVE_DEFAULTS } from '../../src/sim/progress';
import { saveOptions } from '../../src/save';

describe('applyRoundResult', () => {
  it('raises best only on a higher score and counts rounds', () => {
    const d = { ...SAVE_DEFAULTS };
    expect(applyRoundResult(d, 5)).toEqual({ best: 5, newBest: true });
    expect(applyRoundResult(d, 3)).toEqual({ best: 5, newBest: false });
    expect(d).toEqual({ best: 5, rounds: 2 });
  });
  it('a zero score is never a new best', () => {
    expect(applyRoundResult({ ...SAVE_DEFAULTS }, 0).newBest).toBe(false);
  });
});

describe('game save', () => {
  it('persists best score through the versioned store', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => void applyRoundResult(d, 9));
    expect(createSaveStore(saveOptions(storage, 'test')).data.best).toBe(9);
  });
  it('rejects a save whose best is not a number', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { best: 'x', rounds: 1 } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.best).toBe(0);
  });
});
