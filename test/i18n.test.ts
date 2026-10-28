import { afterEach, describe, expect, it } from 'vitest';
import { resolveLocale, setLocale, t } from '../src/i18n';

describe('i18n', () => {
  afterEach(() => setLocale('en'));

  it('resolves supported languages and falls back to English', () => {
    expect(resolveLocale('it')).toBe('it');
    expect(resolveLocale('de-AT')).toBe('de');
    expect(resolveLocale('fr')).toBe('en');
  });

  it('translates and substitutes arguments', () => {
    expect(t('analysis.captured', 'today', 'manual')).toBe('Captured on today (manual).');
    setLocale('de');
    expect(t('review.captured', 2, 'heute')).toBe('Erfasste Reviews: 2 (zuletzt am heute).');
  });
});
