import { Redirect } from 'expo-router';
import { useAuthContext } from '@/hooks/use-auth-context';

export default function HomeScreen() {
  const { isLoading, isLoggedIn } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (isLoggedIn) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/(auth)/login" />;
}
