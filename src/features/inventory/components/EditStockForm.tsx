import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUpdateStock } from '../mutations';
import DimensionInput from './DimensionInput';

interface EditStockFormProps {
  visible: boolean;
  onClose: () => void;
  item: {
    id: string;
    width_mm: number;
    height_mm: number;
    vertical_line_height_mm: number | null;
    product: {
      name: string;
      is_lining: boolean;
      thickness_mm: number;
      category: { name: string };
    };
  } | null;
}

export default function EditStockForm({ visible, onClose, item }: EditStockFormProps) {
  const insets = useSafeAreaInsets();
  const [widthMm, setWidthMm] = useState<number | null>(null);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const [lineHeightMm, setLineHeightMm] = useState<number | null>(null);

  // Track a key to force DimensionInput re-mount when item changes
  const [formKey, setFormKey] = useState(0);

  const updateStock = useUpdateStock();
  const isLining = item?.product.is_lining ?? false;

  // Re-init when the item changes
  useEffect(() => {
    if (item) {
      setWidthMm(item.width_mm);
      setHeightMm(item.height_mm);
      setLineHeightMm(item.vertical_line_height_mm);
      setFormKey((k) => k + 1);
    }
  }, [item]);

  function handleSave() {
    if (!item) return;

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
          'Figured glass requires a vertical line height.',
        );
        return;
      }
      verticalLineHeightMm = lineHeightMm;
    }

    updateStock.mutate(
      {
        id: item.id,
        widthMm,
        heightMm,
        verticalLineHeightMm,
      },
      {
        onSuccess: () => {
          Alert.alert('Saved', 'Stock dimensions updated.');
          onClose();
        },
        onError: (err) => {
          Alert.alert('Error', err.message);
        },
      },
    );
  }

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header with notch/status bar spacing */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>Edit Stock</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="close" size={20} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Product info (read-only) */}
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{item.product.name}</Text>
            <Text style={styles.productDetail}>
              {item.product.category.name} · {item.product.thickness_mm} mm
            </Text>
          </View>

          {/* Dimensions — key forces re-mount to pick up new initialMm */}
          <DimensionInput
            key={`w-${formKey}`}
            label="Width"
            initialMm={item.width_mm}
            onValueChange={setWidthMm}
          />
          <DimensionInput
            key={`h-${formKey}`}
            label="Height"
            initialMm={item.height_mm}
            onValueChange={setHeightMm}
          />

          {/* Lining line height */}
          {isLining ? (
            <View style={styles.liningSection}>
              <View style={styles.liningWarning}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={18}
                  color="#D97706"
                />
                <Text style={styles.liningWarningText}>
                  Figured glass — vertical line height is critical for the optimiser.
                </Text>
              </View>
              <DimensionInput
                key={`lh-${formKey}`}
                label="Vertical Line Height *"
                initialMm={item.vertical_line_height_mm ?? undefined}
                onValueChange={setLineHeightMm}
              />
            </View>
          ) : null}

          {/* Save */}
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && styles.saveBtnPressed,
              updateStock.isPending && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={updateStock.isPending}
          >
            {updateStock.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveText}>Save Changes</Text>
            )}
          </Pressable>
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
  productInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  productDetail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
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
  saveBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnPressed: {
    backgroundColor: '#1557B0',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
