// An invite link (quarti://join/<code>) opened on the phone: join that shop and go to the worker app.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errText } from '../../../i18n';
import { api } from '../../../lib/api';
import { useApp } from '../../../lib/session';
import { Button, Loading, Notice, Screen } from '../../../ui/kit';

export default function Join() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { pick } = useApp();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.joinShop(String(token ?? '')).then(async (shop) => { await pick(shop, 'worker'); if (live) router.replace('/home'); })
      .catch((e) => live && setErr(errText(t, e)));
    return () => { live = false; };
  }, [token, pick, t]);
  if (!err) return <Loading />;
  return <Screen title={t('welcome.join')}><Notice tone="error" text={err} /><Button label={t('common.continue')} onPress={() => router.replace('/')} /></Screen>;
}
