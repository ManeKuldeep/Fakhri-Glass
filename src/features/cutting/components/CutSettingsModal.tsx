import { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DimensionInput from '../../inventory/components/DimensionInput';
import { useCuttingSettingsStore } from '../stores/cuttingSettingsStore';
import { DEFAULT_OPTIMIZER_SETTINGS } from '../../../optimizer/types';

interface CutSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onApply?: () => void;
}

export default function CutSettingsModal({
  visible,
  onClose,
  onApply,
}: CutSettingsModalProps) {
  const { settings, updateSettings, resetSettings } = useCuttingSettingsStore();

  const [kerfMm, setKerfMm] = useState<number | null>(settings.kerf_mm);
  const [minOffcutMm, setMinOffcutMm] = useState<number | null>(settings.min_offcut_mm);
  const [maxWastageText, setMaxWastageText] = useState<string>(
    String(settings.max_wastage_pct),
  );

  useEffect(() => {
    if (visible) {
      setKerfMm(settings.kerf_mm);
      setMinOffcutMm(settings.min_offcut_mm);
      setMaxWastageText(String(settings.max_wastage_pct));
    }
  }, [visible, settings]);

  function handleSave() {
    const k = kerfMm ?? DEFAULT_OPTIMIZER_SETTINGS.kerf_mm;
    const mo = minOffcutMm ?? DEFAULT_OPTIMIZER_SETTINGS.min_offcut_mm;
    const mw = Number(maxWastageText) || DEFAULT_OPTIMIZER_SETTINGS.max_wastage_pct;

    updateSettings({
      kerf_mm: Math.max(0, k),
      min_offcut_mm: Math.max(50, mo),
      max_wastage_pct: Math.min(100, Math.max(1, mw)),
    });

    onClose();
    if (onApply) onApply();
  }

  function handleReset() {
    resetSettings();
    setKerfMm(DEFAULT_OPTIMIZER_SETTINGS.kerf_mm);
    setMinOffcutMm(DEFAULT_OPTIMIZER_SETTINGS.min_offcut_mm);
    setMaxWastageText(String(DEFAULT_OPTIMIZER_SETTINGS.max_wastage_pct));
    if (onApply) onApply();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Optimizer Settings</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialCommunityIcons name="close" size={24} color="#64748B" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionSubtitle}>
            Configure blade allowances and offcut thresholds. Changes re-run the layout optimizer.
          </Text>

          {/* Kerf mm input */}
          <View style={styles.card}>
            <DimensionInput
              label="Blade Kerf (Cut Loss)"
              initialMm={kerfMm ?? 0}
              onValueChange={setKerfMm}
            />
            <Text style={styles.helperText}>
              Material lost per score/cut line. Default is 0 mm for standard glass wheel scoring.
            </Text>
          </View>

          {/* Min offcut mm input */}
          <View style={styles.card}>
            <DimensionInput
              label="Minimum Usable Offcut Size"
              initialMm={minOffcutMm ?? 500}
              onValueChange={setMinOffcutMm}
            />
            <Text style={styles.helperText}>
              Leftovers smaller than this in both dimensions are marked as discarded waste rather than saved offcuts. Default is 500 mm.
            </Text>
          </View>

          {/* Max wastage % input */}
          <View style={styles.card}>
            <Text style={styles.label}>Max Allowed Wastage (%)</Text>
            <TextInput
              style={styles.input}
              value={maxWastageText}
              onChangeText={setMaxWastageText}
              keyboardType="numeric"
              placeholder="e.g. 20"
              placeholderTextColor="#94A3B8"
            />
            <Text style={styles.helperText}>
              A visual warning will appear if the total sheet wastage exceeds this percentage.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.resetBtn} onPress={handleReset}>
              <Text style={styles.resetBtnText}>Reset Defaults</Text>
            </Pressable>

            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save & Apply</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
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
  },
  helperText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  resetBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
