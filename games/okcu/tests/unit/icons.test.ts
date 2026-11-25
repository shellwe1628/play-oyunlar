/**
 * Card and upgrade icons (src/scenes/icons.ts, drawn by both builds): every card and every
 * upgrade has one. The frost and blast cards once had none: an empty plate in the card pick.
 */
import { describe, expect, it } from 'vitest';
import { drawCardIcon, drawUpgradeIcon } from '../../src/scenes/icons';
import { CARD_IDS } from '../../src/sim/cards';
import { UPGRADE_IDS } from '../../src/sim/meta';

/** a Graphics that only counts what is drawn into it */
function recorder(): { g: Parameters<typeof drawCardIcon>[0]; drawn: () => number } {
  let n = 0;
  const g: unknown = new Proxy(
    {},
    {
      get: (_t, name) => (..._args: unknown[]) => {
        if (typeof name === 'string' && /^(fill|stroke|line)/.test(name) && !/Style$/.test(name)) n += 1;
        return g;
      },
    },
  );
  return { g: g as Parameters<typeof drawCardIcon>[0], drawn: () => n };
}

describe('icons', () => {
  it('every card has an icon', () => {
    for (const id of CARD_IDS) {
      const r = recorder();
      drawCardIcon(r.g, id, 0, 0);
      expect(r.drawn(), id).toBeGreaterThan(2);
    }
  });

  it('every upgrade has an icon', () => {
    for (const id of UPGRADE_IDS) {
      const r = recorder();
      drawUpgradeIcon(r.g, id, 0, 0);
      expect(r.drawn(), id).toBeGreaterThan(0);
    }
  });
});
