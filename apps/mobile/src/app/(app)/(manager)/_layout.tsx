import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../lib/session';
import { C } from '../../../ui/theme';

export default function ManagerTabs() {
  const { t } = useTranslation();
  const { shop, mode } = useApp();
  if (!shop) return <Redirect href="/welcome" />;
  if (mode !== 'manager' || !shop.manages) return <Redirect href="/home" />;   // lost access, or this person only works here
  const icon = (n: React.ComponentProps<typeof Ionicons>['name']) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={n} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.br, tabBarInactiveTintColor: C.t3, tabBarStyle: { backgroundColor: C.s2 } }}>
      <Tabs.Screen name="today" options={{ title: t('tabs.today'), tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="schedule" options={{ title: t('tabs.schedule'), tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="staff" options={{ title: t('tabs.staff'), tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="shop" options={{ title: t('tabs.shop'), tabBarIcon: icon('storefront-outline') }} />
    </Tabs>
  );
}
