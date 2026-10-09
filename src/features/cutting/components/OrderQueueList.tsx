import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { STORES } from '../../../constants/stores';
import { useAuthStore } from '../../../stores/authStore';
import { mergeCuttingQueueTasks, useCuttingQueue } from '../queries';
import { CuttingQueueTask } from '../types';

interface OrderQueueListProps {
  onSelectTask: (task: CuttingQueueTask) => void;
  onOpenSettings: () => void;
}

export default function OrderQueueList({
  onSelectTask,
  onOpenSettings,
}: OrderQueueListProps) {
  const profile = useAuthStore((s) => s.profile);
  // Default filter: cutter sees all, store users default to their store
  const defaultStore =
    profile?.assignment === 'mumbai' || profile?.assignment === 'sanpada'
      ? profile.assignment
      : undefined;

  const [storeFilter, setStoreFilter] = useState<string | undefined>(defaultStore);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const { data: queue, isLoading, error, refetch } = useCuttingQueue(storeFilter);

  const selectedTasks = useMemo(() => {
    if (!queue || selectedKeys.length === 0) return [];
    const keySet = new Set(selectedKeys);
    return queue.filter((t) => keySet.has(`${t.orderId}:${t.productId}`));
  }, [queue, selectedKeys]);

  const selectedProductId = selectedTasks[0]?.productId;
  const totalSelectedPieces = useMemo(
    () => selectedTasks.reduce((sum, t) => sum + t.totalPiecesCount, 0),
    [selectedTasks],
  );

  // Identify product groups that have 2 or more pending orders that can be space-optimised together
  const combinableGroups = useMemo(() => {
    if (!queue) return [];
    const map = new Map<string, CuttingQueueTask[]>();
    for (const t of queue) {
      const arr = map.get(t.productId) ?? [];
      arr.push(t);
      map.set(t.productId, arr);
    }
    const result: Array<{
      productId: string;
      productName: string;
      tasks: CuttingQueueTask[];
      totalPieces: number;
    }> = [];
    for (const [productId, tasks] of map.entries()) {
      if (tasks.length > 1) {
        result.push({
          productId,
          productName: tasks[0].productName,
          tasks,
          totalPieces: tasks.reduce((sum, t) => sum + t.totalPiecesCount, 0),
        });
      }
    }
    return result;
  }, [queue]);

  const allCompatibleKeys = useMemo(() => {
    if (!selectedProductId || !queue) return [];
    return queue
      .filter((t) => t.productId === selectedProductId)
      .map((t) => `${t.orderId}:${t.productId}`);
  }, [selectedProductId, queue]);

  const allCompatibleSelected =
    allCompatibleKeys.length > 0 && selectedKeys.length === allCompatibleKeys.length;

  const toggleSelectTask = (task: CuttingQueueTask) => {
    const key = `${task.orderId}:${task.productId}`;
    if (selectedKeys.includes(key)) {
      setSelectedKeys((prev) => prev.filter((k) => k !== key));
      return;
    }

    if (selectedTasks.length > 0 && selectedProductId && selectedProductId !== task.productId) {
      Alert.alert(
        'Different Glass Product',
        `You can only combine orders of the same glass product (${selectedTasks[0].productName}) on the same sheet. Clear current selection to choose this product instead?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Select This Product',
            onPress: () => setSelectedKeys([key]),
          },
        ],
      );
      return;
    }

    setSelectedKeys((prev) => [...prev, key]);
  };

  const handleLaunchCombined = () => {
    if (selectedTasks.length === 0) return;
    const merged = mergeCuttingQueueTasks(selectedTasks);
    onSelectTask(merged);
  };

  const renderTaskCard = ({ item }: { item: CuttingQueueTask }) => {
    const key = `${item.orderId}:${item.productId}`;
    const isSelected = selectedKeys.includes(key);
    const isCompatible = !selectedProductId || selectedProductId === item.productId;

    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        <View style={styles.cardHeader}>
          <Pressable
            style={styles.checkboxContainer}
            onPress={() => toggleSelectTask(item)}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={24}
              color={isSelected ? '#1A73E8' : isCompatible ? '#94A3B8' : '#E2E8F0'}
            />
          </Pressable>

          <Pressable
            style={styles.titleArea}
            onPress={() => toggleSelectTask(item)}
          >
            <View style={styles.orderBadgeRow}>
              <Text style={styles.orderNoBadge}>Order #{item.orderNo}</Text>
              <View style={styles.storeBadge}>
                <Text style={styles.storeBadgeText}>
                  {item.store === 'mumbai' ? 'Mumbai' : 'Sanpada'}
                </Text>
              </View>
            </View>

            <Text style={styles.customerName}>{item.customerName}</Text>
            <Text style={styles.productName}>{item.productName}</Text>
            <Text style={styles.categoryText}>
              {item.categoryName} · {item.thicknessMm} mm
              {item.color ? ` · ${item.color}` : ''}
            </Text>
          </Pressable>

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
              {item.orderItems.length === 1 ? 'Size Spec' : 'Size Specs'}
            </Text>
          </View>
        </View>

        {/* Breakdown of sizes */}
        <View style={styles.ordersList}>
          {item.orderItems.map((oi) => (
            <View key={oi.orderItemId} style={styles.orderItemRow}>
              <Text style={styles.dimensionTag}>
                {oi.widthMm} × {oi.heightMm} mm
              </Text>
              <Text style={styles.qtyTag}>
                {oi.qty} {oi.qty === 1 ? 'pc' : 'pcs'}
              </Text>
            </View>
          ))}
        </View>

        {/* Action Button */}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => onSelectTask(item)}
        >
          <MaterialCommunityIcons name="content-cut" size={18} color="#FFFFFF" />
          <Text style={styles.actionBtnText}>Open Cut Layout</Text>
        </Pressable>
      </View>
    );
  };

  const renderListHeader = () => {
    if (combinableGroups.length === 0) return null;
    return (
      <View style={styles.bannerContainer}>
        {combinableGroups.map((group) => (
          <View key={group.productId} style={styles.batchBanner}>
            <View style={styles.batchBannerHeader}>
              <View style={styles.batchIconWrapper}>
                <MaterialCommunityIcons
                  name="view-dashboard-variant-outline"
                  size={20}
                  color="#1A73E8"
                />
              </View>
              <View style={styles.batchBannerText}>
                <Text style={styles.batchBannerTitle}>All Orders Space Optimiser</Text>
                <Text style={styles.batchBannerSubtitle}>
                  {group.tasks.length} orders · {group.totalPieces} pieces · {group.productName}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.batchBannerBtn,
                pressed && styles.batchBannerBtnPressed,
              ]}
              onPress={() => {
                const merged = mergeCuttingQueueTasks(group.tasks);
                onSelectTask(merged);
              }}
            >
              <MaterialCommunityIcons name="content-cut" size={15} color="#FFFFFF" />
              <Text style={styles.batchBannerBtnText}>
                Visualise All ({group.tasks.length})
              </Text>
            </Pressable>
          </View>
        ))}
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
            onPress={() => {
              setStoreFilter(undefined);
              setSelectedKeys([]);
            }}
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
              onPress={() => {
                setStoreFilter(s.value);
                setSelectedKeys([]);
              }}
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
          <Text style={styles.loadingText}>Loading pending cut tasks...</Text>
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
          keyExtractor={(item) => `${item.orderId}:${item.productId}`}
          renderItem={renderTaskCard}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={[
            styles.listContent,
            selectedTasks.length > 0 && styles.listContentWithBottomBar,
          ]}
        />
      ) : (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="check-decagram-outline" size={56} color="#10B981" />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySubtext}>
            There are no pending items waiting to be cut.
          </Text>
        </View>
      )}

      {/* Floating Bottom Bar when 1 or more tasks selected */}
      {selectedTasks.length > 0 && (
        <View style={styles.floatingBottomBar}>
          <View style={styles.floatingBarInfo}>
            <Text style={styles.floatingBarTitle}>
              {selectedTasks.length} {selectedTasks.length === 1 ? 'Order' : 'Orders'} Selected
            </Text>
            <Text style={styles.floatingBarSubtitle}>
              {totalSelectedPieces} {totalSelectedPieces === 1 ? 'piece' : 'pieces'} ·{' '}
              {selectedTasks[0].productName}
            </Text>
          </View>

          <View style={styles.floatingBarActions}>
            <Pressable
              style={styles.floatingClearBtn}
              onPress={() => setSelectedKeys([])}
            >
              <Text style={styles.floatingClearText}>Clear</Text>
            </Pressable>

            {allCompatibleKeys.length > 1 && (
              <Pressable
                style={styles.floatingSelectAllBtn}
                onPress={() => {
                  if (allCompatibleSelected) {
                    setSelectedKeys([]);
                  } else {
                    setSelectedKeys(allCompatibleKeys);
                  }
                }}
              >
                <Text style={styles.floatingSelectAllText}>
                  {allCompatibleSelected ? 'Deselect' : 'Select All'}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.floatingCutBtn,
                pressed && styles.floatingCutBtnPressed,
              ]}
              onPress={handleLaunchCombined}
            >
              <MaterialCommunityIcons name="content-cut" size={18} color="#FFFFFF" />
              <Text style={styles.floatingCutText}>
                {selectedTasks.length > 1 ? 'Cut Together' : 'Open Layout'}
              </Text>
            </Pressable>
          </View>
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
  listContentWithBottomBar: {
    paddingBottom: 110,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSelected: {
    borderColor: '#1A73E8',
    backgroundColor: '#F8FAFC',
    shadowColor: '#1A73E8',
    shadowOpacity: 0.15,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkboxContainer: {
    marginRight: 10,
    marginTop: 2,
  },
  titleArea: {
    flex: 1,
  },
  orderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  orderNoBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  storeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  storeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  customerName: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  productName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  categoryText: {
    fontSize: 12,
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
    paddingVertical: 3,
  },
  dimensionTag: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  qtyTag: {
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
  floatingBottomBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingBarInfo: {
    flex: 1,
    marginRight: 12,
  },
  floatingBarTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  floatingBarSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  floatingBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingClearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  floatingClearText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  floatingCutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A73E8',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  floatingCutBtnPressed: {
    backgroundColor: '#1557B0',
  },
  floatingCutText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  floatingSelectAllBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  floatingSelectAllText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '600',
  },
  bannerContainer: {
    marginBottom: 8,
  },
  batchBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  batchBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  batchIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  batchBannerText: {
    flex: 1,
  },
  batchBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  batchBannerSubtitle: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 2,
  },
  batchBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A73E8',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  batchBannerBtnPressed: {
    backgroundColor: '#1557B0',
  },
  batchBannerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
