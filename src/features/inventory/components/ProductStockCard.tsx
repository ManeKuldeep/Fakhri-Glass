import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatMm, formatFtIn } from '../utils';
import { useRemoveStock } from '../mutations';
import type { StockItemWithProduct } from '../queries';

export interface ProductStockGroup {
  productId: string;
  product: StockItemWithProduct['product'];
  totalSheets: number;
  items: StockItemWithProduct[];
}

interface SizeCluster {
  key: string;
  widthMm: number;
  heightMm: number;
  source: 'full' | 'offcut';
  verticalLineHeightMm: number | null;
  count: number;
  items: StockItemWithProduct[];
}

interface ProductStockCardProps {
  group: ProductStockGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showFtIn: boolean;
  onEdit: (id: string) => void;
}

export default function ProductStockCard({
  group,
  isExpanded,
  onToggleExpand,
  showFtIn,
  onEdit,
}: ProductStockCardProps) {
  const removeStock = useRemoveStock();
  const { product, totalSheets, items } = group;

  const dimFormat = showFtIn ? formatFtIn : formatMm;

  // Track draft quantity to remove for each size cluster
  const [removeQuantities, setRemoveQuantities] = useState<Record<string, string>>({});

  // Group items by dimensions + source within this product
  const sizeClusters = useMemo(() => {
    const clusterMap = new Map<string, SizeCluster>();

    for (const item of items) {
      const clusterKey = `${item.width_mm}x${item.height_mm}_${item.source}_${
        item.vertical_line_height_mm ?? 'none'
      }`;

      const existing = clusterMap.get(clusterKey);
      if (existing) {
        existing.count += 1;
        existing.items.push(item);
      } else {
        clusterMap.set(clusterKey, {
          key: clusterKey,
          widthMm: item.width_mm,
          heightMm: item.height_mm,
          source: item.source as 'full' | 'offcut',
          verticalLineHeightMm: item.vertical_line_height_mm,
          count: 1,
          items: [item],
        });
      }
    }

    return Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
  }, [items]);

  function handleRemoveSingleSheet(cluster: SizeCluster) {
    const sizeStr = `${dimFormat(cluster.widthMm)} × ${dimFormat(cluster.heightMm)}`;
    Alert.alert(
      'Remove 1 sheet?',
      `Are you sure you want to remove 1 sheet of ${sizeStr}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeStock.mutate(cluster.items[0].id, {
              onSuccess: () => {
                Alert.alert('Stock Removed', '1 sheet removed from inventory.');
              },
            });
          },
        },
      ],
    );
  }

  function handleRemoveBatch(cluster: SizeCluster) {
    const rawVal = removeQuantities[cluster.key] ?? '1';
    const qty = parseInt(rawVal.trim(), 10);

    if (Number.isNaN(qty) || qty < 1) {
      Alert.alert(
        'Invalid Quantity',
        'Please enter a valid number of sheets to remove (at least 1).',
      );
      return;
    }

    if (qty > cluster.count) {
      Alert.alert(
        'Quantity Exceeded',
        `You cannot remove ${qty} sheets. Only ${cluster.count} available in stock for this size.`,
      );
      return;
    }

    const sizeStr = `${dimFormat(cluster.widthMm)} × ${dimFormat(cluster.heightMm)}`;
    Alert.alert(
      `Remove ${qty} sheet${qty > 1 ? 's' : ''}?`,
      `Are you sure you want to remove ${qty} sheet${qty > 1 ? 's' : ''} of ${sizeStr}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const idsToRemove = cluster.items.slice(0, qty).map((i) => i.id);
            removeStock.mutate(idsToRemove, {
              onSuccess: () => {
                Alert.alert(
                  'Stock Removed',
                  `${qty} sheet${qty > 1 ? 's' : ''} removed from inventory.`,
                );
                // Reset input back to 1
                setRemoveQuantities((prev) => ({ ...prev, [cluster.key]: '1' }));
              },
            });
          },
        },
      ],
    );
  }

  return (
    <View style={styles.card}>
      {/* ── Header row (always visible) ── */}
      <Pressable
        style={({ pressed }) => [
          styles.headerRow,
          pressed && styles.headerRowPressed,
        ]}
        onPress={onToggleExpand}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.subInfoRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{product.category.name}</Text>
            </View>
            <Text style={styles.specText}>{product.thickness_mm} mm</Text>
            {product.color ? (
              <Text style={styles.specText}>· {product.color}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {totalSheets} {totalSheets === 1 ? 'sheet' : 'sheets'}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={22}
            color="#64748B"
          />
        </View>
      </Pressable>

      {/* ── Expanded section: sizes breakdown ── */}
      {isExpanded ? (
        <View style={styles.expandedContent}>
          <View style={styles.divider} />
          <Text style={styles.breakdownHeader}>Sizes in stock:</Text>

          {sizeClusters.map((cluster) => {
            const dims = `${dimFormat(cluster.widthMm)} × ${dimFormat(cluster.heightMm)}`;
            const isFull = cluster.source === 'full';
            const sourceColor = isFull ? '#059669' : '#D97706';
            const sourceBg = isFull ? '#ECFDF5' : '#FFFBEB';
            const removeQtyInput = removeQuantities[cluster.key] ?? '1';
            const removeQtyNum = parseInt(removeQtyInput.trim(), 10) || 1;

            return (
              <View key={cluster.key} style={styles.sizeCard}>
                <View style={styles.sizeCardTop}>
                  <View style={styles.sizeInfo}>
                    <Text style={styles.sizeDimensions}>{dims}</Text>
                    <View style={styles.sizeMetaRow}>
                      <View style={[styles.sourceBadge, { backgroundColor: sourceBg }]}>
                        <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>
                          {isFull ? 'Full Sheet' : 'Offcut'}
                        </Text>
                      </View>
                      {cluster.verticalLineHeightMm != null ? (
                        <Text style={styles.lineHeightText}>
                          Line: {dimFormat(cluster.verticalLineHeightMm)}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.sizeCountBox}>
                    <Text style={styles.sizeCountNum}>{cluster.count}</Text>
                    <Text style={styles.sizeCountLabel}>
                      {cluster.count === 1 ? 'sheet' : 'sheets'}
                    </Text>
                  </View>
                </View>

                {/* Actions for this size cluster */}
                <View style={styles.clusterActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => onEdit(cluster.items[0].id)}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={15} color="#1A73E8" />
                    <Text style={styles.actionTextEdit}>Edit</Text>
                  </Pressable>

                  {/* Single sheet removal */}
                  {cluster.count === 1 ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtnRemove,
                        pressed && styles.actionBtnPressed,
                      ]}
                      onPress={() => handleRemoveSingleSheet(cluster)}
                    >
                      <MaterialCommunityIcons name="delete-outline" size={15} color="#DC2626" />
                      <Text style={styles.actionTextRemove}>Remove Sheet</Text>
                    </Pressable>
                  ) : (
                    /* Multiple sheets batch removal */
                    <View style={styles.batchRemoveControls}>
                      <Text style={styles.batchLabel}>Remove:</Text>
                      <TextInput
                        style={styles.batchQtyInput}
                        value={removeQtyInput}
                        onChangeText={(t) =>
                          setRemoveQuantities((prev) => ({
                            ...prev,
                            [cluster.key]: t,
                          }))
                        }
                        keyboardType="number-pad"
                        selectTextOnFocus
                        maxLength={4}
                      />
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionBtnRemove,
                          pressed && styles.actionBtnPressed,
                        ]}
                        onPress={() => handleRemoveBatch(cluster)}
                      >
                        <MaterialCommunityIcons name="delete-outline" size={15} color="#DC2626" />
                        <Text style={styles.actionTextRemove}>
                          {removeQtyNum > 1 ? `Remove (${removeQtyNum})` : 'Remove (1)'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerRowPressed: {
    backgroundColor: '#F8FAFC',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  subInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  specText: {
    fontSize: 12,
    color: '#64748B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A73E8',
  },
  // Expanded
  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 10,
  },
  breakdownHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sizeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  sizeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sizeInfo: {
    flex: 1,
  },
  sizeDimensions: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sizeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  lineHeightText: {
    fontSize: 11,
    color: '#64748B',
  },
  sizeCountBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    minWidth: 50,
  },
  sizeCountNum: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sizeCountLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  clusterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnPressed: {
    opacity: 0.7,
  },
  actionTextEdit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A73E8',
  },
  batchRemoveControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  batchQtyInput: {
    width: 44,
    height: 32,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  actionBtnRemove: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  actionTextRemove: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
});
