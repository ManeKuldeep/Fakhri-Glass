import { useState } from 'react';
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
import { useCategories, useProducts } from '../queries';
import { useAddStock } from '../mutations';
import DimensionInput from './DimensionInput';

interface AddStockFormProps {
  visible: boolean;
  onClose: () => void;
}

export default function AddStockForm({ visible, onClose }: AddStockFormProps) {
  const insets = useSafeAreaInsets();
  const { data: categories } = useCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const { data: products } = useProducts(selectedCategoryId);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();

  const [widthMm, setWidthMm] = useState<number | null>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const [lineHeightMm, setLineHeightMm] = useState<number | null>(null);
  const [quantityText, setQuantityText] = useState('1');

  const addStock = useAddStock();

  const selectedProduct = products?.find((p) => p.id === selectedProductId);
  const isLining = selectedProduct?.is_lining ?? false;

  function resetForm() {
    setSelectedCategoryId(undefined);
    setSelectedProductId(undefined);
    setWidthMm(null);
    setHeightMm(null);
    setLineHeightMm(null);
    setQuantityText('1');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit() {
    if (!selectedProductId) {
      Alert.alert('Error', 'Please select a product.');
      return;
    }

    if (widthMm == null || widthMm <= 0) {
      Alert.alert('Error', 'Please enter a valid width.');
      return;
    }

    if (heightMm == null || heightMm <= 0) {
      Alert.alert('Error', 'Please enter a valid height.');
      return;
    }

    let verticalLineHeightMm: number | null = null;
    if (isLining) {
      if (lineHeightMm == null || lineHeightMm <= 0) {
        Alert.alert(
          'Error',
          'Figured glass requires a vertical line height. Please enter it.',
        );
        return;
      }
      verticalLineHeightMm = lineHeightMm;
    }

    const qty = parseInt(quantityText, 10);
    if (Number.isNaN(qty) || qty < 1) {
      Alert.alert('Error', 'Quantity must be at least 1.');
      return;
    }
    if (qty > 50) {
      Alert.alert(
        'Error',
        'Maximum 50 sheets per batch. Add more in a separate batch.',
      );
      return;
    }

    addStock.mutate(
      {
        productId: selectedProductId,
        widthMm,
        heightMm,
        quantity: qty,
        verticalLineHeightMm,
      },
      {
        onSuccess: () => {
          Alert.alert(
            'Stock Added',
            `${qty} sheet${qty > 1 ? 's' : ''} added successfully.`,
          );
          handleClose();
        },
        onError: (err) => {
          Alert.alert('Error', err.message);
        },
      },
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        {/* Header with notch/status bar spacing */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>Add Stock</Text>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="close" size={20} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category picker */}
          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {categories?.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setSelectedCategoryId(cat.id);
                  setSelectedProductId(undefined);
                }}
                style={[
                  styles.chip,
                  selectedCategoryId === cat.id && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCategoryId === cat.id && styles.chipTextSelected,
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Product picker */}
          {selectedCategoryId ? (
            <>
              <Text style={styles.label}>Product</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {products?.map((prod) => (
                  <Pressable
                    key={prod.id}
                    onPress={() => setSelectedProductId(prod.id)}
                    style={[
                      styles.chip,
                      selectedProductId === prod.id && styles.chipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedProductId === prod.id && styles.chipTextSelected,
                      ]}
                    >
                      {prod.name}
                      {prod.color ? ` (${prod.color})` : ''}
                      {` ${prod.thickness_mm}mm`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Dimensions */}
          {selectedProductId ? (
            <>
              <DimensionInput
                label="Width"
                onValueChange={setWidthMm}
              />
              <DimensionInput
                label="Height"
                onValueChange={setHeightMm}
              />

              {/* Lining: vertical line height */}
              {isLining ? (
                <View style={styles.liningSection}>
                  <View style={styles.liningWarning}>
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={18}
                      color="#D97706"
                    />
                    <Text style={styles.liningWarningText}>
                      Figured glass — lines must run vertically. Enter the line height so the
                      optimiser aligns cuts correctly. This is critical.
                    </Text>
                  </View>
                  <DimensionInput
                    label="Vertical Line Height *"
                    onValueChange={setLineHeightMm}
                  />
                </View>
              ) : null}

              {/* Quantity */}
              <Text style={styles.label}>Quantity (sheets)</Text>
              <TextInput
                style={styles.input}
                value={quantityText}
                onChangeText={setQuantityText}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor="#94A3B8"
              />

              {/* Submit */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && styles.submitBtnPressed,
                  addStock.isPending && styles.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={addStock.isPending}
              >
                {addStock.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitText}>Add Stock</Text>
                )}
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
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
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  liningSection: {
    marginBottom: 4,
  },
  liningWarning: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    gap: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  liningWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
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
    marginBottom: 14,
  },
  submitBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnPressed: {
    backgroundColor: '#1557B0',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
