import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
  const [searchQuery, setSearchQuery] = useState('');

  const filters: OrderListFilters = {
    store: storeFilter,
    status: statusFilter,
  };

  const { data: orders, isLoading, error, refetch } = useOrders(filters);

  const filteredOrders = orders?.filter((order) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    const customerMatch = order.customer.name.toLowerCase().includes(query);
    const orderNoMatch = String(order.order_no).includes(query);
    const phoneMatch = order.customer.phone ? order.customer.phone.includes(query) : false;
    return customerMatch || orderNoMatch || phoneMatch;
  });

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
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search customer name or order #..."
          placeholderTextColor="#94A3B8"
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

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
          {filteredOrders
            ? `${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''}${
                searchQuery ? ` matching "${searchQuery}"` : ''
              }`
            : ''}
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
          data={filteredOrders}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
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
