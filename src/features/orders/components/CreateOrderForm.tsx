import { useState, useCallback, useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategories, useProducts, useStockItems } from '../../inventory/queries';
import { useCustomerSearch, useCustomerByPhone } from '../queries';
import { useCreateOrder } from '../mutations';
import { STORES } from '../../../constants/stores';
import { useAuthStore } from '../../../stores/authStore';
import { friendlyDatabaseError } from '../../../lib/friendlyDatabaseError';
import DimensionInput from '../../inventory/components/DimensionInput';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderItemDraft {
  key: number; // local unique key for list rendering
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

interface CreateOrderFormProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CreateOrderForm({ visible, onClose }: CreateOrderFormProps) {
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const defaultStore =
    profile?.assignment === 'mumbai' || profile?.assignment === 'sanpada'
      ? profile.assignment
      : 'mumbai';

  // Customer fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [existingCustomerId, setExistingCustomerId] = useState<string | undefined>();

  // Customer lookup by name and phone
  const { data: matchingCustomers } = useCustomerSearch(customerName);
  const { data: phoneCustomer } = useCustomerByPhone(customerPhone.trim());

  // Order fields
  const [store, setStore] = useState(defaultStore);
  const [notes, setNotes] = useState('');

  // Items
  const [nextKey, setNextKey] = useState(1);
  const [items, setItems] = useState<OrderItemDraft[]>([emptyItem(0)]);

  const createOrder = useCreateOrder();

  // ─── Computed total ──────────────────────────────────────────────────────

  const total = items.reduce((sum, item) => {
    const price = parseFloat(item.unitPrice) || 0;
    const qty = parseInt(item.qty, 10) || 0;
    return sum + price * qty;
  }, 0);

  // ─── Reset ───────────────────────────────────────────────────────────────

  function resetForm() {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setExistingCustomerId(undefined);
    setStore(defaultStore);
    setNotes('');
    setItems([emptyItem(0)]);
    setNextKey(1);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ─── Customer selection ─────────────────────────────────────────────────

  function handleSelectCustomer(customer: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  }) {
    setExistingCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? '');
    setCustomerAddress(customer.address ?? '');
  }

  // ─── Item management ─────────────────────────────────────────────────────

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
      if (prev.length <= 1) return prev; // keep at least one
      return prev.filter((item) => item.key !== key);
    });
  }

  // ─── Submit ──────────────────────────────────────────────────────────────

  function handleSubmit() {

    if (!customerName.trim()) {
      Alert.alert('Error', 'Please enter the customer name.');
      return;
    }

    if (!store) {
      Alert.alert('Error', 'Please select a store.');
      return;
    }

    // Validate items
    const validatedItems = [];
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

    createOrder.mutate(
      {
        existingCustomerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        store,
        notes: notes.trim(),
        items: validatedItems,
      },
      {
        onSuccess: (result) => {
          Alert.alert('Order Created', `Order #${result.orderNo} created successfully.`);
          handleClose();
        },
        onError: (err) => {
          Alert.alert('Error', friendlyDatabaseError(err));
        },
      },
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        {/* Header with notch/status bar spacing */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>New Order</Text>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="close" size={20} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Customer ── */}
          <Text style={styles.sectionTitle}>Customer</Text>

          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={styles.input}
            value={customerName}
            onChangeText={(text) => {
              setCustomerName(text);
              if (existingCustomerId) {
                setExistingCustomerId(undefined);
              }
            }}
            placeholder="Customer name"
            placeholderTextColor="#94A3B8"
          />

          {/* Customer suggestions by name */}
          {matchingCustomers && matchingCustomers.length > 0 && !existingCustomerId ? (
            <View style={styles.suggestionsWrapper}>
              <Text style={styles.suggestionsHeader}>Existing customers (tap to select):</Text>
              {matchingCustomers.map((cust) => (
                <Pressable
                  key={cust.id}
                  style={styles.suggestion}
                  onPress={() => handleSelectCustomer(cust)}
                >
                  <MaterialCommunityIcons name="account-check" size={18} color="#059669" />
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionBold}>{cust.name}</Text>
                    {cust.phone ? (
                      <Text style={styles.suggestionPhone}>{cust.phone}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.suggestionAction}>Select</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {existingCustomerId ? (
            <View style={styles.suggestionActive}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#059669" />
              <Text style={styles.suggestionActiveText}>Using existing customer record</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={customerPhone}
            onChangeText={(text) => {
              setCustomerPhone(text);
              setExistingCustomerId(undefined);
            }}
            placeholder="Phone number (optional)"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
          />

          {/* Customer suggestion by phone match */}
          {phoneCustomer && !existingCustomerId ? (
            <View style={styles.suggestionsWrapper}>
              <Text style={styles.suggestionsHeader}>Existing customer with this phone number:</Text>
              <Pressable
                style={styles.suggestion}
                onPress={() => handleSelectCustomer(phoneCustomer)}
              >
                <MaterialCommunityIcons name="account-check" size={18} color="#059669" />
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionBold}>{phoneCustomer.name}</Text>
                  {phoneCustomer.address ? (
                    <Text style={styles.suggestionPhone}>{phoneCustomer.address}</Text>
                  ) : null}
                </View>
                <Text style={styles.suggestionAction}>Use Existing</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={customerAddress}
            onChangeText={setCustomerAddress}
            placeholder="Delivery address (optional)"
            placeholderTextColor="#94A3B8"
            multiline
          />

          {/* ── Store ── */}
          <Text style={styles.sectionTitle}>Store *</Text>
          <View style={styles.chipRow}>
            {STORES.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setStore(s.value)}
                style={[styles.chip, store === s.value && styles.chipSelected]}
              >
                <Text style={[styles.chipText, store === s.value && styles.chipTextSelected]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Items ── */}
          <Text style={styles.sectionTitle}>Items</Text>
          {items.map((item, index) => (
            <OrderItemEditor
              key={item.key}
              item={item}
              index={index}
              canRemove={items.length > 1}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}

          <Pressable style={styles.addItemBtn} onPress={addItem}>
            <MaterialCommunityIcons name="plus-circle-outline" size={20} color="#1A73E8" />
            <Text style={styles.addItemText}>Add Another Item</Text>
          </Pressable>

          {/* ── Notes ── */}
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
            placeholderTextColor="#94A3B8"
            multiline
          />

          {/* ── Total ── */}
          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
          </View>

          {/* ── Submit ── */}
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && styles.submitBtnPressed,
              createOrder.isPending && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={createOrder.isPending}
          >
            {createOrder.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitText}>Create Order</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Order Item Editor ───────────────────────────────────────────────────────

function OrderItemEditor({
  item,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: {
  item: OrderItemDraft;
  index: number;
  canRemove: boolean;
  onUpdate: (key: number, updates: Partial<OrderItemDraft>) => void;
  onRemove: (key: number) => void;
}) {
  const { data: categories } = useCategories();
  const { data: products } = useProducts(item.categoryId);
  const { data: stockItems } = useStockItems({ status: 'available' });

  const stockCountByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (stockItems) {
      for (const s of stockItems) {
        if (s.product_id) {
          map.set(s.product_id, (map.get(s.product_id) || 0) + 1);
        }
      }
    }
    return map;
  }, [stockItems]);

  const selectedProductStock = item.productId
    ? (stockCountByProduct.get(item.productId) ?? 0)
    : null;

  return (
    <View style={styles.itemEditor}>
      <View style={styles.itemEditorHeader}>
        <Text style={styles.itemEditorTitle}>Item {index + 1}</Text>
        {canRemove ? (
          <Pressable onPress={() => onRemove(item.key)} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={22} color="#DC2626" />
          </Pressable>
        ) : null}
      </View>

      {/* Category */}
      <Text style={styles.fieldLabel}>Category</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {categories?.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() =>
              onUpdate(item.key, { categoryId: cat.id, productId: undefined })
            }
            style={[styles.chip, item.categoryId === cat.id && styles.chipSelected]}
          >
            <Text style={[styles.chipText, item.categoryId === cat.id && styles.chipTextSelected]}>
              {cat.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Product */}
      {item.categoryId ? (
        <>
          <Text style={styles.fieldLabel}>Product</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {products?.map((prod) => {
              const stock = stockCountByProduct.get(prod.id) ?? 0;
              const isSelected = item.productId === prod.id;
              return (
                <Pressable
                  key={prod.id}
                  onPress={() => onUpdate(item.key, { productId: prod.id })}
                  style={[
                    styles.chip,
                    isSelected && styles.chipSelected,
                    stock === 0 && !isSelected && styles.chipZeroStock,
                  ]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {prod.name}
                    {prod.color ? ` (${prod.color})` : ''}
                    {` ${prod.thickness_mm}mm`}
                    <Text
                      style={[
                        styles.chipStockBadge,
                        stock === 0 ? styles.chipStockZero : styles.chipStockAvailable,
                        isSelected && styles.chipStockSelected,
                      ]}
                    >
                      {` · ${stock} stock`}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedProductStock === 0 ? (
            <View style={styles.outOfStockNotice}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.outOfStockNoticeText}>
                0 sheets in inventory for this glass type. You can create the order, and it will be flagged for restocking.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Dimensions + Qty + Price */}
      {item.productId ? (
        <>
          <DimensionInput
            label="Width"
            onValueChange={(mm) => onUpdate(item.key, { widthMm: mm })}
          />
          <DimensionInput
            label="Height"
            onValueChange={(mm) => onUpdate(item.key, { heightMm: mm })}
          />

          <View style={styles.qtyPriceRow}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Qty</Text>
              <TextInput
                style={styles.input}
                value={item.qty}
                onChangeText={(t) => onUpdate(item.key, { qty: t })}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Price (₹) (optional)</Text>
              <TextInput
                style={styles.input}
                value={item.unitPrice}
                onChangeText={(t) => onUpdate(item.key, { unitPrice: t })}
                keyboardType="numeric"
                placeholder="Optional"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          {/* Polishing / Edge Finish */}
          <View style={styles.polishSection}>
            <Text style={styles.fieldLabel}>Edge Finish</Text>
            <View style={styles.polishToggleRow}>
              <Pressable
                style={[
                  styles.polishOption,
                  !item.isPolished && styles.polishOptionActive,
                ]}
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
                style={[
                  styles.polishOption,
                  item.isPolished && styles.polishOptionActive,
                ]}
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
              <Text style={styles.lineTotal}>
                Line total: ₹{lineTotal.toLocaleString('en-IN')}
              </Text>
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
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  multilineInput: {
    height: 70,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  suggestionsWrapper: {
    marginBottom: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 8,
    gap: 6,
  },
  suggestionsHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 2,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  suggestionContent: { flex: 1 },
  suggestionBold: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  suggestionPhone: { fontSize: 12, color: '#64748B', marginTop: 1 },
  suggestionAction: { fontSize: 12, fontWeight: '600', color: '#059669' },
  suggestionActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  suggestionActiveText: { fontSize: 12, color: '#059669', fontWeight: '500' },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  chipText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  chipTextSelected: { color: '#FFFFFF' },
  // Item editor
  itemEditor: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemEditorTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  qtyPriceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: { flex: 1 },
  lineTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
    textAlign: 'right',
    marginTop: -4,
    marginBottom: 4,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 4,
  },
  addItemText: { fontSize: 14, fontWeight: '600', color: '#1A73E8' },
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: '#475569' },
  totalValue: { fontSize: 22, fontWeight: '700', color: '#0F172A' },
  submitBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnPressed: { backgroundColor: '#1557B0' },
  submitBtnDisabled: { opacity: 0.7 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  polishSection: {
    marginTop: 8,
    marginBottom: 6,
  },
  polishToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  polishOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  polishOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  polishOptionText: {
    fontSize: 12,
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
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  polishNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#065F46',
    lineHeight: 15,
  },
  polishNoticeBold: {
    fontWeight: '700',
    color: '#047857',
  },
  chipZeroStock: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  chipStockBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipStockAvailable: {
    color: '#059669',
  },
  chipStockZero: {
    color: '#DC2626',
    fontWeight: '700',
  },
  chipStockSelected: {
    color: '#E0E7FF',
  },
  outOfStockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  outOfStockNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 16,
  },
});

