import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import FilterBar from '../../src/features/inventory/components/FilterBar';
import StockItemCard from '../../src/features/inventory/components/StockItemCard';
import AddStockForm from '../../src/features/inventory/components/AddStockForm';
import EditStockForm from '../../src/features/inventory/components/EditStockForm';
import { useStockItems } from '../../src/features/inventory/queries';
import type { StockFilters } from '../../src/features/inventory/queries';

export default function InventoryScreen() {
  // ─── Filters ───────────────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [productId, setProductId] = useState<string | undefined>();
  const [source, setSource] = useState<'full' | 'offcut' | undefined>();
  const [showFtIn, setShowFtIn] = useState(false);

  const filters: StockFilters = {
    categoryId,
    productId,
    source,
    status: 'available',
  };

  const { data: stockItems, isLoading, error, refetch } = useStockItems(filters);

  // ─── Modals ────────────────────────────────────────────────────────────────
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EditItem | null>(null);

  type EditItem = NonNullable<typeof stockItems>[number];

  const handleEdit = useCallback(
    (id: string) => {
      const item = stockItems?.find((s) => s.id === id);
      if (item) setEditingItem(item);
    },
    [stockItems],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: EditItem }) => (
      <StockItemCard item={item} showFtIn={showFtIn} onEdit={handleEdit} />
    ),
    [showFtIn, handleEdit],
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <FilterBar
        selectedCategoryId={categoryId}
        selectedProductId={productId}
        selectedSource={source}
        onCategoryChange={setCategoryId}
        onProductChange={setProductId}
        onSourceChange={setSource}
      />

      {/* Unit toggle */}
      <View style={styles.toolbar}>
        <Text style={styles.countText}>
          {stockItems ? `${stockItems.length} item${stockItems.length !== 1 ? 's' : ''}` : ''}
        </Text>
        <Pressable
          style={styles.unitToggle}
          onPress={() => setShowFtIn((prev) => !prev)}
        >
          <MaterialCommunityIcons
            name="swap-horizontal"
            size={16}
            color="#1A73E8"
          />
          <Text style={styles.unitToggleText}>
            {showFtIn ? 'ft/in' : 'mm'}
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Failed to load stock.'}
          </Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : stockItems && stockItems.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons
            name="package-variant"
            size={48}
            color="#CBD5E1"
          />
          <Text style={styles.emptyText}>No stock items found</Text>
          <Text style={styles.emptySubtext}>
            Tap + to add your first sheet
          </Text>
        </View>
      ) : (
        <FlatList
          data={stockItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setAddModalVisible(true)}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
      </Pressable>

      {/* Modals */}
      <AddStockForm
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
      />
      <EditStockForm
        visible={editingItem != null}
        onClose={() => setEditingItem(null)}
        item={editingItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
  },
  unitToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 80,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: '#1557B0',
    transform: [{ scale: 0.95 }],
  },
});
