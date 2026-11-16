import { describe, expect, it } from 'vitest';
import { formatBig, formatOddsNumber, trLocative } from '../../src/sim/format';

describe('format', () => {
  it('groups odds digits per language', () => {
    expect(formatOddsNumber(1_000_000, 'en')).toBe('1,000,000');
    expect(formatOddsNumber(250, 'en')).toBe('250');
    expect(formatOddsNumber(12_000, 'tr')).toBe("12.000'de");
  });

  it('picks the Turkish locative suffix from the last spoken word', () => {
    const cases: [number, string][] = [
      [2, 'de'], [3, 'te'], [4, 'te'], [5, 'te'], [6, 'da'], [8, 'de'], [10, 'da'], [12, 'de'], [15, 'te'],
      [16, 'da'], [25, 'te'], [40, 'ta'], [50, 'de'], [60, 'ta'], [64, 'te'], [100, 'de'], [300, 'de'],
      [600, 'de'], [1500, 'de'], [4000, 'de'], [120_000, 'de'], [250_000, 'de'], [1_000_000, 'da'], [90, 'da'],
    ];
    for (const [n, sfx] of cases) expect(trLocative(n), String(n)).toBe(sfx);
  });

  it('shortens big numbers without the 1000.0K rollover bug', () => {
    expect(formatBig(0, 'en')).toBe('0');
    expect(formatBig(999, 'en')).toBe('999');
    expect(formatBig(1234, 'en')).toBe('1.23K');
    expect(formatBig(12_345, 'en')).toBe('12.3K');
    expect(formatBig(999_950, 'en')).toBe('1.00M');
    expect(formatBig(4.5e9, 'en')).toBe('4.50B');
    expect(formatBig(1234, 'tr')).toBe('1,23B');
    expect(formatBig(2.5e6, 'tr')).toBe('2,50Mn');
    expect(formatBig(12.4, 'en')).toBe('12.4');
    expect(formatBig(3e18, 'en')).toMatch(/e18$/);
  });
});
