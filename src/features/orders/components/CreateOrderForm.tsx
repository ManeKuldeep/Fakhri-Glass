import { useState, useCallback } from 'react';
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
import { useCustomerSearch } from '../queries';
import { useCreateOrder } from '../mutations';
import { STORES } from '../../../constants/stores';
import { useAuthStore } from '../../../stores/authStore';
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
}

function emptyItem(key: number): OrderItemDraft {
  return { key, categoryId: undefined, productId: undefined, widthMm: null, heightMm: null, qty: '1', unitPrice: '' };
}

interface CreateOrderFormProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CreateOrderForm({ visible, onClose }: CreateOrderFormProps) {
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

  // Customer lookup by name
  const { data: matchingCustomers } = useCustomerSearch(customerName);

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
          Alert.alert('Error', err.message);
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
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>New Order</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={24} color="#64748B" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
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
            {products?.map((prod) => (
              <Pressable
                key={prod.id}
                onPress={() => onUpdate(item.key, { productId: prod.id })}
                style={[styles.chip, item.productId === prod.id && styles.chipSelected]}
              >
                <Text style={[styles.chipText, item.productId === prod.id && styles.chipTextSelected]}>
                  {prod.name}
                  {prod.color ? ` (${prod.color})` : ''}
                  {` ${prod.thickness_mm}mm`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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
});
