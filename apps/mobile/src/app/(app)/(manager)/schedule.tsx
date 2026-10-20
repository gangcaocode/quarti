// The schedule: a week at a time. Tap a day, see its slots; start a day from the usual staffing; assign; send.
import { Ionicons } from '@expo/vector-icons';
import { addDays, dayStats, dayStatus, hhmm, parseHHMM, shiftTimesError, span, weekRange, type Day } from '@quarti/rules';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { errText } from '../../../i18n';
import { api } from '../../../lib/api';
import { loadPlanned, loadSetup, loadShifts, loadStaff, type Shift } from '../../../lib/data';
import { dayLong, dayNum, days, todayIn, weekdayShort } from '../../../lib/dates';
import { useShop } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { DaySlots, SlotSheet } from '../../../features/schedule';
import { Button, Card, Chip, Empty, Field, Loading, Notice, Row, Screen, Section, Sheet, T } from '../../../ui/kit';
import { C } from '../../../ui/theme';

const DOT: Record<string, string> = { empty: C.bs, open: C.co, unsent: C.am, waiting: C.am, staffed: C.br };

export default function Schedule() {
  const { t } = useTranslation();
  const shop = useShop();
  const today = todayIn(shop.timezone);
  const [weekStart, setWeekStart] = useState<Day>(weekRange(today)[0]);
  const [sel, setSel] = useState<Day>(today);
  const [open, setOpen] = useState<Shift | null>(null);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);
  const weekEnd = addDays(weekStart, 6);
  const { data, loading, reload } = useLoad(async () => {
    const [setup, staff, shifts, planned] = await Promise.all([loadSetup(shop.shop_id), loadStaff(shop.shop_id), loadShifts(shop.shop_id, weekStart, addDays(weekEnd, 1)), loadPlanned(shop.shop_id, weekStart, weekEnd)]);
    return { setup, staff, shifts, planned };
  }, [shop.shop_id, weekStart]);

  const week = useMemo(() => days(weekStart, 7), [weekStart]);
  if (!data) return <Screen title={t('tabs.schedule')}>{loading ? <Loading /> : <Empty icon="cloud-offline-outline" text={t('errors.network')}><Button label={t('common.retry')} onPress={reload} /></Empty>}</Screen>;
  const { setup, staff, shifts, planned } = data;
  const started = (s: Shift) => new Date(s.startsAt).getTime() <= Date.now();
  const drafts = shifts.filter((s) => s.day >= weekStart && s.day <= weekEnd && s.staffId && s.confirm === 'draft' && !started(s));
  const dayShifts = shifts.filter((s) => s.day === sel);
  const past = sel < today;

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setFlash(null);
    try { await fn(); setFlash({ text: ok, tone: 'ok' }); await reload(); } catch (e) { setFlash({ text: errText(t, e), tone: 'error' }); } finally { setBusy(false); }
  }

  return (
    <Screen title={t('tabs.schedule')} onRefresh={reload} refreshing={loading}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Pressable onPress={() => { setWeekStart(addDays(weekStart, -7)); setSel(addDays(weekStart, -7)); }} accessibilityLabel={t('schedule.prevWeek')} hitSlop={10}><Ionicons name="chevron-back" size={22} color={C.t2} /></Pressable>
        <T v="strong">{t('schedule.weekOf', { day: dayLong(weekStart) })}</T>
        <Pressable onPress={() => { setWeekStart(addDays(weekStart, 7)); setSel(addDays(weekStart, 7)); }} accessibilityLabel={t('schedule.nextWeek')} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={C.t2} /></Pressable>
      </Row>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        {week.map((d) => {
          const st = planned.has(d) ? dayStatus(dayStats(shifts.filter((s) => s.day === d))) : 'empty';
          const on = d === sel;
          return (
            <Pressable key={d} onPress={() => setSel(d)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={dayLong(d)}
              style={{ alignItems: 'center', paddingVertical: 6, width: 44, borderRadius: 10, backgroundColor: on ? C.brl : 'transparent', borderWidth: d === today ? 1 : 0, borderColor: C.br }}>
              <T v="tiny">{weekdayShort(d)}</T>
              <T v="strong" style={{ color: d < today ? C.t3 : C.t1 }}>{dayNum(d)}</T>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: DOT[st] }} />
            </Pressable>
          );
        })}
      </Row>
      {flash ? <Notice tone={flash.tone} text={flash.text} /> : null}
      {drafts.length ? (
        <Card tone="wait">
          <T v="strong">{t('schedule.unsent', { count: drafts.length })}</T>
          <T v="small">{t('schedule.unsentSub')}</T>
          <Button label={t('schedule.sendWeek', { count: drafts.length })} icon="send" busy={busy} onPress={() => act(() => api.send(shop.shop_id, weekStart, weekEnd), t('schedule.sent', { count: drafts.length }))} />
        </Card>
      ) : null}

      <Section title={dayLong(sel)} right={!past && planned.has(sel) ? <Button small kind="secondary" icon="add" label={t('schedule.addShift')} onPress={() => setAdding(true)} /> : null} />
      {planned.has(sel) ? (
        dayShifts.length ? <DaySlots day={sel} shifts={shifts} setup={setup} staff={staff} started={started} onOpen={setOpen} /> : <Empty icon="calendar-clear-outline" text={t('schedule.noSlots')} />
      ) : past ? (
        <Empty icon="time-outline" text={t('schedule.pastEmpty')} />
      ) : (
        <Card>
          <T v="strong">{t('schedule.preview')}</T>
          {setup.periods.map((p) => {
            const need = setup.staffing.filter((x) => x.period_id === p.id && x.n > 0);
            return <T key={p.id} v="small">{p.name} {hhmm(p.startMin)}–{hhmm(p.endMin)}: {need.map((x) => `${x.n} × ${setup.positions.find((q) => q.id === x.position_id)?.name ?? ''}`).join(', ') || '—'}</T>;
          })}
          <Button label={t('schedule.startDay')} busy={busy} onPress={() => act(() => api.planDay(shop.shop_id, sel), t('schedule.started'))} />
        </Card>
      )}

      <SlotSheet slot={open ? shifts.find((s) => s.id === open.id) ?? null : null} setup={setup} staff={staff} shifts={shifts} started={!!open && started(open)}
        onClose={() => setOpen(null)} onChanged={async (m) => { setOpen(null); setFlash({ text: m, tone: 'ok' }); await reload(); }} />
      <AddShift visible={adding} day={sel} setup={setup} onClose={() => setAdding(false)}
        onAdd={(pos, s, e) => act(async () => { await api.addSlot(shop.shop_id, sel, pos, s, e); setAdding(false); }, t('schedule.added'))} />
    </Screen>
  );
}

