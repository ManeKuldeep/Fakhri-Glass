import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { STORES } from '../../../constants/stores';
import { useAuthStore } from '../../../stores/authStore';
import { useCuttingQueue } from '../queries';
import { CuttingProductQueueItem } from '../types';

interface OrderQueueListProps {
  onSelectProduct: (productQueueItem: CuttingProductQueueItem) => void;
  onOpenSettings: () => void;
}

export default function OrderQueueList({
  onSelectProduct,
  onOpenSettings,
}: OrderQueueListProps) {
  const profile = useAuthStore((s) => s.profile);
  // Default filter: cutter sees all, store users default to their store
  const defaultStore =
    profile?.assignment === 'mumbai' || profile?.assignment === 'sanpada'
      ? profile.assignment
      : undefined;

  const [storeFilter, setStoreFilter] = useState<string | undefined>(defaultStore);

  const { data: queue, isLoading, error, refetch } = useCuttingQueue(storeFilter);

  const renderProductCard = ({ item }: { item: CuttingProductQueueItem }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.titleArea}>
            <Text style={styles.productName}>{item.productName}</Text>
            <Text style={styles.categoryText}>
              {item.categoryName} · {item.thicknessMm} mm
              {item.color ? ` · ${item.color}` : ''}
            </Text>
          </View>

          {item.isLining ? (
            <View style={styles.liningBadge}>
              <MaterialCommunityIcons name="texture-box" size={14} color="#B45309" />
              <Text style={styles.liningBadgeText}>Figured / Lining</Text>
            </View>
          ) : null}
        </View>

        {/* Piece stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{item.totalPiecesCount}</Text>
            <Text style={styles.statLabel}>
              {item.totalPiecesCount === 1 ? 'Piece' : 'Pieces'} to Cut
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{item.orderItems.length}</Text>
            <Text style={styles.statLabel}>
              {item.orderItems.length === 1 ? 'Order Item' : 'Order Items'}
            </Text>
          </View>
        </View>

        {/* Breakdown of orders */}
        <View style={styles.ordersList}>
          {item.orderItems.map((oi) => (
            <View key={oi.orderItemId} style={styles.orderItemRow}>
              <Text style={styles.orderNo}>Order #{oi.orderNo}</Text>
              <Text style={styles.customerName}>{oi.customerName}</Text>
              <Text style={styles.dimensionTag}>
                {oi.widthMm} × {oi.heightMm} mm ({oi.qty} pcs)
              </Text>
            </View>
          ))}
        </View>

        {/* Action Button */}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => onSelectProduct(item)}
        >
          <MaterialCommunityIcons name="content-cut" size={18} color="#FFFFFF" />
          <Text style={styles.actionBtnText}>Open Cut Optimiser</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Bar with Filter & Settings */}
      <View style={styles.topBar}>
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, !storeFilter && styles.filterChipActive]}
            onPress={() => setStoreFilter(undefined)}
          >
            <Text
              style={[
                styles.filterChipText,
                !storeFilter && styles.filterChipTextActive,
              ]}
            >
              All Stores
            </Text>
          </Pressable>

          {STORES.map((s) => (
            <Pressable
              key={s.value}
              style={[
                styles.filterChip,
                storeFilter === s.value && styles.filterChipActive,
              ]}
              onPress={() => setStoreFilter(s.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  storeFilter === s.value && styles.filterChipTextActive,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.settingsBtn} onPress={onOpenSettings} hitSlop={8}>
          <MaterialCommunityIcons name="cog" size={22} color="#1E293B" />
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.loadingText}>Loading pending cut queue...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{error.message}</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : queue && queue.length > 0 ? (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.productId}
          renderItem={renderProductCard}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="check-decagram-outline" size={56} color="#10B981" />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySubtext}>
            There are no pending orders waiting to be cut.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: '#1A73E8',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  settingsBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleArea: {
    flex: 1,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  liningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  liningBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A73E8',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  ordersList: {
    marginBottom: 14,
    gap: 6,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderNo: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    width: 90,
  },
  customerName: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    paddingHorizontal: 6,
  },
  dimensionTag: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A73E8',
    height: 44,
    borderRadius: 10,
  },
  actionBtnPressed: {
    backgroundColor: '#1557B0',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1A73E8',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
});
