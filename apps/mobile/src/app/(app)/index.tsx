// Where a signed-in person lands: set up or join a shop, or straight into the manager or worker app.
import { Redirect } from 'expo-router';
import { useApp } from '../../lib/session';

export default function Landing() {
  const { shop, mode } = useApp();
  if (!shop) return <Redirect href="/welcome" />;
  return <Redirect href={mode === 'manager' ? '/today' : '/home'} />;
}
