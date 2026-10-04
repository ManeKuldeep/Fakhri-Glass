import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface OrderCardProps {
  order: {
    id: string;
    order_no: number;
    store: string;
    status: string;
    total: number;
    paid: number;
    created_at: string;
    customer: { id: string; name: string; phone: string | null };
  };
  onPress: (id: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  new: { bg: '#DBEAFE', text: '#1D4ED8' },
  cutting: { bg: '#FEF3C7', text: '#D97706' },
  cut: { bg: '#D1FAE5', text: '#059669' },
  delivered: { bg: '#E0E7FF', text: '#4338CA' },
  cancelled: { bg: '#FEE2E2', text: '#DC2626' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function OrderCard({ order, onPress }: OrderCardProps) {
  const statusColor = STATUS_COLORS[order.status] ?? { bg: '#F1F5F9', text: '#475569' };
  const storeLabel = order.store === 'mumbai' ? 'Mumbai' : 'Sanpada';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(order.id)}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.orderNo}>#{order.order_no}</Text>
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </Text>
          </View>
        </View>
        <Text style={styles.total}>₹{order.total.toLocaleString('en-IN')}</Text>
      </View>

      {/* Customer */}
      <View style={styles.row}>
        <MaterialCommunityIcons name="account-outline" size={15} color="#64748B" />
        <Text style={styles.rowText}>{order.customer.name}</Text>
      </View>

      {/* Store + Date */}
      <View style={styles.footer}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="store-outline" size={15} color="#64748B" />
          <Text style={styles.rowText}>{storeLabel}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(order.created_at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderNo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowText: {
    fontSize: 13,
    color: '#475569',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
