import { Stack } from 'expo-router';
import { useApp } from '../../lib/session';
import { Loading } from '../../ui/kit';

export default function AppLayout() {
  const { shops } = useApp();
  if (shops === null) return <Loading />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
