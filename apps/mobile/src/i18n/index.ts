// French and English. Starts in the phone's language (French unless it's English), then follows the profile.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n, { type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ApiError } from '../lib/api';
import { supabase } from '../lib/supabase';
import en from './en';
import fr from './fr';

export type Lang = 'fr' | 'en';
const KEY = 'quarti.lang';
const device: Lang = getLocales()[0]?.languageCode === 'en' ? 'en' : 'fr';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: device,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});
AsyncStorage.getItem(KEY).then((l) => { if ((l === 'fr' || l === 'en') && l !== i18n.language) i18n.changeLanguage(l); }).catch(() => {});

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
