import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../i18n';
import { AppProvider, useApp } from '../lib/session';
import { configured } from '../lib/supabase';
import { Empty, Loading, Screen } from '../ui/kit';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider><Gate /></AppProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { t } = useTranslation();
  const { session, ready } = useApp();
  if (!configured) return <Screen title="Quarti"><Empty icon="construct-outline" text={t('errors.notConfigured')} /></Screen>;
  if (!ready) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
