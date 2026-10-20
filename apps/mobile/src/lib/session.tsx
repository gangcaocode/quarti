// Who is signed in, which shop they're looking at, and in which role (manager app or worker app).
// The role is only a view: the server decides on every request what this person may do.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import i18n, { setLanguage } from '../i18n';
import { api, type MyShop } from './api';
import { supabase } from './supabase';

export type Mode = 'manager' | 'worker';
export type ShopInfo = MyShop & { timezone: string; address: string };

type Ctx = {
  session: Session | null;
  ready: boolean;                // the stored session has been read
  shops: MyShop[] | null;        // null until loaded
  shop: ShopInfo | null;         // the one on screen
  mode: Mode;
  pick: (shopId: string, mode?: Mode) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);
const KEY = 'quarti.current';

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [shops, setShops] = useState<MyShop[] | null>(null);
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [mode, setMode] = useState<Mode>('manager');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (wantId?: string, wantMode?: Mode) => {
    const list = await api.myShops();
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as { id?: string; mode?: Mode };
    const id = wantId ?? saved.id;
    const s = list.find((x) => x.shop_id === id) ?? list[0] ?? null;
    // shops and the current shop change together: the screens treat "shops loaded, no shop" as "go to welcome"
    if (!s) { setShop(null); setShops(list); return; }
    const { data } = await supabase.from('shops').select('timezone, address').eq('id', s.shop_id).single();
    const m: Mode = wantMode ?? (s.shop_id === saved.id ? saved.mode : undefined) ?? (s.manages ? 'manager' : 'worker');
    const allowed: Mode = m === 'manager' && !s.manages ? 'worker' : m === 'worker' && !s.staff_id ? 'manager' : m;
    setShop({ ...s, timezone: data?.timezone ?? 'America/Toronto', address: data?.address ?? '' });
    setMode(allowed);
    setShops(list);
    await AsyncStorage.setItem(KEY, JSON.stringify({ id: s.shop_id, mode: allowed }));
  }, []);

  useEffect(() => {
    if (!session) { setShops(null); setShop(null); return; }
    load().catch(() => setShops([]));
    // a language picked earlier (on any phone) wins; a new profile takes the language the app is showing now
    supabase.from('profiles').select('lang').single().then(({ data }) => {
      if (data?.lang === 'fr' || data?.lang === 'en') { if (data.lang !== i18n.language) setLanguage(data.lang); }
      else if (data) setLanguage(i18n.language === 'en' ? 'en' : 'fr', true);
    });
  }, [session, load]);

  const value = useMemo<Ctx>(() => ({
    session, ready, shops, shop, mode,
    pick: (id, m) => load(id, m),
    refresh: () => load(shop?.shop_id, mode),
    signOut: async () => { await AsyncStorage.removeItem(KEY); await supabase.auth.signOut(); },
  }), [session, ready, shops, shop, mode, load]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
/** the shop on screen; screens under the signed-in layouts can rely on it */
export function useShop(): ShopInfo {
  const { shop } = useApp();
  if (!shop) throw new Error('no shop');
  return shop;
}
