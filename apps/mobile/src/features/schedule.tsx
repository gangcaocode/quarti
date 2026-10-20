// Shared by Today and Schedule: one day's slots grouped by period, and the sheet to put someone on a slot.
import { hhmm, isCover, money, rateFor, timesLabel, whyNot, type Day } from '@quarti/rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { errText } from '../i18n';
import { api } from '../lib/api';
import type { Setup, Shift, StaffRow } from '../lib/data';
import { Avatar, Badge, Button, Card, Notice, Row, Section, Sheet, T } from '../ui/kit';
import { C } from '../ui/theme';

export function statusOf(s: Shift): { label: string; tone: 'coral' | 'amber' | 'green' | 'grey' } {
  if (!s.staffId) return { label: s.declinedBy ? 'declined' : 'open', tone: 'coral' };
  if (s.confirm === 'draft') return { label: 'draft', tone: 'amber' };
  if (s.confirm === 'pending') return { label: 'pending', tone: 'amber' };
  return { label: 'ok', tone: 'green' };
}

export function DaySlots({ day, shifts, setup, staff, started, onOpen }: {
  day: Day; shifts: Shift[]; setup: Setup; staff: StaffRow[]; started: (s: Shift) => boolean; onOpen: (s: Shift) => void;
}) {
  const { t } = useTranslation();
  // same order every time: by start, then the shop's position order, then extras after the usual ones
  const rank = (id: string) => { const i = setup.positions.findIndex((p) => p.id === id); return i < 0 ? 999 : i; };
  const list = shifts.filter((s) => s.day === day)
    .sort((a, b) => a.startMin - b.startMin || rank(a.positionId) - rank(b.positionId) || Number(a.extra) - Number(b.extra) || a.endMin - b.endMin || a.id.localeCompare(b.id));
  const pos = (id: string) => setup.positions.find((p) => p.id === id)?.name ?? '—';
  const groups = [...setup.periods.map((p) => ({ key: p.id, title: `${p.name} · ${hhmm(p.startMin)}–${hhmm(p.endMin)}`, items: list.filter((s) => s.periodId === p.id) })),
    { key: 'none', title: t('schedule.outside'), items: list.filter((s) => !s.periodId || !setup.periods.some((p) => p.id === s.periodId)) }].filter((g) => g.items.length);
  if (!list.length) return null;
  return (
    <>
      {groups.map((g) => (
        <View key={g.key}>
          <Section title={g.title} />
          {g.items.map((s) => {
            const who = staff.find((m) => m.id === s.staffId), st = statusOf(s), decl = s.declinedBy ? staff.find((m) => m.id === s.declinedBy) : null;
            return (
              <Card key={s.id} onPress={() => onOpen(s)} tone={!s.staffId ? 'open' : undefined} style={{ opacity: started(s) ? 0.7 : 1 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T v="strong">{pos(s.positionId)}{s.extra ? ` · ${t('schedule.extra')}` : ''}</T>
                    <T v="small">{timesLabel(s)}{who ? ` · ${who.fullName}` : ''}{s.cover ? ` · ${t('schedule.covering')}` : ''}</T>
                    {decl ? <T v="tiny">{t('schedule.declinedBy', { name: decl.fullName })}</T> : null}
                  </View>
                  <Badge label={t(`status.${st.label}`)} tone={st.tone} />
                </Row>
              </Card>
            );
          })}
        </View>
      ))}
    </>
  );
}

/** pick who works a slot; or take someone off; or remove an extra slot. Everything is re-checked by the server. */
export function SlotSheet({ slot, setup, staff, shifts, started, onClose, onChanged }: {
  slot: Shift | null; setup: Setup; staff: StaffRow[]; shifts: Shift[]; started: boolean; onClose: () => void; onChanged: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  if (!slot) return null;
  const pos = setup.positions.find((p) => p.id === slot.positionId)?.name ?? '';
  const who = staff.find((m) => m.id === slot.staffId);
  const booked = shifts.filter((s) => s.staffId);
  const rows = staff.filter((m) => m.id !== slot.staffId).map((m) => ({ m, why: whyNot(m, slot, booked), cover: isCover(m, slot.positionId) }))
    .sort((a, b) => Number(!!a.why) - Number(!!b.why) || Number(a.cover) - Number(b.cover) || a.m.fullName.localeCompare(b.m.fullName));
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setErr(null);
    try { await fn(); setConfirmOff(false); onChanged(ok); } catch (e) { setErr(errText(t, e)); } finally { setBusy(null); }
  };
  const close = () => { setErr(null); setConfirmOff(false); onClose(); };
  return (
    <Sheet visible onClose={close} title={`${pos} · ${timesLabel(slot)}`}>
      {err ? <Notice tone="error" text={err} /> : null}
      {started ? <Notice text={t('schedule.startedNote')} /> : null}
      {who ? (
        <Card>
          <Row><Avatar name={who.fullName} /><View style={{ flex: 1 }}><T v="strong">{who.fullName}</T><T v="small">{t(`status.${statusOf(slot).label}`)} · {money(slot.rateCents)}/h</T></View></Row>
          {!started ? (confirmOff ? (
            <>
              <T v="small" style={{ marginTop: 8 }}>{slot.confirm === 'draft' ? t('schedule.offDraft', { name: who.fullName }) : t('schedule.offTold', { name: who.fullName })}</T>
              <Button kind="danger" label={t('schedule.takeOff')} busy={busy === 'off'} onPress={() => run('off', () => api.unassign(slot.id), t('schedule.tookOff', { name: who.fullName }))} />
              <Button kind="ghost" label={t('common.cancel')} onPress={() => setConfirmOff(false)} />
            </>
          ) : <Button kind="secondary" label={t('schedule.takeOff')} onPress={() => setConfirmOff(true)} />) : null}
        </Card>
      ) : null}
      {!started ? (
        <>
          <Section title={who ? t('schedule.giveTo') : t('schedule.pick')} />
          {rows.map(({ m, why, cover }) => (
            <Pressable key={m.id} disabled={!!why || !!busy} onPress={() => run(m.id, () => api.assign(slot.id, m.id), t('schedule.assigned', { name: m.fullName }))}
              accessibilityRole="button" accessibilityState={{ disabled: !!why }}
              style={({ pressed }) => ({ opacity: why ? 0.45 : pressed ? 0.7 : 1, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.b })}>
              <Row>
                <Avatar name={m.fullName} size={30} />
                <View style={{ flex: 1 }}>
                  <T v="strong">{m.fullName}</T>
                  <T v="tiny">{why ? t(`why.${why.code}`, { time: why.clash ? timesLabel(why.clash) : '' }) : cover ? t('schedule.wouldCover') : t('schedule.free')}</T>
                </View>
                {!why ? <T v="small">{money(rateFor(m, slot.positionId) ?? 0)}/h</T> : null}
                {busy === m.id ? <Badge label="…" /> : null}
              </Row>
            </Pressable>
          ))}
          {!rows.length ? <T v="small">{t('schedule.nobody')}</T> : null}
          {!who && slot.extra ? <Button kind="ghost" label={t('schedule.removeSlot')} busy={busy === 'rm'} onPress={() => run('rm', () => api.removeSlot(slot.id), t('schedule.removed'))} /> : null}
          <T v="tiny" style={{ marginTop: 10 }}>{t('schedule.draftNote')}</T>
        </>
      ) : null}
    </Sheet>
  );
}
