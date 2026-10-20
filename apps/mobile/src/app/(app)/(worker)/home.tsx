// Worker home: shifts to answer first, then what's next, then what the manager changed.
import { money, timesLabel } from '@quarti/rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { errText } from '../../../i18n';
import { api } from '../../../lib/api';
import { loadMyShifts, loadSetup, loadUpdates, markSeen, type Shift } from '../../../lib/data';
import { dayLabel, todayIn } from '../../../lib/dates';
import { useShop } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { useLoad } from '../../../lib/useLoad';
import { Badge, Button, Card, Empty, Loading, Notice, Row, Screen, Section, T } from '../../../ui/kit';

export default function Home() {
  const { t } = useTranslation();
  const shop = useShop();
  const staffId = shop.staff_id!;
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const { data, loading, reload } = useLoad(async () => {
    const today = todayIn(shop.timezone);
    const [setup, shifts, updates, me] = await Promise.all([loadSetup(shop.shop_id), loadMyShifts(shop.shop_id, today), loadUpdates(staffId),
      supabase.from('staff').select('full_name').eq('id', staffId).single()]);
    const unseen = updates.filter((u) => !u.seen_at).length;
    if (unseen) markSeen(staffId);
    return { setup, shifts, updates, unseen, first: (me.data?.full_name ?? '').split(' ')[0] };
  }, [shop.shop_id, staffId]);
  if (!data) return <Screen title={shop.name}>{loading ? <Loading /> : <Empty icon="cloud-offline-outline" text={t('errors.network')}><Button label={t('common.retry')} onPress={reload} /></Empty>}</Screen>;
  const pos = (id: string) => data.setup.positions.find((p) => p.id === id)?.name ?? '';
  const now = Date.now();
  const ask = data.shifts.filter((s) => s.confirm === 'pending' && new Date(s.startsAt).getTime() > now);
  const next = data.shifts.filter((s) => s.confirm === 'ok' && new Date(s.startsAt).getTime() > now - 12 * 3600e3).slice(0, 5);
  const answer = async (s: Shift, yes: boolean) => {
    setBusy(s.id + yes); setFlash(null);
    try { await api.reply(s.id, yes); setFlash({ text: yes ? t('worker.accepted') : t('worker.declined'), tone: 'ok' }); await reload(); }
    catch (e) { setFlash({ text: errText(t, e), tone: 'error' }); } finally { setBusy(null); }
  };
  return (
    <Screen title={data.first ? t('worker.hi', { name: data.first }) : shop.name} onRefresh={reload} refreshing={loading}>
      <T v="small" style={{ marginBottom: 8 }}>{shop.name}</T>
      {flash ? <Notice tone={flash.tone} text={flash.text} /> : null}
      {ask.length ? <Section title={t('worker.toAnswer', { count: ask.length })} /> : null}
      {ask.map((s) => (
        <Card key={s.id} tone="wait">
          <T v="strong">{pos(s.positionId)} · {dayLabel(s.day)}</T>
          <T v="small">{timesLabel(s)} · {money(s.rateCents)}/h{s.cover ? ` · ${t('schedule.covering')}` : ''}</T>
          <Row style={{ marginTop: 4 }}>
            <View style={{ flex: 1 }}><Button small label={t('worker.accept')} busy={busy === s.id + 'true'} onPress={() => answer(s, true)} /></View>
            <View style={{ flex: 1 }}><Button small kind="secondary" label={t('worker.decline')} busy={busy === s.id + 'false'} onPress={() => answer(s, false)} /></View>
          </Row>
        </Card>
      ))}
      <Section title={t('worker.next')} />
      {next.length ? next.map((s) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View><T v="strong">{dayLabel(s.day)} · {timesLabel(s)}</T><T v="small">{pos(s.positionId)}</T></View>
            <Badge label={t('status.ok')} tone="green" />
          </Row>
        </Card>
      )) : <Empty icon="calendar-clear-outline" text={t('worker.nothingNext')} />}
      <Section title={t('worker.updates')} right={data.unseen ? <Badge label={t('worker.new', { count: data.unseen })} tone="blue" /> : null} />
      {data.updates.length ? data.updates.slice(0, 10).map((u) => (
        <Card key={u.id} tone={!u.seen_at ? 'info' : undefined}><T v="strong">{t(`updates.${u.kind}`, { defaultValue: u.title })}</T>{u.body ? <T v="small">{u.body}</T> : null}</Card>
      )) : <T v="small">{t('worker.noUpdates')}</T>}
    </Screen>
  );
}
