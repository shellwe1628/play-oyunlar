import { describe, expect, it } from 'vitest';
import { createI18n, defineStrings, pickLanguage } from '../src/i18n';

const strings = defineStrings({
  en: { hello: 'Hello', score: 'Score: {n}', onlyEn: 'English only' },
  tr: { hello: 'Merhaba', score: 'Puan: {n}', onlyEn: '' },
});

describe('pickLanguage', () => {
  it('picks tr for Turkish device languages', () => {
    expect(pickLanguage(['tr-TR', 'en-US'])).toBe('tr');
    expect(pickLanguage(['TR'])).toBe('tr');
  });
  it('uses the first supported language in preference order', () => {
    expect(pickLanguage(['de-DE', 'en-GB', 'tr'])).toBe('en');
  });
  it('falls back to en for unsupported or missing languages', () => {
    expect(pickLanguage(['de-DE', 'fr'])).toBe('en');
    expect(pickLanguage([])).toBe('en');
    expect(pickLanguage(undefined)).toBe('en');
  });
  it('an explicit override wins when supported, ignored otherwise', () => {
    expect(pickLanguage(['en-US'], 'tr')).toBe('tr');
    expect(pickLanguage(['tr-TR'], 'xx')).toBe('tr');
  });
});

describe('createI18n', () => {
  it('translates in the chosen language', () => {
    expect(createI18n(strings, 'tr').t('hello')).toBe('Merhaba');
    expect(createI18n(strings, 'en').t('hello')).toBe('Hello');
  });
  it('interpolates {params}', () => {
    expect(createI18n(strings, 'tr').t('score', { n: 42 })).toBe('Puan: 42');
  });
  it('leaves unknown placeholders visible', () => {
    expect(createI18n(strings, 'en').t('score')).toBe('Score: {n}');
  });
  it('falls back to en when the tr string is empty', () => {
    expect(createI18n(strings, 'tr').t('onlyEn')).toBe('English only');
  });
  it('reports a missing key and returns the key itself', () => {
    const missing: string[] = [];
    const i18n = createI18n(strings, 'en', { onMissing: (k) => missing.push(k) });
    expect(i18n.t('nope' as 'hello')).toBe('nope');
    expect(missing).toEqual(['nope']);
  });
  it('merges extra dictionaries (core shell strings) under the game strings', () => {
    const core = defineStrings({ en: { play: 'Play', hello: 'core hello' }, tr: { play: 'Oyna', hello: 'x' } });
    const i18n = createI18n(strings, 'tr', { base: core });
    expect(i18n.t('play')).toBe('Oyna');
    expect(i18n.t('hello')).toBe('Merhaba');
    expect(i18n.lang).toBe('tr');
  });
  it('has() tells whether a key exists', () => {
    const i18n = createI18n(strings, 'en');
    expect(i18n.has('hello')).toBe(true);
    expect(i18n.has('nope')).toBe(false);
  });
});
