// The app's languages (see languages.ts). Starts in the phone's language when the app has it (French otherwise),
// then follows the profile.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n, { type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';
import { DEFAULT_LANG, isLang, LANGUAGES, type Lang } from './languages';

export { LANGUAGES, type Lang } from './languages';
const KEY = 'quarti.lang';
const device: Lang = getLocales().map((l) => l.languageCode).find(isLang) ?? DEFAULT_LANG;

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((l) => [l.code, { translation: l.strings }])),
  lng: device,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
  returnNull: false,
});
AsyncStorage.getItem(KEY).then((l) => { if (isLang(l) && l !== i18n.language) i18n.changeLanguage(l); }).catch(() => {});

/** switch language; with persist, also save it on this phone and on the profile (so updates and emails follow) */
export async function setLanguage(lang: Lang, persist = false) {
  await i18n.changeLanguage(lang);
  AsyncStorage.setItem(KEY, lang).catch(() => {});
  if (!persist) return;
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from('profiles').update({ lang }).eq('id', data.user.id);
}

/** human text for anything thrown by the api (or a plain Supabase error) */
export function errText(t: TFunction, e: unknown): string {
  if (e instanceof ApiError) return e.code === 'network' ? t('errors.network') : t(`errors.${e.code}`);
  const msg = e instanceof Error ? e.message : '';
  if (/fetch|network/i.test(msg)) return t('errors.network');
  if (/periods_.*check|name_check|_check/.test(msg)) return t('errors.bad_input');
  if (/duplicate key|unique/i.test(msg)) return t('errors.nameTaken');
  const code = msg.trim();
  return i18n.exists(`errors.${code}`) ? t(`errors.${code}`) : t('errors.unknown');
}

export default i18n;
