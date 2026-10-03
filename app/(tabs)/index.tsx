import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import LowStockBanner from '../../src/features/dashboard/components/LowStockBanner';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  const assignmentLabel = profile?.assignment
    ? profile.assignment.charAt(0).toUpperCase() + profile.assignment.slice(1)
    : 'Shop';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>
            Welcome, {profile?.full_name ?? 'User'}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.storeBadge}>
              <MaterialCommunityIcons name="storefront-outline" size={14} color="#1A73E8" />
              <Text style={styles.storeBadgeText}>{assignmentLabel}</Text>
            </View>
            <Text style={styles.dateText}>Fakhri Glass</Text>
          </View>
        </View>
      </View>

      {/* ── Low Stock Banner ── */}
      <LowStockBanner />

      {/* ── Quick Navigation Cards ── */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>

      <View style={styles.cardGrid}>
        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/(tabs)/orders')}
        >
          <View style={[styles.actionIconBox, { backgroundColor: '#EFF6FF' }]}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={26} color="#1A73E8" />
          </View>
          <View style={styles.actionCardText}>
            <Text style={styles.actionCardTitle}>Orders</Text>
            <Text style={styles.actionCardDesc}>Track orders, sizes & customer details</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/(tabs)/inventory')}
        >
          <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
            <MaterialCommunityIcons name="package-variant-closed" size={26} color="#059669" />
          </View>
          <View style={styles.actionCardText}>
            <Text style={styles.actionCardTitle}>Inventory</Text>
            <Text style={styles.actionCardDesc}>Manage full sheets, offcuts & stock counts</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    marginTop: 4,
  },
  headerText: {
    gap: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  storeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  storeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A73E8',
  },
  dateText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  cardGrid: {
    gap: 10,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  actionCardPressed: {
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.99 }],
  },
  actionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionCardText: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  actionCardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
});
