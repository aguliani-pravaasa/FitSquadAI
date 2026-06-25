import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useAuthContext } from '@/hooks/use-auth-context';
import AuthProvider from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isLoading, isLoggedIn } = useAuthContext();
  const segments = useSegments() as unknown as string[];
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const isRootIndex = segments.length === 0 || (inTabsGroup && (segments[1] === 'index' || segments.length === 1));

    if (!isLoggedIn && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isLoggedIn && (inAuthGroup || isRootIndex)) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isLoggedIn, segments, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}
