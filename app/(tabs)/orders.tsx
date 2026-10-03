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
import OrderFilterBar from '../../src/features/orders/components/OrderFilterBar';
import OrderCard from '../../src/features/orders/components/OrderCard';
import CreateOrderForm from '../../src/features/orders/components/CreateOrderForm';
import OrderDetail from '../../src/features/orders/components/OrderDetail';
import { useOrders } from '../../src/features/orders/queries';
import type { OrderListFilters } from '../../src/features/orders/queries';
import { useAuthStore } from '../../src/stores/authStore';

export default function OrdersScreen() {
  const profile = useAuthStore((s) => s.profile);

  // Default store filter based on assignment
  const defaultStore =
    profile?.assignment === 'mumbai' || profile?.assignment === 'sanpada'
      ? profile.assignment
      : undefined;

  const [storeFilter, setStoreFilter] = useState<string | undefined>(defaultStore);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const filters: OrderListFilters = {
    store: storeFilter,
    status: statusFilter,
  };

  const { data: orders, isLoading, error, refetch } = useOrders(filters);

  // Modals
  const [createVisible, setCreateVisible] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const handleOrderPress = useCallback((id: string) => {
    setDetailOrderId(id);
  }, []);

  type OrderRow = NonNullable<typeof orders>[number];

  const renderItem = useCallback(
    ({ item }: { item: OrderRow }) => (
      <OrderCard order={item} onPress={handleOrderPress} />
    ),
    [handleOrderPress],
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <OrderFilterBar
        selectedStore={storeFilter}
        selectedStatus={statusFilter}
        onStoreChange={setStoreFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Count */}
      <View style={styles.toolbar}>
        <Text style={styles.countText}>
          {orders ? `${orders.length} order${orders.length !== 1 ? 's' : ''}` : ''}
        </Text>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Failed to load orders.'}
          </Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : orders && orders.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={48}
            color="#CBD5E1"
          />
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>Tap + to create your first order</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setCreateVisible(true)}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
      </Pressable>

      {/* Modals */}
      <CreateOrderForm
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
      />
      <OrderDetail
        visible={detailOrderId != null}
        onClose={() => setDetailOrderId(null)}
        orderId={detailOrderId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
  },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#64748B', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  listContent: { paddingTop: 4, paddingBottom: 80 },
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
  fabPressed: { backgroundColor: '#1557B0', transform: [{ scale: 0.95 }] },
});
