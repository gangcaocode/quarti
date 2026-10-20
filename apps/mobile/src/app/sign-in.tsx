// Email code sign-in: type your email, get a 6-digit code, type it. No passwords. (rules: pilot decisions)
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { supabase } from '../lib/supabase';
import { LangSwitch } from '../ui/LangSwitch';
import { Button, Field, Notice, Screen, T } from '../ui/kit';
import { C } from '../ui/theme';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const e = email.trim().toLowerCase();
    if (!EMAIL.test(e)) { setErr(t('auth.badEmail')); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setErr(error.status === 429 ? t('auth.tooMany') : t('errors.network'));
    else { setEmail(e); setSent(true); }
  }
  async function verify() {
    if (!/^\d{6,10}$/.test(code.trim())) { setErr(t('auth.badCode')); return; }   // Supabase codes are 6–10 digits (set in the project)
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr(t('auth.badCode'));
    // on success the session changes and the app moves on by itself
  }

  return (
    <Screen>
      <View style={{ marginTop: 56, marginBottom: 28 }}>
        <T v="h2" style={{ fontSize: 32, color: C.br }}>Quarti</T>
        <T v="small" style={{ marginTop: 4 }}>{t('auth.tagline')}</T>
      </View>
      {err ? <Notice tone="error" text={err} /> : null}
      {!sent ? (
        <>
          <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" onSubmitEditing={send} returnKeyType="send" />
          <Button label={t('auth.sendCode')} onPress={send} busy={busy} />
          <T v="tiny" style={{ marginTop: 12 }}>{t('auth.noPassword')}</T>
        </>
      ) : (
        <>
          <T v="small" style={{ marginBottom: 12 }}>{t('auth.codeSent', { email })}</T>
          <Field label={t('auth.code')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} onSubmitEditing={verify} />
          <Button label={t('auth.verify')} onPress={verify} busy={busy} />
          <Button label={t('auth.otherEmail')} kind="ghost" onPress={() => { setSent(false); setCode(''); setErr(null); }} />
        </>
      )}
      <View style={{ marginTop: 28 }}><LangSwitch /></View>
    </Screen>
  );
}
