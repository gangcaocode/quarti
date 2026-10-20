import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useApp, useShop } from '../../../lib/session';
import { LangSwitch } from '../../../ui/LangSwitch';
import { Button, Chip, Row, Screen, Section, T } from '../../../ui/kit';

export default function Me() {
  const { t } = useTranslation();
  const shop = useShop();
  const { shops, pick, signOut, session } = useApp();
  return (
    <Screen title={t('me.title')}>
      <T v="small">{session?.user.email}</T>
      <View style={{ marginTop: 16 }}><LangSwitch /></View>
      {shop.manages ? <Button kind="secondary" icon="swap-horizontal" label={t('me.toManager')} onPress={async () => { await pick(shop.shop_id, 'manager'); router.replace('/today'); }} /> : null}
      {shops && shops.length > 1 ? (
        <>
          <Section title={t('me.shops')} />
          <Row style={{ flexWrap: 'wrap' }}>{shops.map((s) => <Chip key={s.shop_id} label={s.name} on={s.shop_id === shop.shop_id} onPress={async () => { await pick(s.shop_id); router.replace('/'); }} />)}</Row>
        </>
      ) : null}
      <Button kind="ghost" label={t('me.joinAnother')} onPress={() => router.push('/welcome')} />
      <Button kind="ghost" label={t('me.signOut')} onPress={signOut} />
    </Screen>
  );
}
