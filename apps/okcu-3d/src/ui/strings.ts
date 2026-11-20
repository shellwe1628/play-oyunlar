/**
 * The 3D build's own texts (its main menu), on top of the game's table (games/okcu/src/strings.ts).
 * English is the source; Turkish must have the same keys (the compiler enforces it).
 */
import { defineStrings } from '@oyun/core/pure';
import { STRINGS } from '@okcu/strings';

const MENU_STRINGS = defineStrings({
  en: {
    'menu.chapterPrev': 'Previous chapter',
    'menu.chapterNext': 'Next chapter',
  },
  tr: {
    'menu.chapterPrev': 'Önceki bölüm',
    'menu.chapterNext': 'Sonraki bölüm',
  },
});

export const APP_STRINGS = {
  en: { ...STRINGS.en, ...MENU_STRINGS.en },
  tr: { ...STRINGS.tr, ...MENU_STRINGS.tr },
};
