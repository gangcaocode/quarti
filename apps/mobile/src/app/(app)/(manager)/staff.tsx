// The roster. Adding someone creates their staff row right away (they can be scheduled) and an invite code to join the app.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';
import { draftToRates, PositionsEditor, type PosDraft } from '../../../features/positionsEditor';
import { errText } from '../../../i18n';
import { api } from '../../../lib/api';
import { loadSetup, loadStaff } from '../../../lib/data';
import { useShop } from '../../../lib/session';
import { useLoad } from '../../../lib/useLoad';
import { Avatar, Badge, Button, Card, Empty, Field, Loading, Notice, Row, Screen, Section, Sheet, T } from '../../../ui/kit';

export default function Staff() {
  const { t } = useTranslation();
  const shop = useShop();
  const [adding, setAdding] = useState(false);
  const { data, loading, reload } = useLoad(async () => {
    const [setup, staff] = await Promise.all([loadSetup(shop.shop_id), loadStaff(shop.shop_id)]);
    return { setup, staff };
  }, [shop.shop_id]);
  if (!data) return <Screen title={t('tabs.staff')}>{loading ? <Loading /> : <Empty icon="cloud-offline-outline" text={t('errors.network')}><Button label={t('common.retry')} onPress={reload} /></Empty>}</Screen>;
  const { setup, staff } = data;
  const pos = (id: string) => setup.positions.find((p) => p.id === id)?.name ?? '';
  const active = staff.filter((m) => m.status !== 'inactive'), inactive = staff.filter((m) => m.status === 'inactive');
  const card = (m: (typeof staff)[number]) => (
    <Card key={m.id} onPress={() => router.push({ pathname: '/person/[id]', params: { id: m.id } })} style={m.status === 'inactive' ? { opacity: 0.65 } : undefined}>
      <Row>
        <Avatar name={m.fullName} />
        <View style={{ flex: 1 }}>
          <T v="strong">{m.fullName}</T>
          <T v="small">{Object.keys(m.rates).map(pos).join(' · ')}{m.status === 'inactive' && m.backOn ? ` · ${t('staff.backOn', { day: m.backOn })}` : ''}</T>
        </View>
        {!m.joined ? <Badge label={t('staff.invited')} tone="blue" /> : m.status === 'new' ? <Badge label={t('staff.new')} tone="green" /> : m.status === 'inactive' ? <Badge label={t('staff.inactive')} /> : null}
      </Row>
    </Card>
  );
  return (
    <Screen title={t('tabs.staff')} onRefresh={reload} refreshing={loading} right={<Button small icon="person-add-outline" label={t('staff.add')} onPress={() => setAdding(true)} />}>
      {!staff.length ? <Empty icon="people-outline" text={t('staff.none')}><Button label={t('staff.add')} onPress={() => setAdding(true)} /></Empty> : null}
      {active.map(card)}
      {inactive.length ? <><Section title={t('staff.inactiveTitle', { count: inactive.length })} />{inactive.map(card)}</> : null}
      <AddStaff visible={adding} positions={setup.positions} shopId={shop.shop_id} shopName={shop.name} onClose={() => { setAdding(false); reload(); }} />
    </Screen>
  );
}

function AddStaff({ visible, positions, shopId, shopName, onClose }: { visible: boolean; positions: { id: string; name: string; sort: number }[]; shopId: string; shopName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [draft, setDraft] = useState<PosDraft>({ on: {}, rate: {}, main: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; code: string } | null>(null);
  const reset = () => { setName(''); setEmail(''); setDraft({ on: {}, rate: {}, main: null }); setErr(null); setDone(null); };
  async function save() {
    if (!name.trim()) { setErr(t('staff.needName')); return; }
    const r = draftToRates(draft, positions);
    if ('error' in r) { setErr(t(r.error)); return; }
    setBusy(true); setErr(null);
    try { const x = await api.createStaff(shopId, name.trim(), email.trim(), r.list, r.main); setDone({ name: name.trim(), code: x.token }); }
    catch (e) { setErr(errText(t, e)); } finally { setBusy(false); }
  }
  const code = done ? `${done.code.slice(0, 4)}-${done.code.slice(4)}` : '';
  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title={done ? t('staff.inviteTitle', { name: done.name }) : t('staff.add')}>
      {err ? <Notice tone="error" text={err} /> : null}
      {done ? (
        <>
          <T v="small">{t('staff.inviteHelp')}</T>
          <Card tone="ok" style={{ marginTop: 10, alignItems: 'center' }}><T v="h2" style={{ letterSpacing: 2 }}>{code}</T></Card>
          <Button icon="share-outline" label={t('staff.share')} onPress={() => Share.share({ message: t('staff.shareText', { shop: shopName, code, link: `quarti://join/${done.code}` }) })} />
          <Button kind="secondary" label={t('common.done')} onPress={() => { reset(); onClose(); }} />
        </>
      ) : (
        <>
          <Field label={t('staff.name')} value={name} onChangeText={setName} maxLength={80} />
          <Field label={t('staff.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder={t('staff.optional')} />
          <T v="label">{t('staff.positions')}</T>
          <PositionsEditor positions={positions} value={draft} onChange={setDraft} />
          <Button label={t('staff.create')} busy={busy} onPress={save} />
        </>
      )}
    </Sheet>
  );
}
