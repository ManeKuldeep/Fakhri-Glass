import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { logEvent } from '../../src/lib/logEvent';
import { useAuthStore } from '../../src/stores/authStore';

export default function SettingsScreen() {
  const profile = useAuthStore((s) => s.profile);

  async function handleLogout() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logEvent('Logout');
          await supabase.auth.signOut();
          // onAuthStateChange in _layout.tsx clears the store and redirects.
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      {/* User info */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.full_name ?? '—'}</Text>
          <Text style={styles.profileAssignment}>
            {profile?.assignment
              ? profile.assignment.charAt(0).toUpperCase() + profile.assignment.slice(1)
              : '—'}
          </Text>
        </View>
      </View>

      {/* Logout button */}
      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.logoutButtonPressed,
        ]}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      {/* Version */}
      <Text style={styles.version}>Fakhri Glass v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,

    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
  },
  profileAssignment: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  logoutButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonPressed: {
    backgroundColor: '#FEE2E2',
  },
  logoutText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 'auto',
    paddingBottom: 24,
  },
});
