import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOrderDetail } from '../queries';
import { formatMm, formatFtIn } from '../../inventory/utils';
import { useState } from 'react';

interface OrderDetailProps {
  visible: boolean;
  onClose: () => void;
  orderId: string | null;
}

export default function OrderDetail({ visible, onClose, orderId }: OrderDetailProps) {
  const { data: order, isLoading, error } = useOrderDetail(orderId ?? '');
  const [showFtIn, setShowFtIn] = useState(false);
  const dimFormat = showFtIn ? formatFtIn : formatMm;

  if (!orderId) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {order ? `Order #${order.order_no}` : 'Order Detail'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={24} color="#64748B" />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1A73E8" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : 'Failed to load order.'}
            </Text>
          </View>
        ) : order ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Status + Store */}
            <View style={styles.topRow}>
              <StatusBadge status={order.status} />
              <Text style={styles.storeText}>
                {order.store === 'mumbai' ? 'Mumbai' : 'Sanpada'}
              </Text>
            </View>

            {/* Customer info */}
            <SectionCard title="Customer">
              <InfoRow icon="account-outline" label="Name" value={order.customer.name} />
              {order.customer.phone ? (
                <InfoRow icon="phone-outline" label="Phone" value={order.customer.phone} />
              ) : null}
              {order.customer.address ? (
                <InfoRow icon="map-marker-outline" label="Address" value={order.customer.address} />
              ) : null}
            </SectionCard>

            {/* Order info */}
            <SectionCard title="Payment">
              <InfoRow icon="cash" label="Total" value={`₹${order.total.toLocaleString('en-IN')}`} />
              <InfoRow icon="cash-check" label="Paid" value={`₹${order.paid.toLocaleString('en-IN')}`} />
              {order.payment_method ? (
                <InfoRow
                  icon="credit-card-outline"
                  label="Method"
                  value={order.payment_method.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                />
              ) : null}
              {order.notes ? (
                <InfoRow icon="note-text-outline" label="Notes" value={order.notes} />
              ) : null}
            </SectionCard>

            {/* Items */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Items ({order.order_items.length})
              </Text>
              <Pressable
                style={styles.unitToggle}
                onPress={() => setShowFtIn((v) => !v)}
              >
                <MaterialCommunityIcons name="swap-horizontal" size={14} color="#1A73E8" />
                <Text style={styles.unitToggleText}>{showFtIn ? 'ft/in' : 'mm'}</Text>
              </Pressable>
            </View>

            {order.order_items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.product.name}</Text>
                  <Text style={styles.itemCategory}>
                    {item.product.category.name} · {item.product.thickness_mm}mm
                  </Text>
                </View>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemDetail}>
                    {dimFormat(item.width_mm)} × {dimFormat(item.height_mm)}
                  </Text>
                  <Text style={styles.itemDetail}>Qty: {item.qty}</Text>
                  <Text style={styles.itemDetail}>
                    ₹{item.unit_price.toLocaleString('en-IN')} × {item.qty} = ₹{item.line_total.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            ))}

            {/* Created date */}
            <Text style={styles.createdAt}>
              Created {new Date(order.created_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    new: { bg: '#DBEAFE', text: '#1D4ED8' },
    cutting: { bg: '#FEF3C7', text: '#D97706' },
    cut: { bg: '#D1FAE5', text: '#059669' },
    delivered: { bg: '#E0E7FF', text: '#4338CA' },
  };
  const c = colors[status] ?? { bg: '#F1F5F9', text: '#475569' };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={15} color="#64748B" />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  storeText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  infoLabel: { fontSize: 13, color: '#64748B', width: 64 },
  infoValue: { fontSize: 13, fontWeight: '500', color: '#0F172A', flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
  },
  unitToggleText: { fontSize: 12, fontWeight: '600', color: '#1A73E8' },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemHeader: { marginBottom: 6 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  itemCategory: { fontSize: 12, color: '#64748B', marginTop: 2 },
  itemDetails: { gap: 3 },
  itemDetail: { fontSize: 13, color: '#475569' },
  createdAt: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 16,
  },
});
