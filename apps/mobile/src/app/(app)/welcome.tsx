// First run: set up a restaurant (you become its manager) or join one with the code from your manager.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api, ApiError } from '../../lib/api';
import { useApp } from '../../lib/session';
import { errText } from '../../i18n';
import { Button, Card, Chip, Field, Notice, Row, Screen, T } from '../../ui/kit';

// a starting point the manager edits later in Shop: two periods (the free plan's limit), three common positions
const DEFAULT_POSITIONS = ['Cashier', 'Cook', 'Server'];
const DEFAULT_PERIODS = [{ name: 'Lunch', start: 11 * 60, end: 15 * 60 }, { name: 'Dinner', start: 17 * 60, end: 22 * 60 }];

export default function Welcome() {
  const { t } = useTranslation();
  const { pick, signOut, shops } = useApp();
  const [step, setStep] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [positions, setPositions] = useState(DEFAULT_POSITIONS.map((p) => t(`defaults.${p}`)));
  const [extra, setExtra] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) { setErr(t('welcome.needName')); return; }
    if (!positions.length) { setErr(t('welcome.needPosition')); return; }
    setBusy(true); setErr(null);
    try {
      const shop = await api.setupShop(name.trim(), address.trim(), positions,
        DEFAULT_PERIODS.map((p) => ({ name: t(`defaults.${p.name}`), start_min: p.start, end_min: p.end })));
      await pick(shop, 'manager');
      router.replace('/today');
    } catch (e) {
      setErr(errText(t, e));
    } finally { setBusy(false); }
  }
  async function join() {
    setBusy(true); setErr(null);
    try {
      const shop = await api.joinShop(code);
      await pick(shop, 'worker');
      router.replace('/home');
    } catch (e) {
      setErr(e instanceof ApiError && (e.code === 'unknown' || e.code === 'bad_input') ? t('welcome.badCode') : errText(t, e));
    } finally { setBusy(false); }
  }

  return (
    <Screen title={t('welcome.title')}>
      {err ? <Notice tone="error" text={err} /> : null}
      {step === 'choose' ? (
        <>
          <T v="small" style={{ marginBottom: 16 }}>{t('welcome.intro')}</T>
          <Card onPress={() => setStep('create')}><T v="strong">{t('welcome.create')}</T><T v="small">{t('welcome.createSub')}</T></Card>
          <Card onPress={() => setStep('join')}><T v="strong">{t('welcome.join')}</T><T v="small">{t('welcome.joinSub')}</T></Card>
          {shops && shops.length ? <Button kind="secondary" label={t('common.back')} onPress={() => router.replace('/')} /> : null}
          <Button kind="ghost" label={t('me.signOut')} onPress={signOut} />
        </>
      ) : step === 'create' ? (
        <>
          <Field label={t('welcome.shopName')} value={name} onChangeText={setName} maxLength={60} placeholder="Café Olympico" />
          <Field label={t('welcome.address')} value={address} onChangeText={setAddress} maxLength={160} placeholder="124 Av. Laurier O, Montréal" />
          <T v="label">{t('welcome.positions')}</T>
          <Row style={{ flexWrap: 'wrap', marginTop: 6 }}>
            {positions.map((p) => <Chip key={p} label={`${p}  ×`} on onPress={() => setPositions(positions.filter((x) => x !== p))} />)}
          </Row>
          <Row>
            <View style={{ flex: 1 }}><Field label={t('welcome.addPosition')} value={extra} onChangeText={setExtra} maxLength={40} onSubmitEditing={() => { const v = extra.trim(); if (v && !positions.some((x) => x.toLowerCase() === v.toLowerCase())) setPositions([...positions, v]); setExtra(''); }} /></View>
          </Row>
          <T v="tiny" style={{ marginBottom: 8 }}>{t('welcome.periodsNote')}</T>
          <Button label={t('welcome.createGo')} onPress={create} busy={busy} />
          <Button kind="ghost" label={t('common.back')} onPress={() => { setStep('choose'); setErr(null); }} />
        </>
      ) : (
        <>
          <T v="small" style={{ marginBottom: 12 }}>{t('welcome.joinHelp')}</T>
          <Field label={t('welcome.code')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={14} placeholder="ABCD-EF23GH" />
          <Button label={t('welcome.joinGo')} onPress={join} busy={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 10} />
          <Button kind="ghost" label={t('common.back')} onPress={() => { setStep('choose'); setErr(null); }} />
        </>
      )}
    </Screen>
  );
}
