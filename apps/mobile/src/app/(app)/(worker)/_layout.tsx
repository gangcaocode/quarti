import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../lib/session';
import { C } from '../../../ui/theme';

export default function WorkerTabs() {
  const { t } = useTranslation();
  const { shop, mode } = useApp();
  if (!shop) return <Redirect href="/welcome" />;
  if (mode !== 'worker' || !shop.staff_id) return <Redirect href="/today" />;
  const icon = (n: React.ComponentProps<typeof Ionicons>['name']) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={n} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.br, tabBarInactiveTintColor: C.t3, tabBarStyle: { backgroundColor: C.s2 } }}>
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="shifts" options={{ title: t('tabs.shifts'), tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.me'), tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
