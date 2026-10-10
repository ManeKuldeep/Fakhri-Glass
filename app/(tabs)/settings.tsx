import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { logEvent } from '../../src/lib/logEvent';
import { useAuthStore } from '../../src/stores/authStore';
import { exportShopBackup } from '../../src/features/settings/utils/exportBackup';
import FakhriLogo from '../../src/components/common/FakhriLogo';

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    try {
      setIsExporting(true);
      const result = await exportShopBackup();
      if (result.success) {
        Alert.alert('Backup Export', `Successfully prepared ${result.totalRecords} records.`);
      }
    } catch (err) {
      Alert.alert(
        'Export Failed',
        err instanceof Error ? err.message : 'Could not export shop backup.',
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logEvent('Logout');
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── User info ── */}
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

      {/* ── App Data & Audit Section ── */}
      <Text style={styles.sectionHeader}>Data & History</Text>
      <View style={styles.menuCard}>
        {/* Activity Log */}
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          onPress={() => router.push('/activity-log')}
        >
          <View style={[styles.menuIconBox, { backgroundColor: '#F5F3FF' }]}>
            <MaterialCommunityIcons name="history" size={22} color="#7C3AED" />
          </View>
          <View style={styles.menuText}>
            <Text style={styles.menuTitle}>Activity Log</Text>
            <Text style={styles.menuSubtitle}>Audit history and user events</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <View style={styles.menuDivider} />

        {/* Export Backup */}
        <Pressable
          style={({ pressed }) => [
            styles.menuItem,
            pressed && styles.menuItemPressed,
            isExporting && styles.menuItemDisabled,
          ]}
          onPress={handleExport}
          disabled={isExporting}
        >
          <View style={[styles.menuIconBox, { backgroundColor: '#EFF6FF' }]}>
            {isExporting ? (
              <ActivityIndicator size="small" color="#1A73E8" />
            ) : (
              <MaterialCommunityIcons name="database-export-outline" size={22} color="#1A73E8" />
            )}
          </View>
          <View style={styles.menuText}>
            <Text style={styles.menuTitle}>Export Backup</Text>
            <Text style={styles.menuSubtitle}>
              {isExporting ? 'Preparing export...' : 'Share or download shop JSON data'}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>
      </View>

      {/* ── Business & Workshop Profile ── */}
      <Text style={styles.sectionHeader}>Business Details</Text>
      <View style={styles.businessCard}>
        <View style={styles.businessHeader}>
          <FakhriLogo variant="horizontal" size={42} />
        </View>
        <View style={styles.businessDivider} />
        <View style={styles.businessRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color="#A91D22" style={styles.businessIcon} />
          <Text style={styles.businessText}>
            Shop No. 6, Plot No. 3, Sector - 24, Turbhe, Navi Mumbai - 400705
          </Text>
        </View>
        <View style={styles.businessRow}>
          <MaterialCommunityIcons name="phone-outline" size={18} color="#A91D22" style={styles.businessIcon} />
          <Text style={styles.businessText}>
            Qutub Khan: 9930930445 · Shakir: 9322527399
          </Text>
        </View>
        <View style={styles.businessRow}>
          <MaterialCommunityIcons name="email-outline" size={18} color="#A91D22" style={styles.businessIcon} />
          <Text style={styles.businessText}>qutubkjao@gmail.com</Text>
        </View>
        <View style={styles.brandTagsRow}>
          <View style={styles.brandTag}>
            <Text style={styles.brandTagText}>MODIGUARD FLOAT GLASS</Text>
          </View>
          <View style={styles.brandTag}>
            <Text style={styles.brandTagText}>SAINT-GOBAIN</Text>
          </View>
        </View>
      </View>

      {/* ── Logout button ── */}
      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.logoutButtonPressed,
        ]}
        onPress={handleLogout}
      >
        <MaterialCommunityIcons name="logout" size={20} color="#DC2626" />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      {/* ── Version ── */}
      <Text style={styles.version}>Fakhri Glass v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuItemPressed: {
    backgroundColor: '#F8FAFC',
  },
  menuItemDisabled: {
    opacity: 0.6,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 66,
  },
  businessCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  businessHeader: {
    paddingBottom: 12,
  },
  businessDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  businessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  businessIcon: {
    marginRight: 10,
  },
  businessText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  brandTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  brandTag: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  brandTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9F1239',
    letterSpacing: 0.3,
  },
  logoutButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
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
    marginTop: 10,
  },
});
