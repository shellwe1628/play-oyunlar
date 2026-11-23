/**
 * Phaser-free part of @oyun/core. Safe to import from `src/sim/` and from node unit tests.
 */
export * from './store';
export * from './rng';
export * from './storage';
export * from './save';
export * from './i18n';
export * from './platform';
export * from './testhook';
export * from './juice/math';
export * from './ui/layout';
export * from './time';
export * from './link';
export * from './ui/theme';
export { SFX_PRESETS, presetDuration, sliderToGain, type SfxName, type SfxPreset, type Voice, type Wave } from './audio/presets';
export { createAudio, type Audio, type AudioOptions, type Bus, type PlayOptions } from './audio/synth';
export { CORE_STRINGS, type CoreStringKey } from './strings';
