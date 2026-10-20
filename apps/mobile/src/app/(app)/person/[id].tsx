// One person: positions and pay, active/inactive (with an optional return date), the invite code, remove.
import { isDay } from '@quarti/rules';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, Switch, View } from 'react-native';
import { draftFrom, draftToRates, PositionsEditor, type PosDraft } from '../../../features/positionsEditor';
import { errText } from '../../../i18n';
import { api } from '../../../lib/api';
import { loadSetup, loadStaff } from '../../../lib/data';
import { todayIn } from '../../../lib/dates';
import { useApp, useShop } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { useLoad } from '../../../lib/useLoad';
import { Avatar, Badge, Button, Card, Field, Loading, Notice, Row, Screen, Section, T } from '../../../ui/kit';
import { C } from '../../../ui/theme';

// a manager-only page stacked over the tabs; back returns to the roster
export default function PersonPage() {
  const { shop, mode } = useApp();
  if (!shop || !shop.manages || mode !== 'manager') return <Redirect href="/" />;
  return <Person />;
}
const toRoster = () => (router.canGoBack() ? router.back() : router.replace('/staff'));

function Person() {
  const { t } = useTranslation();
  const shop = useShop();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, reload } = useLoad(async () => {
    const [setup, staff, inv] = await Promise.all([loadSetup(shop.shop_id), loadStaff(shop.shop_id),
      supabase.from('invites').select('token').eq('staff_id', String(id)).is('used_at', null).maybeSingle()]);
    return { setup, person: staff.find((m) => m.id === id) ?? null, code: inv.data?.token ?? null };
  }, [shop.shop_id, id]);
  const [draft, setDraft] = useState<PosDraft | null>(null);
  const [reason, setReason] = useState('');
  const [back, setBack] = useState('');
  const [unassign, setUnassign] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  useEffect(() => { if (data?.person) setDraft(draftFrom(data.person.rates, data.person.mainPositionId)); }, [data?.person]);

  if (!data) return <Screen><Loading /></Screen>;
  const p = data.person;
  if (!p) return <Screen title={t('tabs.staff')}><Notice text={t('staff.gone')} /><Button label={t('common.back')} onPress={() => toRoster()} /></Screen>;
  const run = async (key: string, fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(key); setFlash(null);
    try { await fn(); setFlash({ text: ok, tone: 'ok' }); after?.(); await reload(); } catch (e) { setFlash({ text: errText(t, e), tone: 'error' }); } finally { setBusy(null); }
  };
  const code = data.code ? `${data.code.slice(0, 4)}-${data.code.slice(4)}` : null;
  const today = todayIn(shop.timezone);

  return (
    <Screen back={{ label: t('tabs.staff'), onPress: toRoster }}>
      <Row style={{ marginTop: 8, marginBottom: 12 }}>
        <Avatar name={p.fullName} size={44} />
        <View style={{ flex: 1 }}><T v="h2">{p.fullName}</T><T v="small">{p.email ?? t('staff.noEmail')}</T></View>
        {p.status === 'inactive' ? <Badge label={t('staff.inactive')} /> : null}
      </Row>
      {flash ? <Notice tone={flash.tone} text={flash.text} /> : null}
      {!p.joined && code ? (
        <Card tone="info">
          <T v="strong">{t('staff.notJoined')}</T>
          <T v="small">{t('staff.inviteHelp')}</T>
          <T v="h2" style={{ letterSpacing: 2, marginTop: 6 }}>{code}</T>
          <Button small kind="secondary" icon="share-outline" label={t('staff.share')} onPress={() => Share.share({ message: t('staff.shareText', { shop: shop.name, code, link: `quarti://join/${data.code}` }) })} />
        </Card>
      ) : null}

      <Section title={t('staff.positions')} />
      {draft ? <PositionsEditor positions={data.setup.positions} value={draft} onChange={setDraft} /> : null}
      <Button label={t('common.save')} busy={busy === 'pos'} onPress={() => {
        const r = draft && draftToRates(draft, data.setup.positions);
        if (!r || 'error' in r) { setFlash({ text: t(r && 'error' in r ? r.error : 'errors.unknown'), tone: 'error' }); return; }
        run('pos', () => api.setStaffPositions(p.id, r.list, r.main), t('staff.savedPositions'));
      }} />
      <T v="tiny" style={{ marginTop: 6 }}>{t('staff.ratesNote')}</T>

      <Section title={t('staff.status')} />
      {p.status === 'inactive' ? (
        <Card>
          <T v="small">{p.inactiveReason ? `${p.inactiveReason}. ` : ''}{p.backOn ? t('staff.backOn', { day: p.backOn }) : t('staff.inactiveNoDate')}</T>
          <Button label={t('staff.setActive')} busy={busy === 'act'} onPress={() => run('act', () => api.setStaffStatus(p.id, true), t('staff.nowActive', { name: p.fullName }))} />
        </Card>
      ) : (
        <Card>
          <T v="small" style={{ marginBottom: 8 }}>{t('staff.inactiveHelp')}</T>
          <Field label={t('staff.reason')} value={reason} onChangeText={setReason} maxLength={80} placeholder={t('staff.reasonHint')} />
          <Field label={t('staff.backDate')} value={back} onChangeText={setBack} placeholder="2027-01-08" keyboardType="numbers-and-punctuation" />
          <Row style={{ justifyContent: 'space-between' }}><T v="small" style={{ flex: 1 }}>{t('staff.unassignUpcoming')}</T><Switch value={unassign} onValueChange={setUnassign} accessibilityLabel={t('staff.unassignUpcoming')} trackColor={{ true: C.br }} /></Row>
          <Button kind="secondary" label={t('staff.setInactive')} busy={busy === 'ina'} onPress={() => {
            const b = back.trim();
            if (b && (!isDay(b) || b <= today)) { setFlash({ text: t('staff.badBack'), tone: 'error' }); return; }
            run('ina', () => api.setStaffStatus(p.id, false, reason, b || null, unassign), t('staff.nowInactive', { name: p.fullName }), () => { setReason(''); setBack(''); });
          }} />
        </Card>
      )}

      <Section title={t('staff.removeTitle')} />
      {confirmRemove ? (
        <Card tone="open">
          <T v="small">{t('staff.removeConfirm', { name: p.fullName })}</T>
          <Button kind="danger" label={t('staff.remove')} busy={busy === 'rm'} onPress={async () => {
            setBusy('rm');
            try { await api.removeStaff(p.id); toRoster(); } catch (e) { setFlash({ text: errText(t, e), tone: 'error' }); setBusy(null); }
          }} />
          <Button kind="ghost" label={t('common.cancel')} onPress={() => setConfirmRemove(false)} />
        </Card>
      ) : <Button kind="ghost" label={t('staff.remove')} onPress={() => setConfirmRemove(true)} />}
    </Screen>
  );
}
