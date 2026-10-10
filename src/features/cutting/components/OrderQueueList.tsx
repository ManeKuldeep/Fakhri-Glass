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

  const [viewMode, setViewMode] = useState<'product' | 'order'>('product');
  const [storeFilter, setStoreFilter] = useState<string | undefined>(defaultStore);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const { data: queue, isLoading, error, refetch } = useCuttingQueue(storeFilter);

  // Group all tasks by product for the "By Product Type" view
  const productGroups = useMemo(() => {
    if (!queue) return [];
    const map = new Map<string, CuttingQueueTask[]>();
    for (const t of queue) {
      const arr = map.get(t.productId) ?? [];
      arr.push(t);
      map.set(t.productId, arr);
    }

    return Array.from(map.entries()).map(([productId, tasks]) => {
      const totalPieces = tasks.reduce((sum, t) => sum + t.totalPiecesCount, 0);
      const orderNos = Array.from(
        new Set(
          tasks.flatMap((t) =>
            t.orderNos && t.orderNos.length > 0 ? t.orderNos : [t.orderNo],
          ),
        ),
      );

      const uniqueSizes = new Map<string, { w: number; h: number; qty: number }>();
      for (const t of tasks) {
        for (const oi of t.orderItems) {
          const key = `${oi.widthMm}x${oi.heightMm}`;
          const cur = uniqueSizes.get(key);
          if (cur) {
            cur.qty += oi.qty;
          } else {
            uniqueSizes.set(key, { w: oi.widthMm, h: oi.heightMm, qty: oi.qty });
          }
        }
      }

      return {
        productId,
        productName: tasks[0].productName,
        categoryName: tasks[0].categoryName,
        thicknessMm: tasks[0].thicknessMm,
        color: tasks[0].color,
        isLining: tasks[0].isLining,
        tasks,
        totalPieces,
        orderNos,
        sizes: Array.from(uniqueSizes.values()),
      };
    });
  }, [queue]);

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

  const renderProductGroupCard = ({
    item,
  }: {
    item: (typeof productGroups)[number];
  }) => {
    return (
      <View style={styles.productCard}>
        <View style={styles.productCardHeader}>
          <View style={styles.productIconBox}>
            <MaterialCommunityIcons name="layers-outline" size={24} color="#1A73E8" />
          </View>
          <View style={styles.productTitleArea}>
            <Text style={styles.productCardTitle}>{item.productName}</Text>
            <Text style={styles.productCardSubtitle}>
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

        {/* Aggregated Orders & Pieces Stats */}
        <View style={styles.productStatsRow}>
          <View style={styles.productStatBox}>
            <Text style={styles.productStatNumber}>{item.totalPieces}</Text>
            <Text style={styles.productStatLabel}>
              {item.totalPieces === 1 ? 'Piece' : 'Pieces'} to Cut
            </Text>
          </View>
          <View style={styles.productStatBox}>
            <Text style={styles.productStatNumber}>{item.orderNos.length}</Text>
            <Text style={styles.productStatLabel}>
              {item.orderNos.length === 1 ? 'Order' : 'Orders'} Pending
            </Text>
          </View>
          <View style={styles.productStatBox}>
            <Text style={styles.productStatNumber}>{item.sizes.length}</Text>
            <Text style={styles.productStatLabel}>
              {item.sizes.length === 1 ? 'Size Spec' : 'Size Specs'}
            </Text>
          </View>
        </View>

        {/* Orders list tags */}
        <View style={styles.ordersTagRow}>
          <Text style={styles.ordersTagLabel}>Orders:</Text>
          <View style={styles.ordersPillsWrap}>
            {item.orderNos.map((no) => (
              <View key={no} style={styles.orderNoPill}>
                <Text style={styles.orderNoPillText}>#{no}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sizes breakdown preview */}
        <View style={styles.sizesContainer}>
          {item.sizes.slice(0, 4).map((s, idx) => (
            <View key={idx} style={styles.sizeItemRow}>
              <Text style={styles.dimensionTag}>
                {s.w} × {s.h} mm
              </Text>
              <Text style={styles.qtyTag}>
                {s.qty} {s.qty === 1 ? 'pc' : 'pcs'}
              </Text>
            </View>
          ))}
          {item.sizes.length > 4 && (
            <Text style={styles.moreSizesText}>
              + {item.sizes.length - 4} more size specifications
            </Text>
          )}
        </View>

        {/* Big Visualise CTA Button */}
        <Pressable
          style={({ pressed }) => [
            styles.productActionBtn,
            pressed && styles.productActionBtnPressed,
          ]}
          onPress={() => {
            const merged = mergeCuttingQueueTasks(item.tasks);
            onSelectTask(merged);
          }}
        >
          <MaterialCommunityIcons name="content-cut" size={20} color="#FFFFFF" />
          <Text style={styles.productActionBtnText}>
            Visualise All Pieces in Space Optimiser ({item.totalPieces} pcs)
          </Text>
        </Pressable>
      </View>
    );
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
              {item.isPartiallyCut && (
                <View style={styles.partialBadge}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color="#D97706" />
                  <Text style={styles.partialBadgeText}>Partially Cut · On Hold</Text>
                </View>
              )}
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
                {oi.cutQty && oi.cutQty > 0 ? ` (${oi.cutQty} cut)` : ''}
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

  return (
    <View style={styles.container}>
      {/* Top Bar with Store Filter & Settings */}
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

      {/* Segmented View Mode Toggle: By Product Type vs By Order Queue */}
      <View style={styles.viewModeContainer}>
        <Pressable
          style={[
            styles.viewModeBtn,
            viewMode === 'product' && styles.viewModeBtnActive,
          ]}
          onPress={() => setViewMode('product')}
        >
          <MaterialCommunityIcons
            name="layers-outline"
            size={18}
            color={viewMode === 'product' ? '#FFFFFF' : '#64748B'}
          />
          <Text
            style={[
              styles.viewModeText,
              viewMode === 'product' && styles.viewModeTextActive,
            ]}
          >
            By Product Type ({productGroups.length})
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.viewModeBtn,
            viewMode === 'order' && styles.viewModeBtnActive,
          ]}
          onPress={() => setViewMode('order')}
        >
          <MaterialCommunityIcons
            name="format-list-checks"
            size={18}
            color={viewMode === 'order' ? '#FFFFFF' : '#64748B'}
          />
          <Text
            style={[
              styles.viewModeText,
              viewMode === 'order' && styles.viewModeTextActive,
            ]}
          >
            By Order Queue ({queue?.length ?? 0})
          </Text>
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
        viewMode === 'product' ? (
          <FlatList
            data={productGroups}
            keyExtractor={(item) => item.productId}
            renderItem={renderProductGroupCard}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <FlatList
            data={queue}
            keyExtractor={(item) => `${item.orderId}:${item.productId}`}
            renderItem={renderTaskCard}
            contentContainerStyle={[
              styles.listContent,
              selectedTasks.length > 0 && styles.listContentWithBottomBar,
            ]}
          />
        )
      ) : (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="check-decagram-outline" size={56} color="#10B981" />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySubtext}>
            There are no pending items waiting to be cut.
          </Text>
        </View>
      )}

      {/* Floating Bottom Bar when 1 or more tasks selected in By Order mode */}
      {viewMode === 'order' && selectedTasks.length > 0 && (
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
    paddingVertical: 10,
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
  viewModeContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 3,
    gap: 4,
  },
  viewModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  viewModeBtnActive: {
    backgroundColor: '#1A73E8',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  viewModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  viewModeTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listContentWithBottomBar: {
    paddingBottom: 110,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  productIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  productTitleArea: {
    flex: 1,
  },
  productCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  productCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  productStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
    gap: 8,
  },
  productStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  productStatNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A73E8',
  },
  productStatLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  ordersTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  ordersTagLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  ordersPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  orderNoPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orderNoPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  sizesContainer: {
    marginBottom: 14,
    gap: 4,
  },
  sizeItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  moreSizesText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 2,
  },
  productActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A73E8',
    height: 46,
    borderRadius: 10,
  },
  productActionBtnPressed: {
    backgroundColor: '#1557B0',
  },
  productActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
  partialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  partialBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
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
});
