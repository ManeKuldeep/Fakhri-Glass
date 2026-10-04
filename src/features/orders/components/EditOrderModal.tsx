import { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCategories, useProducts } from '../../inventory/queries';
import { useUpdateOrder } from '../mutations';
import { OrderDetailData } from '../queries';
import { STORES } from '../../../constants/stores';
import { PAYMENT_METHODS } from '../constants';
import DimensionInput from '../../inventory/components/DimensionInput';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItemDraft {
  key: number;
  categoryId: string | undefined;
  productId: string | undefined;
  widthMm: number | null;
  heightMm: number | null;
  qty: string;
  unitPrice: string;
  isPolished: boolean;
}

function emptyItem(key: number): OrderItemDraft {
  return {
    key,
    categoryId: undefined,
    productId: undefined,
    widthMm: null,
    heightMm: null,
    qty: '1',
    unitPrice: '',
    isPolished: false,
  };
}

interface EditOrderModalProps {
  visible: boolean;
  order: OrderDetailData | null;
  onClose: () => void;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function EditOrderModal({
  visible,
  order,
  onClose,
}: EditOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [store, setStore] = useState('mumbai');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState('');
  const [items, setItems] = useState<OrderItemDraft[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const updateOrder = useUpdateOrder();

  // Populate fields when order is opened
  useEffect(() => {
    if (order && visible) {
      setCustomerName(order.customer.name);
      setCustomerPhone(order.customer.phone ?? '');
      setCustomerAddress(order.customer.address ?? '');
      setStore(order.store);
      setPaymentMethod(order.payment_method ?? '');
      setNotes(order.notes ?? '');
      setPaid(String(order.paid ?? ''));

      const mappedItems = order.order_items.map((item, idx) => ({
        key: idx + 1,
        categoryId: item.product.category.id,
        productId: item.product_id,
        widthMm: item.width_mm,
        heightMm: item.height_mm,
        qty: String(item.qty),
        unitPrice: String(item.unit_price),
        isPolished: Boolean(item.is_polished),
      }));

      setItems(mappedItems.length > 0 ? mappedItems : [emptyItem(1)]);
      setNextKey(mappedItems.length + 1);
    }
  }, [order, visible]);

  const total = items.reduce((sum, item) => {
    const price = parseFloat(item.unitPrice) || 0;
    const qty = parseInt(item.qty, 10) || 0;
    return sum + price * qty;
  }, 0);

  const updateItem = useCallback(
    (key: number, updates: Partial<OrderItemDraft>) => {
      setItems((prev) =>
        prev.map((item) => (item.key === key ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  function addItem() {
    setItems((prev) => [...prev, emptyItem(nextKey)]);
    setNextKey((k) => k + 1);
  }

  function removeItem(key: number) {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item.key !== key);
    });
  }

  async function executeSave(validatedItems: {
    productId: string;
    widthMm: number;
    heightMm: number;
    qty: number;
    unitPrice: number;
    isPolished: boolean;
  }[]) {
    if (!order) return;

    try {
      const parsedPaid = paid.trim() ? parseFloat(paid) : 0;
      await updateOrder.mutateAsync({
        orderId: order.id,
        customerId: order.customer.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        store,
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim(),
        paid: Number.isNaN(parsedPaid) ? 0 : parsedPaid,
        items: validatedItems,
      });

      Alert.alert('Order Updated', `Order #${order.order_no} has been updated successfully.`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Update Failed', msg);
    }
  }

  function handleSave() {
    if (!order) return;

    if (!customerName.trim()) {
      Alert.alert('Error', 'Please enter customer name.');
      return;
    }

    if (!store) {
      Alert.alert('Error', 'Please select a store.');
      return;
    }

    // Validate line items
    const validatedItems: {
      productId: string;
      widthMm: number;
      heightMm: number;
      qty: number;
      unitPrice: number;
      isPolished: boolean;
    }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const idx = i + 1;

      if (!item.productId) {
        Alert.alert('Error', `Item ${idx}: Please select a product.`);
        return;
      }
      if (item.widthMm == null || item.widthMm <= 0) {
        Alert.alert('Error', `Item ${idx}: Please enter a valid width.`);
        return;
      }
      if (item.heightMm == null || item.heightMm <= 0) {
        Alert.alert('Error', `Item ${idx}: Please enter a valid height.`);
        return;
      }
      const qty = parseInt(item.qty, 10);
      if (Number.isNaN(qty) || qty < 1) {
        Alert.alert('Error', `Item ${idx}: Quantity must be at least 1.`);
        return;
      }
      let unitPrice = 0;
      if (item.unitPrice.trim()) {
        const parsed = parseFloat(item.unitPrice);
        if (Number.isNaN(parsed) || parsed < 0) {
          Alert.alert('Error', `Item ${idx}: Please enter a valid price.`);
          return;
        }
        unitPrice = parsed;
      }

      validatedItems.push({
        productId: item.productId,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        qty,
        unitPrice,
        isPolished: item.isPolished,
      });
    }

    // Warn if order had active cut plans
    if (order.status === 'cutting' || order.status === 'cut') {
      Alert.alert(
        'Revert Cut Plan & Update?',
        `Order #${order.order_no} has confirmed cut plans. Updating it will restore consumed sheets back to available stock and put the order into "New" status for recutting. Do you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Update & Revert',
            style: 'destructive',
            onPress: () => void executeSave(validatedItems),
          },
        ],
      );
      return;
    }

    void executeSave(validatedItems);
  }

  if (!order) return null;

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
          <Text style={styles.title}>Edit Order #{order.order_no}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={24} color="#64748B" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Customer Details */}
          <Text style={styles.sectionTitle}>Customer</Text>

          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Customer name"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="Phone number"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={customerAddress}
            onChangeText={setCustomerAddress}
            placeholder="Address"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={2}
          />

          {/* Store */}
          <Text style={styles.sectionTitle}>Store *</Text>
          <View style={styles.storeRow}>
            {STORES.map((s) => {
              const selected = store === s.value;
              return (
                <Pressable
                  key={s.value}
                  style={[styles.storeOption, selected && styles.storeOptionSelected]}
                  onPress={() => setStore(s.value)}
                >
                  <MaterialCommunityIcons
                    name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={18}
                    color={selected ? '#1A73E8' : '#64748B'}
                  />
                  <Text
                    style={[styles.storeOptionText, selected && styles.storeOptionTextSelected]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Line Items */}
          <View style={styles.itemsHeader}>
            <Text style={styles.sectionTitle}>Items ({items.length})</Text>
            <Pressable style={styles.addItemBtn} onPress={addItem}>
              <MaterialCommunityIcons name="plus" size={16} color="#1A73E8" />
              <Text style={styles.addItemBtnText}>Add Item</Text>
            </Pressable>
          </View>

          {items.map((item, index) => (
            <ItemEditor
              key={item.key}
              item={item}
              index={index}
              canDelete={items.length > 1}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}

          {/* Payment & Notes */}
          <Text style={styles.sectionTitle}>Payment & Notes</Text>

          <Text style={styles.fieldLabel}>Payment Method</Text>
          <View style={styles.paymentChipsRow}>
            {PAYMENT_METHODS.map((pm) => {
              const selected = paymentMethod === pm.value;
              return (
                <Pressable
                  key={pm.value}
                  style={[styles.paymentChip, selected && styles.paymentChipSelected]}
                  onPress={() => setPaymentMethod(selected ? '' : pm.value)}
                >
                  <Text
                    style={[styles.paymentChipText, selected && styles.paymentChipTextSelected]}
                  >
                    {pm.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Advance Paid (₹)</Text>
          <TextInput
            style={styles.input}
            value={paid}
            onChangeText={setPaid}
            placeholder="0"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
          />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional order notes"
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={2}
          />

          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total:</Text>
              <Text style={styles.summaryValue}>₹{total.toLocaleString('en-IN')}</Text>
            </View>
            {paid && parseFloat(paid) > 0 ? (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Paid:</Text>
                  <Text style={styles.summaryPaid}>
                    ₹{parseFloat(paid).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryBorderTop]}>
                  <Text style={styles.summaryBoldLabel}>Balance Due:</Text>
                  <Text style={styles.summaryBalance}>
                    ₹{Math.max(0, total - (parseFloat(paid) || 0)).toLocaleString('en-IN')}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Submit */}
          <Pressable
            style={[styles.saveBtn, updateOrder.isPending && styles.btnDisabled]}
            onPress={handleSave}
            disabled={updateOrder.isPending}
          >
            {updateOrder.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Sub-Component: Item Editor ──────────────────────────────────────────────

interface ItemEditorProps {
  item: OrderItemDraft;
  index: number;
  canDelete: boolean;
  onUpdate: (key: number, updates: Partial<OrderItemDraft>) => void;
  onRemove: (key: number) => void;
}

function ItemEditor({ item, index, canDelete, onUpdate, onRemove }: ItemEditorProps) {
  const { data: categories } = useCategories();
  const { data: products } = useProducts(item.categoryId);

  return (
    <View style={styles.itemBox}>
      {/* Item title + delete */}
      <View style={styles.itemBoxHeader}>
        <Text style={styles.itemBoxTitle}>Item #{index + 1}</Text>
        {canDelete ? (
          <Pressable onPress={() => onRemove(item.key)} hitSlop={8}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
          </Pressable>
        ) : null}
      </View>

      {/* Category picker */}
      <Text style={styles.fieldLabel}>Category *</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        <View style={styles.chipsRow}>
          {categories?.map((cat) => {
            const selected = item.categoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  onUpdate(item.key, {
                    categoryId: cat.id,
                    productId: undefined,
                  });
                }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Product picker */}
      {item.categoryId ? (
        <>
          <Text style={styles.fieldLabel}>Product *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            <View style={styles.chipsRow}>
              {products?.map((prod) => {
                const selected = item.productId === prod.id;
                return (
                  <Pressable
                    key={prod.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => onUpdate(item.key, { productId: prod.id })}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {prod.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </>
      ) : null}

      {/* Dimensions & Quantity */}
      {item.productId ? (
        <>
          <View style={styles.dimsRow}>
            <View style={styles.dimCol}>
              <DimensionInput
                label="Width *"
                initialMm={item.widthMm ?? undefined}
                onValueChange={(val) => onUpdate(item.key, { widthMm: val })}
              />
            </View>
            <View style={styles.dimCol}>
              <DimensionInput
                label="Height *"
                initialMm={item.heightMm ?? undefined}
                onValueChange={(val) => onUpdate(item.key, { heightMm: val })}
              />
            </View>
          </View>

          <View style={styles.priceQtyRow}>
            <View style={styles.dimCol}>
              <Text style={styles.fieldLabel}>Qty *</Text>
              <TextInput
                style={styles.input}
                value={item.qty}
                onChangeText={(val) => onUpdate(item.key, { qty: val })}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.dimCol}>
              <Text style={styles.fieldLabel}>Unit Price (₹)</Text>
              <TextInput
                style={styles.input}
                value={item.unitPrice}
                onChangeText={(val) => onUpdate(item.key, { unitPrice: val })}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          {/* Edge Finish / Polishing */}
          <View style={styles.polishSection}>
            <Text style={styles.fieldLabel}>Edge Finish</Text>
            <View style={styles.polishToggleRow}>
              <Pressable
                style={[styles.polishOption, !item.isPolished && styles.polishOptionActive]}
                onPress={() => onUpdate(item.key, { isPolished: false })}
              >
                <MaterialCommunityIcons
                  name={!item.isPolished ? 'radiobox-marked' : 'radiobox-blank'}
                  size={16}
                  color={!item.isPolished ? '#1A73E8' : '#64748B'}
                />
                <Text
                  style={[
                    styles.polishOptionText,
                    !item.isPolished && styles.polishOptionTextActive,
                  ]}
                >
                  Non-Polished
                </Text>
              </Pressable>

              <Pressable
                style={[styles.polishOption, item.isPolished && styles.polishOptionActive]}
                onPress={() => onUpdate(item.key, { isPolished: true })}
              >
                <MaterialCommunityIcons
                  name={item.isPolished ? 'radiobox-marked' : 'radiobox-blank'}
                  size={16}
                  color={item.isPolished ? '#1A73E8' : '#64748B'}
                />
                <Text
                  style={[
                    styles.polishOptionText,
                    item.isPolished && styles.polishOptionTextActive,
                  ]}
                >
                  Polished (+3mm)
                </Text>
              </Pressable>
            </View>

            {item.isPolished && item.widthMm && item.heightMm ? (
              <View style={styles.polishNoticeBox}>
                <MaterialCommunityIcons name="information-outline" size={14} color="#047857" />
                <Text style={styles.polishNoticeText}>
                  Finished: {item.widthMm} × {item.heightMm} mm → Will cut at{' '}
                  <Text style={styles.polishNoticeBold}>
                    {item.widthMm + 3} × {item.heightMm + 3} mm
                  </Text>{' '}
                  (+3mm vertically & horizontally for polishing allowance).
                </Text>
              </View>
            ) : null}
          </View>

          {/* Line total */}
          {(() => {
            const linePrice = parseFloat(item.unitPrice) || 0;
            const lineQty = parseInt(item.qty, 10) || 0;
            const lineTotal = linePrice * lineQty;
            return lineTotal > 0 ? (
              <Text style={styles.lineTotal}>Line total: ₹{lineTotal.toLocaleString('en-IN')}</Text>
            ) : null;
          })()}
        </>
      ) : null}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  multilineInput: {
    height: 70,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  storeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  storeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  storeOptionSelected: {
    borderColor: '#1A73E8',
    backgroundColor: '#EFF6FF',
  },
  storeOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  storeOptionTextSelected: {
    color: '#1A73E8',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  addItemBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
  },
  itemBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemBoxTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  chipsScroll: {
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  chipSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  chipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dimsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  dimCol: {
    flex: 1,
  },
  priceQtyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  polishSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  polishToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  polishOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  polishOptionActive: {
    borderColor: '#1A73E8',
    backgroundColor: '#EFF6FF',
  },
  polishOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  polishOptionTextActive: {
    color: '#1A73E8',
  },
  polishNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  polishNoticeText: {
    fontSize: 12,
    color: '#065F46',
    flex: 1,
    lineHeight: 16,
  },
  polishNoticeBold: {
    fontWeight: '700',
    color: '#047857',
  },
  lineTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    textAlign: 'right',
    marginTop: 4,
  },
  paymentChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  paymentChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  paymentChipSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  paymentChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  paymentChipTextSelected: {
    color: '#FFFFFF',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 6,
    paddingTop: 8,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryPaid: {
    fontSize: 15,
    fontWeight: '600',
    color: '#059669',
  },
  summaryBoldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryBalance: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 20,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
