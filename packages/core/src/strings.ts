import { defineStrings } from './i18n';

/** Strings used by core shells (menu, pause, result). Games may override any key in their own table. */
export const CORE_STRINGS = defineStrings({
  en: {
    'core.play': 'Play',
    'core.paused': 'Paused',
    'core.resume': 'Resume',
    'core.quit': 'Quit',
    'core.menu': 'Menu',
    'core.replay': 'Play again',
    'core.score': 'Score',
    'core.best': 'Best: {n}',
    'core.newBest': 'New best!',
    'core.soundOn': 'Sound on',
    'core.soundOff': 'Sound off',
  },
  tr: {
    'core.play': 'Oyna',
    'core.paused': 'Duraklatıldı',
    'core.resume': 'Devam',
    'core.quit': 'Çık',
    'core.menu': 'Menü',
    'core.replay': 'Tekrar oyna',
    'core.score': 'Puan',
    'core.best': 'En iyi: {n}',
    'core.newBest': 'Yeni rekor!',
    'core.soundOn': 'Ses açık',
    'core.soundOff': 'Ses kapalı',
  },
});
export type CoreStringKey = keyof typeof CORE_STRINGS.en;
