import { de } from './de';
import { en, type MessageKey } from './en';
import { it } from './it';
import type { Locale } from './messageCatalog';

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, it, de };

let currentLocale: Locale = 'en';

/** Maps a BCP 47 tag (e.g. "de-AT") to a supported locale; English is the fallback. */
export function resolveLocale(languageTag: string): Locale {
  const language = languageTag.toLowerCase().split(/[-_]/)[0];
  return language === 'it' || language === 'de' ? language : 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Translates a message; `{0}`, `{1}`... are replaced by the given arguments. */
export function t(key: MessageKey, ...args: Array<string | number>): string {
  const template = catalogs[currentLocale][key];
  return template.replace(/\{(\d+)\}/g, (placeholder, index: string) => String(args[Number(index)] ?? placeholder));
}

export type { Locale, MessageKey };
