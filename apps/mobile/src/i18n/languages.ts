// The languages the app speaks. To add one: copy en.ts to <code>.ts and translate it (TypeScript checks every key
// is there), then add a line below. Nothing else changes: the server stores events, not sentences, and accepts any code.
import en, { type Strings } from './en';
import fr from './fr';
import zh from './zh';

export const LANGUAGES = [
  { code: 'fr', name: 'Français', locale: 'fr-CA', strings: fr },
  { code: 'en', name: 'English', locale: 'en-CA', strings: en },
  { code: 'zh', name: '中文', locale: 'zh-CN', strings: zh },     // Simplified Chinese
] as const satisfies readonly { code: string; name: string; locale: string; strings: Strings }[];

export type Lang = (typeof LANGUAGES)[number]['code'];

/** French first: Québec's Charter of the French Language (rules: Languages) */
export const DEFAULT_LANG: Lang = 'fr';

export const isLang = (x: unknown): x is Lang => LANGUAGES.some((l) => l.code === x);

/** the locale for dates and numbers in a language ("fr-CA", "zh-CN") */
export const localeOf = (lang: string): string => LANGUAGES.find((l) => l.code === lang)?.locale ?? 'fr-CA';
