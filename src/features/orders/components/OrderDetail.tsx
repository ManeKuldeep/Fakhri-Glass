import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrderDetail, useOrderCutPlans } from '../queries';
import { formatMm, formatInches } from '../../inventory/utils';
import { useState } from 'react';
import { printOrderLabels } from '../../labels/services';
import { useCancelOrder, useMarkOrderDelivered } from '../mutations';
import { printOrShareOrderInvoice } from '../invoiceServices';
import { OffcutThumbnail, OffcutInspectionModal } from '../../inventory/components/OffcutVisualizer';
import OrderCutVisualizerModal from './OrderCutVisualizerModal';
import EditOrderModal from './EditOrderModal';
import { friendlyDatabaseError } from '../../../lib/friendlyDatabaseError';

interface OrderDetailProps {
  visible: boolean;
  onClose: () => void;
  orderId: string | null;
}

export default function OrderDetail({ visible, onClose, orderId }: OrderDetailProps) {
  const insets = useSafeAreaInsets();
  const { data: order, isLoading, error } = useOrderDetail(orderId ?? '');
  const { data: cutPlans } = useOrderCutPlans(orderId ?? '');
  const cancelOrder = useCancelOrder();
  const markDelivered = useMarkOrderDelivered();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFtIn, setShowFtIn] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [showCutVisualizer, setShowCutVisualizer] = useState(false);
  const [inspectPiece, setInspectPiece] = useState<{
    widthMm: number;
    heightMm: number;
    title: string;
    categoryName: string;
    thicknessMm: number;
    color?: string | null;
    isLining: boolean;
    quantity: number;
  } | null>(null);
  const dimFormat = showFtIn ? formatInches : formatMm;

  function handleMarkDelivered() {
    if (!order) return;
    Alert.alert(
      `Mark Order #${order.order_no} as Delivered?`,
      `Confirm that all glass pieces have been handed over or dispatched to customer ${order.customer.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Delivered',
          style: 'default',
          onPress: async () => {
            try {
              await markDelivered.mutateAsync(order.id);
              Alert.alert('Order Delivered', `Order #${order.order_no} has been marked as delivered.`);
            } catch (err: unknown) {
              Alert.alert('Delivery Update Failed', friendlyDatabaseError(err));
            }
          },
        },
      ],
    );
  }

  async function handleInvoice(sharePdf = false) {
    if (!order) return;
    try {
      setIsGeneratingInvoice(true);
      await printOrShareOrderInvoice(order, { sharePdf });
    } catch (err: unknown) {
      Alert.alert('Invoice Generation Failed', friendlyDatabaseError(err));
    } finally {
      setIsGeneratingInvoice(false);
    }
  }

  function handleCancelOrder() {
    if (!order) return;

    const hasCutPlans = order.status === 'cutting' || order.status === 'cut';
    const message = hasCutPlans
      ? `Order #${order.order_no} has active cut plans. Cancelling will revert cut sheets back to available stock and remove generated offcuts.\n\nAre you sure you want to cancel this order?`
      : `Are you sure you want to cancel Order #${order.order_no}? It will be marked as Cancelled.`;

    Alert.alert(`Cancel Order #${order.order_no}?`, message, [
      { text: 'No, Keep Order', style: 'cancel' },
      {
        text: 'Yes, Cancel Order',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelOrder.mutateAsync(order.id);
            Alert.alert('Order Cancelled', `Order #${order.order_no} has been marked as cancelled.`);
          } catch (err: unknown) {
            Alert.alert('Cancellation Failed', friendlyDatabaseError(err));
          }
        },
      },
    ]);
  }

  async function handlePrintLabels(sharePdf = false) {
    if (!order) return;
    try {
      setIsPrinting(true);
      await printOrderLabels(order, { sharePdf });
    } catch (err: unknown) {
      Alert.alert('Label Printing Failed', friendlyDatabaseError(err));
    } finally {
      setIsPrinting(false);
    }
  }

  function handleSendWhatsApp() {
    if (!order) return;
    const rawPhone = order.customer.phone?.trim();
    if (!rawPhone) {
      Alert.alert(
        'No Phone Number',
        'This customer does not have a phone number saved to send via WhatsApp.',
      );
      return;
    }

    // Strip non-digit characters
    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    const itemsSummary = order.order_items
      .map(
        (item, idx) =>
          `${idx + 1}. *${item.product.name}* (${item.product.thickness_mm}mm)\n   Size: ${dimFormat(
            item.width_mm,
          )} × ${dimFormat(item.height_mm)} | Qty: ${item.qty}${
            item.unit_price > 0 ? ` | ₹${item.unit_price}` : ''
          }`,
      )
      .join('\n');

    const lines = [
      `*FAKHRI GLASS*`,
      `Order #${order.order_no} · ${order.store === 'mumbai' ? 'Mumbai' : 'Sanpada'}`,
      `Customer: *${order.customer.name}*`,
      order.customer.address ? `Address: ${order.customer.address}` : '',
      '',
      `*Items (${order.order_items.length}):*`,
      itemsSummary,
      '',
      order.total > 0 ? `*Total:* ₹${order.total.toLocaleString('en-IN')}` : '',
      order.notes ? `*Notes:* ${order.notes}` : '',
    ].filter(Boolean);

    const message = lines.join('\n');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open WhatsApp on this device.');
    });
  }

  if (!orderId) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        {/* Header with notch/status bar spacing */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>
            {order ? `Order #${order.order_no}` : 'Order Detail'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="close" size={20} color="#0F172A" />
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
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 24 },
            ]}
          >
            {/* Status + Store + Actions */}
            <View style={styles.topRow}>
              <View style={styles.statusStoreBox}>
                <StatusBadge status={order.status} />
                <Text style={styles.storeText}>
                  {order.store === 'mumbai' ? 'Mumbai' : 'Sanpada'}
                </Text>
              </View>

              <View style={styles.orderActionsRow}>
                <Pressable
                  style={styles.editOrderBtn}
                  onPress={() => setShowEditModal(true)}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={15} color="#1A73E8" />
                  <Text style={styles.editOrderBtnText}>Edit</Text>
                </Pressable>

                {order.status !== 'cancelled' ? (
                  <Pressable
                    style={styles.cancelOrderBtn}
                    onPress={handleCancelOrder}
                    disabled={cancelOrder.isPending}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={15} color="#DC2626" />
                    <Text style={styles.cancelOrderBtnText}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Cancelled Banner */}
            {order.status === 'cancelled' ? (
              <View style={styles.cancelledBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.cancelledBannerText}>
                  This order was cancelled. Tap "Edit" to modify items or reopen into New status.
                </Text>
              </View>
            ) : null}

            {/* Ready for Delivery Action Card (when status is 'cut') */}
            {order.status === 'cut' ? (
              <View style={styles.readyForDeliveryCard}>
                <View style={styles.readyForDeliveryText}>
                  <MaterialCommunityIcons name="truck-fast-outline" size={26} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.readyForDeliveryTitle}>Glass Cutting Completed</Text>
                    <Text style={styles.readyForDeliverySubtitle}>
                      All pieces have been cut and labeled. Ready for handover or customer dispatch.
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.markDeliveredBtn,
                    pressed && styles.markDeliveredBtnPressed,
                    markDelivered.isPending && styles.btnDisabled,
                  ]}
                  onPress={handleMarkDelivered}
                  disabled={markDelivered.isPending}
                >
                  {markDelivered.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.markDeliveredBtnText}>Mark as Delivered</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}

            {/* Delivered Confirmation Banner */}
            {order.status === 'delivered' ? (
              <View style={styles.deliveredBanner}>
                <MaterialCommunityIcons name="check-decagram" size={24} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveredBannerTitle}>Order Delivered</Text>
                  <Text style={styles.deliveredBannerSubtitle}>
                    All items have been delivered/handed over to the customer.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Customer info */}
            <SectionCard title="Customer">
              <InfoRow icon="account-outline" label="Name" value={order.customer.name} />
              {order.customer.phone ? (
                <InfoRow icon="phone-outline" label="Phone" value={order.customer.phone} />
              ) : null}
              {order.customer.address ? (
                <InfoRow icon="map-marker-outline" label="Address" value={order.customer.address} />
              ) : null}

              {order.status !== 'cancelled' ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.whatsappBtn,
                    pressed && styles.whatsappBtnPressed,
                  ]}
                  onPress={handleSendWhatsApp}
                >
                  <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
                  <Text style={styles.whatsappBtnText}>Send to WhatsApp</Text>
                </Pressable>
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
                <Text style={styles.unitToggleText}>{showFtIn ? 'in' : 'mm'}</Text>
              </Pressable>
            </View>

            {order.order_items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemCardRow}>
                  <OffcutThumbnail
                    widthMm={item.width_mm}
                    heightMm={item.height_mm}
                    source="full"
                    isLining={item.product.is_lining ?? false}
                    maxWidth={56}
                    maxHeight={42}
                    onPress={() =>
                      setInspectPiece({
                        widthMm: item.width_mm,
                        heightMm: item.height_mm,
                        title: item.is_polished ? `${item.product.name} (Polished)` : item.product.name,
                        categoryName: item.product.category.name,
                        thicknessMm: item.product.thickness_mm,
                        color: item.product.color,
                        isLining: item.product.is_lining ?? false,
                        quantity: item.qty,
                      })
                    }
                  />
                  <View style={styles.itemMainInfo}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemNameRow}>
                        <Text style={styles.itemName}>{item.product.name}</Text>
                        {item.is_polished ? (
                          <View style={styles.polishedBadge}>
                            <Text style={styles.polishedBadgeText}>Polished</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.itemCategory}>
                        {item.product.category.name} · {item.product.thickness_mm}mm
                      </Text>
                    </View>
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemDetail}>
                        {dimFormat(item.width_mm)} × {dimFormat(item.height_mm)}
                        {item.is_polished ? (
                          <Text style={styles.cutSizeDetail}>
                            {' '}(Cut: {dimFormat(item.width_mm + 3)} × {dimFormat(item.height_mm + 3)})
                          </Text>
                        ) : null}
                      </Text>
                      <Text style={styles.itemDetail}>Qty: {item.qty}</Text>
                      <Text style={styles.itemDetail}>
                        ₹{item.unit_price.toLocaleString('en-IN')} × {item.qty} = ₹{item.line_total.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}

            {/* Cut Layout Section (when order has confirmed cut plans) */}
            {cutPlans && cutPlans.length > 0 && (
              <View style={styles.cutPlanSectionCard}>
                <View style={styles.cutPlanHeader}>
                  <View style={styles.cutPlanIconBox}>
                    <MaterialCommunityIcons name="content-cut" size={20} color="#059669" />
                  </View>
                  <View style={styles.cutPlanHeaderText}>
                    <Text style={styles.cutPlanTitle}>Main Sheet Cut Layout</Text>
                    <Text style={styles.cutPlanSubtitle}>
                      {cutPlans.reduce((sum, p) => sum + p.cut_pieces.length, 0)} piece(s) cut across {cutPlans.length} plan(s)
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.viewCutLayoutBtn,
                    pressed && styles.viewCutLayoutBtnPressed,
                  ]}
                  onPress={() => setShowCutVisualizer(true)}
                >
                  <MaterialCommunityIcons name="eye-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.viewCutLayoutBtnText}>Visualize Sheet Cuts</Text>
                </Pressable>
              </View>
            )}

            {/* Piece Labels Section */}
            {order.status !== 'cancelled' ? (
              <View style={styles.labelsCard}>
                <View style={styles.labelsCardHeader}>
                  <MaterialCommunityIcons name="label-outline" size={20} color="#1A73E8" />
                  <Text style={styles.labelsCardTitle}>Piece Labels</Text>
                </View>
                <Text style={styles.labelsCardSubtitle}>
                  Generate 100×50 mm thermal labels (one label per physical piece).
                </Text>

                <View style={styles.labelButtonsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.printLabelsBtn,
                      pressed && styles.printLabelsBtnPressed,
                      isPrinting && styles.btnDisabled,
                    ]}
                    onPress={() => handlePrintLabels(false)}
                    disabled={isPrinting}
                  >
                    {isPrinting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" />
                        <Text style={styles.printLabelsBtnText}>Print Labels</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.shareLabelsBtn,
                      pressed && styles.shareLabelsBtnPressed,
                      isPrinting && styles.btnDisabled,
                    ]}
                    onPress={() => handlePrintLabels(true)}
                    disabled={isPrinting}
                  >
                    <MaterialCommunityIcons name="share-variant-outline" size={18} color="#1A73E8" />
                    <Text style={styles.shareLabelsBtnText}>Share PDF</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Tax / Retail Invoice Card */}
            {order.status !== 'cancelled' ? (
              <View style={styles.invoiceCard}>
                <View style={styles.invoiceCardHeader}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color="#1A73E8" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invoiceCardTitle}>Tax / Retail Invoice</Text>
                    <Text style={styles.invoiceCardSubtitle}>
                      Generate and print or share a professional A4 PDF invoice.
                    </Text>
                  </View>
                </View>

                <View style={styles.labelButtonsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.printLabelsBtn,
                      pressed && styles.printLabelsBtnPressed,
                      isGeneratingInvoice && styles.btnDisabled,
                    ]}
                    onPress={() => handleInvoice(false)}
                    disabled={isGeneratingInvoice}
                  >
                    {isGeneratingInvoice ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" />
                        <Text style={styles.printLabelsBtnText}>Print Invoice</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.shareLabelsBtn,
                      pressed && styles.shareLabelsBtnPressed,
                      isGeneratingInvoice && styles.btnDisabled,
                    ]}
                    onPress={() => handleInvoice(true)}
                    disabled={isGeneratingInvoice}
                  >
                    <MaterialCommunityIcons name="share-variant-outline" size={18} color="#1A73E8" />
                    <Text style={styles.shareLabelsBtnText}>Share PDF</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

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

        {inspectPiece && (
          <OffcutInspectionModal
            visible={!!inspectPiece}
            onClose={() => setInspectPiece(null)}
            title={inspectPiece.title}
            categoryName={inspectPiece.categoryName}
            thicknessMm={inspectPiece.thicknessMm}
            color={inspectPiece.color}
            widthMm={inspectPiece.widthMm}
            heightMm={inspectPiece.heightMm}
            source="full"
            isLining={inspectPiece.isLining}
            quantity={inspectPiece.quantity}
            showFtIn={showFtIn}
          />
        )}

        {order && cutPlans && cutPlans.length > 0 && (
          <OrderCutVisualizerModal
            visible={showCutVisualizer}
            onClose={() => setShowCutVisualizer(false)}
            orderNo={order.order_no}
            customerName={order.customer.name}
            plans={cutPlans}
            showFtIn={showFtIn}
          />
        )}

        {order && (
          <EditOrderModal
            visible={showEditModal}
            order={order}
            onClose={() => setShowEditModal(false)}
          />
        )}
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
    cancelled: { bg: '#FEE2E2', text: '#DC2626' },
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
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
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
  statusStoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editOrderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A73E8',
  },
  cancelOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelOrderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  cancelledBannerText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
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
  itemCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemMainInfo: {
    flex: 1,
  },
  itemHeader: { marginBottom: 6 },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  polishedBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  polishedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  itemCategory: { fontSize: 12, color: '#64748B', marginTop: 2 },
  itemDetails: { gap: 3 },
  itemDetail: { fontSize: 13, color: '#475569' },
  cutSizeDetail: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  createdAt: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 16,
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    marginTop: 10,
  },
  whatsappBtnPressed: {
    backgroundColor: '#1EBE5D',
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  labelsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  labelsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  labelsCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  labelsCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  labelButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  printLabelsBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A73E8',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  printLabelsBtnPressed: {
    backgroundColor: '#1557B0',
  },
  printLabelsBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  shareLabelsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  shareLabelsBtnPressed: {
    backgroundColor: '#DBEAFE',
  },
  shareLabelsBtnText: {
    color: '#1A73E8',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  cutPlanSectionCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  cutPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  cutPlanIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutPlanHeaderText: {
    flex: 1,
  },
  cutPlanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  cutPlanSubtitle: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
  },
  viewCutLayoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 10,
  },
  viewCutLayoutBtnPressed: {
    backgroundColor: '#047857',
  },
  viewCutLayoutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  readyForDeliveryCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#34D399',
    gap: 12,
  },
  readyForDeliveryText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  readyForDeliveryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
  },
  readyForDeliverySubtitle: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  markDeliveredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 12,
  },
  markDeliveredBtnPressed: {
    backgroundColor: '#047857',
  },
  markDeliveredBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  deliveredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  deliveredBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  deliveredBannerSubtitle: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
  },
  invoiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  invoiceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  invoiceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  invoiceCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});


