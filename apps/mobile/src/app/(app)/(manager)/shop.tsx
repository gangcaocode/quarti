// Shop settings: details, positions, service periods and their usual staffing. Changes apply to days planned from now on.
import { hhmm, parseHHMM, span } from '@quarti/rules';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { errText } from '../../../i18n';
import { loadSetup } from '../../../lib/data';
import { useApp, useShop } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { useLoad } from '../../../lib/useLoad';
import { LangSwitch } from '../../../ui/LangSwitch';
import { Button, Card, Chip, Field, Loading, Notice, Row, Screen, Section, T } from '../../../ui/kit';
import { C } from '../../../ui/theme';

export default function ShopScreen() {
  const { t } = useTranslation();
  const shop = useShop();
  const { shops, pick, signOut, refresh } = useApp();
  const { data, reload } = useLoad(() => loadSetup(shop.shop_id), [shop.shop_id]);
  const [name, setName] = useState(shop.name);
  const [address, setAddress] = useState(shop.address);
  const [newPos, setNewPos] = useState('');
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  useEffect(() => { setName(shop.name); setAddress(shop.address); }, [shop.name, shop.address]);

  const write = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setFlash(null);
    const { error } = await fn();
    if (error) setFlash({ text: errText(t, new Error(error.message)), tone: 'error' });
    else { setFlash({ text: ok, tone: 'ok' }); await reload(); }
  };
  if (!data) return <Screen title={t('tabs.shop')}><Loading /></Screen>;

  return (
    <Screen title={t('tabs.shop')}>
      {flash ? <Notice tone={flash.tone} text={flash.text} /> : null}
      <Field label={t('welcome.shopName')} value={name} onChangeText={setName} maxLength={60} />
      <Field label={t('welcome.address')} value={address} onChangeText={setAddress} maxLength={160} />
      <Button kind="secondary" label={t('common.save')} disabled={name.trim() === shop.name && address.trim() === shop.address}
        onPress={() => write(() => supabase.from('shops').update({ name: name.trim(), address: address.trim() }).eq('id', shop.shop_id), t('shop.saved')).then(refresh)} />

      <Section title={t('welcome.positions')} />
      {data.positions.map((p) => <PositionRow key={p.id} id={p.id} name={p.name} onSave={(n) => write(() => supabase.from('positions').update({ name: n }).eq('id', p.id), t('shop.saved'))} />)}
      <Row>
        <View style={{ flex: 1 }}><Field label={t('welcome.addPosition')} value={newPos} onChangeText={setNewPos} maxLength={40} /></View>
        <Button small label={t('common.add')} disabled={!newPos.trim()} onPress={() => write(() => supabase.from('positions').insert({ shop_id: shop.shop_id, name: newPos.trim(), sort: data.positions.length + 1 }), t('shop.added')).then(() => setNewPos(''))} />
      </Row>

      <Section title={t('shop.periods')} />
      <T v="tiny" style={{ marginBottom: 8 }}>{t('shop.periodsNote')}</T>
      {data.periods.map((p) => (
        <PeriodCard key={p.id} period={p} positions={data.positions} staffing={data.staffing.filter((x) => x.period_id === p.id)}
          onTimes={(n, s, e) => write(() => supabase.from('periods').update({ name: n, start_min: s, end_min: e }).eq('id', p.id), t('shop.saved'))}
          onStaff={(pos, n) => write(() => supabase.from('period_staffing').upsert({ period_id: p.id, position_id: pos, n }), t('shop.saved'))} />
      ))}
      <Button kind="secondary" icon="add" label={t('shop.addPeriod')} onPress={() => write(() => supabase.from('periods').insert({ shop_id: shop.shop_id, name: t('shop.newPeriod'), start_min: 17 * 60, end_min: 22 * 60, sort: data.periods.length + 1 }), t('shop.added'))} />

      <Section title={t('me.title')} />
      <LangSwitch />
      {shop.staff_id ? <Button kind="secondary" icon="swap-horizontal" label={t('me.toWorker')} onPress={async () => { await pick(shop.shop_id, 'worker'); router.replace('/home'); }} /> : null}
      {shops && shops.length > 1 ? (
        <>
          <T v="label" style={{ marginTop: 12 }}>{t('me.shops')}</T>
          <Row style={{ flexWrap: 'wrap', marginTop: 6 }}>{shops.map((s) => <Chip key={s.shop_id} label={s.name} on={s.shop_id === shop.shop_id} onPress={async () => { await pick(s.shop_id); router.replace('/'); }} />)}</Row>
        </>
      ) : null}
      <Button kind="ghost" label={t('welcome.title')} onPress={() => router.push('/welcome')} />
      <Button kind="ghost" label={t('me.signOut')} onPress={signOut} />
    </Screen>
  );
}

function PositionRow({ name, onSave }: { id: string; name: string; onSave: (n: string) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  return (
    <Row>
      <View style={{ flex: 1 }}><Field label="" value={v} onChangeText={setV} maxLength={40} accessibilityLabel={name} /></View>
      {v.trim() && v.trim() !== name ? <Button small label={t('common.save')} onPress={() => onSave(v.trim())} /> : null}
    </Row>
  );
}

function PeriodCard({ period, positions, staffing, onTimes, onStaff }: {
  period: { id: string; name: string; startMin: number; endMin: number }; positions: { id: string; name: string }[];
  staffing: { position_id: string; n: number }[]; onTimes: (name: string, s: number, e: number) => void; onStaff: (pos: string, n: number) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(period.name), [from, setFrom] = useState(hhmm(period.startMin)), [to, setTo] = useState(hhmm(period.endMin));
  const [err, setErr] = useState<string | null>(null);
  const changed = name !== period.name || from !== hhmm(period.startMin) || to !== hhmm(period.endMin);
  return (
    <Card>
      {err ? <Notice tone="error" text={err} /> : null}
      <Field label={t('shop.periodName')} value={name} onChangeText={setName} maxLength={30} />
      <Row>
        <View style={{ flex: 1 }}><Field label={t('schedule.from')} value={from} onChangeText={setFrom} keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Field label={t('schedule.to')} value={to} onChangeText={setTo} keyboardType="numbers-and-punctuation" /></View>
      </Row>
      {changed ? <Button small label={t('common.save')} onPress={() => {
        const s = parseHHMM(from), e = parseHHMM(to);
        if (s == null || e == null || !name.trim()) { setErr(t('schedule.badTime')); return; }
        const sp = span(s, e);
        if (sp.endMin - sp.startMin < 60 || sp.endMin - sp.startMin > 960) { setErr(t('shop.periodLength')); return; }
        setErr(null); onTimes(name.trim(), sp.startMin, sp.endMin);
      }} /> : null}
      <T v="label" style={{ marginTop: 8 }}>{t('shop.usual')}</T>
      {positions.map((p) => {
        const n = staffing.find((x) => x.position_id === p.id)?.n ?? 0;
        return (
          <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <T v="small">{p.name}</T>
            <Row>
              <Step label="−" onPress={() => n > 0 && onStaff(p.id, n - 1)} a11y={t('shop.fewer', { pos: p.name })} />
              <T v="strong" style={{ minWidth: 22, textAlign: 'center' }}>{n}</T>
              <Step label="+" onPress={() => n < 20 && onStaff(p.id, n + 1)} a11y={t('shop.more', { pos: p.name })} />
            </Row>
          </Row>
        );
      })}
    </Card>
  );
}
function Step({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 0.5, borderColor: C.bs, alignItems: 'center', justifyContent: 'center', backgroundColor: C.s0 }}><T v="strong">{label}</T></Pressable>;
}
