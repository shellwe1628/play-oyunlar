import { defineStrings } from '@oyun/core/pure';

/**
 * Every player-visible text. English is the source; Turkish must have the same keys
 * (the compiler enforces it). Core shell strings ('core.*') can be overridden here too.
 */
export const STRINGS = defineStrings({
  en: {
    'menu.tagline': 'Tap the target before time runs out!',
    'game.hint': 'Tap the circle!',
    'game.score': 'Score {n}',
    'game.combo': 'Combo x{n}',
    'game.penalty': '-{s}s',
    'result.stats': 'Hits {hits} · Best combo {combo}',
    'result.double': 'Double score',
    'result.doubled': 'Score doubled!',
  },
  tr: {
    'menu.tagline': 'Süre bitmeden hedefe dokun!',
    'game.hint': 'Daireye dokun!',
    'game.score': 'Puan {n}',
    'game.combo': 'Seri x{n}',
    'game.penalty': '-{s} sn',
    'result.stats': 'İsabet {hits} · En iyi seri {combo}',
    'result.double': 'Puanı ikiye katla',
    'result.doubled': 'Puan ikiye katlandı!',
  },
});
