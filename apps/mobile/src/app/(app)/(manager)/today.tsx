// Today: who's working, what's open, and what needs the manager next.
import { addDays, dayStats, weekRange } from '@quarti/rules';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errText } from '../../../i18n';
import { api } from '../../../lib/api';
import { loadPlanned, loadSetup, loadShifts, loadStaff, type Shift } from '../../../lib/data';
import { dayLabel, dayLong, todayIn } from '../../../lib/dates';
import { useShop } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { DaySlots, SlotSheet } from '../../../features/schedule';
import { Badge, Button, Card, Empty, Loading, Notice, Row, Screen, Section, T } from '../../../ui/kit';

export default function Today() {
  const { t } = useTranslation();
  const shop = useShop();
  const today = todayIn(shop.timezone);
  const [open, setOpen] = useState<Shift | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const { data, loading, reload } = useLoad(async () => {
    const until = addDays(today, 13);
    const [setup, staff, shifts, planned] = await Promise.all([loadSetup(shop.shop_id), loadStaff(shop.shop_id), loadShifts(shop.shop_id, today, until), loadPlanned(shop.shop_id, today, today)]);
    return { setup, staff, shifts, planned };
  }, [shop.shop_id, today]);

  if (!data) return <Screen title={shop.name}>{loading ? <Loading /> : <Empty icon="cloud-offline-outline" text={t('errors.network')}><Button label={t('common.retry')} onPress={reload} /></Empty>}</Screen>;
  const { setup, staff, shifts, planned } = data;
  const started = (s: Shift) => new Date(s.startsAt).getTime() <= Date.now();
  const todays = shifts.filter((s) => s.day === today);
  const st = dayStats(todays);
  const later = shifts.filter((s) => s.day > today);
  const openLater = later.filter((s) => !s.staffId), declined = later.filter((s) => !s.staffId && s.declinedBy);
  const drafts = shifts.filter((s) => s.staffId && s.confirm === 'draft' && !started(s));
  const waiting = shifts.filter((s) => s.staffId && s.confirm === 'pending');
  const [, wb] = weekRange(today);

  return (
    <Screen title={shop.name} onRefresh={reload} refreshing={loading}>
      <T v="small" style={{ marginBottom: 10 }}>{dayLong(today)}</T>
      {flash ? <Notice tone={flash.tone} text={flash.text} /> : null}
      {planned.has(today) ? (
        <Row style={{ flexWrap: 'wrap', marginBottom: 4 }}>
          <Badge label={t('today.confirmed', { count: st.confirmed })} tone="green" />
          {st.pending ? <Badge label={t('today.waiting', { count: st.pending })} tone="amber" /> : null}
          {st.open ? <Badge label={t('today.open', { count: st.open })} tone="coral" /> : null}
        </Row>
      ) : null}

      <Section title={t('today.needsYou')} />
      {st.open ? <Card tone="open" onPress={() => setOpen(todays.find((s) => !s.staffId && !started(s)) ?? null)}><T v="strong">{t('today.openToday', { count: st.open })}</T><T v="small">{t('today.openTodaySub')}</T></Card> : null}
      {declined.length ? <Card tone="open" onPress={() => router.push('/schedule')}><T v="strong">{t('today.declined', { count: declined.length })}</T><T v="small">{declined.slice(0, 3).map((s) => dayLabel(s.day)).join(' · ')}</T></Card> : null}
      {drafts.length ? (
        <Card tone="wait">
          <T v="strong">{t('schedule.unsent', { count: drafts.length })}</T><T v="small">{t('schedule.unsentSub')}</T>
          <Button small label={t('today.sendAll')} icon="send" onPress={async () => {
            try { const n = await api.send(shop.shop_id, today, addDays(today, 13)); setFlash({ text: t('schedule.sent', { count: n }), tone: 'ok' }); reload(); } catch (e) { setFlash({ text: errText(t, e), tone: 'error' }); }
          }} />
        </Card>
      ) : null}
      {waiting.length ? <Card><T v="strong">{t('today.waitingReplies', { count: waiting.length })}</T><T v="small">{t('today.waitingSub')}</T></Card> : null}
      {openLater.length > declined.length ? <Card onPress={() => router.push('/schedule')}><T v="strong">{t('today.openLater', { count: openLater.length - declined.length })}</T><T v="small">{t('today.openLaterSub', { from: dayLabel(addDays(today, 1)), to: dayLabel(addDays(wb, 7)) })}</T></Card> : null}
      {!st.open && !declined.length && !drafts.length && !waiting.length && openLater.length <= declined.length ? <T v="small">{t('today.allGood')}</T> : null}

      <Section title={t('today.title')} />
      {planned.has(today) && todays.length ? <DaySlots day={today} shifts={shifts} setup={setup} staff={staff} started={started} onOpen={setOpen} />
        : <Empty icon="calendar-outline" text={t('today.notPlanned')}><Button small kind="secondary" label={t('today.goSchedule')} onPress={() => router.push('/schedule')} /></Empty>}

      <SlotSheet slot={open ? shifts.find((s) => s.id === open.id) ?? null : null} setup={setup} staff={staff} shifts={shifts} started={!!open && started(open)}
        onClose={() => setOpen(null)} onChanged={async (m) => { setOpen(null); setFlash({ text: m, tone: 'ok' }); await reload(); }} />
    </Screen>
  );
}
