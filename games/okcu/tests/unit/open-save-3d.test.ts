import { memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { GAME_ID, openSave } from '../../../../apps/okcu-3d/src/ui/save';
import { freshSave, type SaveData } from '../../src/sim/meta';
import { WEAPON_IDS } from '../../src/sim/weapons';

const KEY = `oyun:${GAME_ID}:save`;

describe('3D openSave', () => {
  it('migrates a v3 save to the arsenal once, writes v4, and never adds a second welcome chest', () => {
    const old = freshSave() as Partial<SaveData>;
    delete old.arsenal;
    Object.assign(old, { best: 44, coins: 50000, bosses: [1, 1, 1, 1, 1, 1], feats: ['forge25'] });
    old.bow = { level: 25, heat: 0, tries: 0 };
    const storage = memoryStorage({ [KEY]: JSON.stringify({ v: 3, data: old }) });

    const a = openSave(storage).data;
    expect(a.arsenal.chests).toEqual(['gold']);
    expect(a.arsenal.weapons.bow.level).toBe(20);
    expect(WEAPON_IDS.every((id) => a.arsenal.weapons[id].owned)).toBe(true);
    expect([a.coins, a.best, a.bow.level]).toEqual([50000, 44, 25]);

    const b = openSave(storage).data;
    expect(b.arsenal.chests).toEqual(['gold']);
    expect(b.arsenal.weapons.bow.level).toBe(20);
    const stored = JSON.parse(storage.getItem(KEY)!) as { v: number; data: SaveData };
    expect(stored.v).toBe(4);
    expect(stored.data.arsenal.migrated).toBe(true);
    expect(stored.data.arsenal.chests).toEqual(['gold']);
  });

  it('a brand-new 3D player gets the bow only and no welcome chest', () => {
    const d = openSave(memoryStorage()).data;
    expect(d.arsenal.chests).toEqual([]);
    expect(WEAPON_IDS.filter((id) => d.arsenal.weapons[id].owned)).toEqual(['bow']);
  });
});
