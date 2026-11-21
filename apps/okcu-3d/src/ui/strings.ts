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
    // the tabbed main menu (shell.ts)
    'tab.shop': 'Shop',
    'tab.weapons': 'Weapons',
    'tab.home': 'Home',
    'tab.ranks': 'Ranks',
    'tab.events': 'Events',
    'shell.power': 'POWER',
    'shell.recommended': 'Recommended power {n}',
    'shell.easy': 'Easy',
    'shell.tough': 'Tough',
    'shell.freeChest': 'Free chest',
    'shell.chestOpen': 'OPEN!',
    'shell.chestIn': 'Next free chest in {t}',
    'shell.chestGot': 'Free chest!',
    'shell.chestQueued': 'A wooden chest is waiting for you ({n} in line)',
    'shell.sound': 'Sound',
    'events.title': 'Events',
    'events.daily': 'Daily challenge',
    'events.play': 'Play the daily',
    'events.exit': 'Back to chapters',
    'events.done': 'Done today. Come back tomorrow!',
    'events.more': 'More events are on the way',
    'ranks.part.weapons': 'Weapons',
  },
  tr: {
    'menu.chapterPrev': 'Önceki bölüm',
    'menu.chapterNext': 'Sonraki bölüm',
    'tab.shop': 'Mağaza',
    'tab.weapons': 'Silahlar',
    'tab.home': 'Ana Sayfa',
    'tab.ranks': 'Rütbeler',
    'tab.events': 'Etkinlik',
    'shell.power': 'GÜÇ',
    'shell.recommended': 'Önerilen güç {n}',
    'shell.easy': 'Kolay',
    'shell.tough': 'Zorlu',
    'shell.freeChest': 'Bedava sandık',
    'shell.chestOpen': 'AÇ!',
    'shell.chestIn': 'Sonraki bedava sandık: {t}',
    'shell.chestGot': 'Bedava sandık!',
    'shell.chestQueued': 'Tahta sandık seni bekliyor (sırada {n})',
    'shell.sound': 'Ses',
    'events.title': 'Etkinlik',
    'events.daily': 'Günlük meydan okuma',
    'events.play': 'Günlüğü oyna',
    'events.exit': 'Bölümlere dön',
    'events.done': 'Bugün tamam. Yarın yine gel!',
    'events.more': 'Yeni etkinlikler yolda',
    'ranks.part.weapons': 'Silahlar',
  },
});

export const APP_STRINGS = {
  en: { ...STRINGS.en, ...MENU_STRINGS.en },
  tr: { ...STRINGS.tr, ...MENU_STRINGS.tr },
};
