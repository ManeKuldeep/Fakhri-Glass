import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import type { UserProfile } from '../src/stores/authStore';

const queryClient = new QueryClient();

/** Fetch the logged-in user's profile from the `profiles` table. */
async function fetchProfile(userId: string, retries = 2): Promise<UserProfile | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, shop_id, full_name, assignment')
      .eq('id', userId)
      .single();

    if (!error) {
      return data;
    }

    // Handle transient clock-skew timing (e.g. "JWT issued at future")
    if (error.message?.toLowerCase().includes('future') && attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    console.error('Failed to fetch profile:', error.message);
    return null;
  }
  return null;
}

/**
 * Redirects unauthenticated users to /login and authenticated users
 * away from /login, based on the current Zustand state.
 */
function useProtectedRoute() {
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    // Wait until loading finishes and the root navigation tree is fully mounted
    if (isLoading || !rootNavigationState?.key) return;

    const inAuthGroup = segments[0] === 'login';

    if (!profile && !inAuthGroup) {
      router.replace('/login');
    } else if (profile && inAuthGroup) {
      // Landing tab depends on assignment: cutter → Cut, everyone else → Orders
      const landing = profile.assignment === 'cutter' ? '/(tabs)/cut' : '/(tabs)/orders';
      router.replace(landing);
    }
  }, [profile, isLoading, segments, router, rootNavigationState?.key]);
}

export default function RootLayout() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    // Listen for auth state changes (including INITIAL_SESSION on app start)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          setProfile(profile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setProfile, setLoading]);

  useProtectedRoute();

  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#1A73E8" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Slot />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
});
