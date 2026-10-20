// My shifts: everything coming up, and who else works each one (names only).
import { money, timesLabel } from '@quarti/rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadCrew, loadMyShifts, loadSetup, type Shift } from '../../../lib/data';
import { dayLabel, todayIn } from '../../../lib/dates';
import { useShop } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { statusOf } from '../../../features/schedule';
import { Badge, Button, Card, Empty, Loading, Row, Screen, Sheet, T } from '../../../ui/kit';

export default function MyShifts() {
  const { t } = useTranslation();
  const shop = useShop();
  const [open, setOpen] = useState<Shift | null>(null);
  const [crew, setCrew] = useState<{ id: string; full_name: string; start_min: number; end_min: number; position_id: string; staff_id: string }[] | null>(null);
  const { data, loading, reload } = useLoad(async () => {
    const [setup, shifts] = await Promise.all([loadSetup(shop.shop_id), loadMyShifts(shop.shop_id, todayIn(shop.timezone))]);
    return { setup, shifts };
  }, [shop.shop_id]);
  if (!data) return <Screen title={t('tabs.shifts')}>{loading ? <Loading /> : <Empty icon="cloud-offline-outline" text={t('errors.network')}><Button label={t('common.retry')} onPress={reload} /></Empty>}</Screen>;
  const pos = (id: string) => data.setup.positions.find((p) => p.id === id)?.name ?? '';
  const show = async (s: Shift) => { setOpen(s); setCrew(null); setCrew((await loadCrew(shop.shop_id, s.day)).filter((c) => c.staff_id !== shop.staff_id && c.start_min < s.endMin && s.startMin < c.end_min)); };
  return (
    <Screen title={t('tabs.shifts')} onRefresh={reload} refreshing={loading}>
      {data.shifts.length ? data.shifts.map((s) => {
        const st = statusOf(s);
        return (
          <Card key={s.id} onPress={() => show(s)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="strong">{dayLabel(s.day)} · {timesLabel(s)}</T>
              <Badge label={t(`status.${st.label}`)} tone={st.tone} />
            </Row>
            <T v="small">{pos(s.positionId)} · {money(s.rateCents)}/h</T>
          </Card>
        );
      }) : <Empty icon="calendar-clear-outline" text={t('worker.noShifts')} />}
      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open ? `${pos(open.positionId)} · ${dayLabel(open.day)}` : ''}>
        {open ? <T v="small">{timesLabel(open)} · {shop.name}{shop.address ? ` · ${shop.address}` : ''}</T> : null}
        <T v="label" style={{ marginTop: 12 }}>{t('worker.crew')}</T>
        {crew === null ? <Loading /> : crew.length ? crew.map((c) => <T key={c.id} v="small">{c.full_name} · {pos(c.position_id)} · {timesLabel({ startMin: c.start_min, endMin: c.end_min })}</T>) : <T v="small">{t('worker.noCrew')}</T>}
      </Sheet>
    </Screen>
  );
}