function AddShift({ visible, day, setup, onClose, onAdd }: { visible: boolean; day: Day; setup: { positions: { id: string; name: string }[] }; onClose: () => void; onAdd: (pos: string, s: number, e: number) => void }) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<string | null>(null);
  const [from, setFrom] = useState('17:00');
  const [to, setTo] = useState('22:00');
  const [err, setErr] = useState<string | null>(null);
  function add() {
    const s = parseHHMM(from), e = parseHHMM(to);
    if (!pos) { setErr(t('schedule.pickPosition')); return; }
    if (s == null || e == null) { setErr(t('schedule.badTime')); return; }
    const sp = span(s, e), bad = shiftTimesError(sp.startMin, sp.endMin);
    if (bad) { setErr(t(`schedule.${bad}`)); return; }
    setErr(null); onAdd(pos, sp.startMin, sp.endMin);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t('schedule.addShiftOn', { day: dayLong(day) })}>
      {err ? <Notice tone="error" text={err} /> : null}
      <T v="label">{t('schedule.position')}</T>
      <Row style={{ flexWrap: 'wrap', marginVertical: 6 }}>{setup.positions.map((p) => <Chip key={p.id} label={p.name} on={pos === p.id} onPress={() => setPos(p.id)} />)}</Row>
      <Row>
        <View style={{ flex: 1 }}><Field label={t('schedule.from')} value={from} onChangeText={setFrom} placeholder="17:00" keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Field label={t('schedule.to')} value={to} onChangeText={setTo} placeholder="22:00" keyboardType="numbers-and-punctuation" /></View>
      </Row>
      <T v="tiny">{t('schedule.overnightNote')}</T>
      <Button label={t('schedule.add')} onPress={add} />
    </Sheet>
  );
}
