/**
 * The arena: everything in the world that is not an archer, an arrow or an effect. The parts
 * live under ./arena: the themed backdrop, the ledges (floating islands), the stage objects and
 * the stage modifiers (ceiling, fog, the sliding base's rail).
 */
import { ARENA_THEMES as THEMES } from './arena/themes';
import type { Module, Stage } from '../contract';
import { createBackdrop } from './arena/backdrop';
import { createLedges } from './arena/ledges';
import { createMods } from './arena/mods';
import { createProps } from './arena/props';

export function createArena(stage: Stage): Module {
  const backdrop = createBackdrop(stage.scene);
  const ledges = createLedges(stage.scene);
  const props = createProps(stage.scene);
  const mods = createMods(stage.scene);
  return {
    update({ w, real, time }) {
      const index = Math.max(0, Math.min(THEMES.length - 1, w.theme));
      const th = THEMES[index]!;
      backdrop.update(index, real, w.phase === 'title' ? 0 : w.wind);
      ledges.update(w, th, index, real, time);
      props.update(w, th, index, real, time);
      mods.update(w, th, real, time);
    },
  };
}
