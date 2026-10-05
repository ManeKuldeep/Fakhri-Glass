import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  FRACTIONS_MM_16THS,
  formatMm,
  ftInToMm,
  ftInToMmWithFrac,
  mmToFtIn,
  snapTo16th,
} from '../utils';

export type DimensionUnit = 'mm' | 'ft-in';

interface DimensionInputProps {
  label: string;
  /** Pre-fill value in mm (used for edit forms). Set to 0 or undefined for empty. */
  initialMm?: number;
  /** Called whenever the parsed mm value changes. null = invalid/empty input. */
  onValueChange: (mm: number | null) => void;
  editable?: boolean;
}

/**
 * Dimension input with a unit toggle (mm / ft-in).
 * - In mm mode: whole mm input + 1/16 mm fraction selector (0, 1/16, 1/8, ..., 15/16).
 *   Typing a decimal point automatically snaps to the nearest 1/16 fraction.
 * - In ft-in mode: numeric inputs (feet + inches) without fraction picker (mm is the smallest unit).
 * Parent receives integer mm via onValueChange for storage/cutting.
 */
export default function DimensionInput({
  label,
  initialMm,
  onValueChange,
  editable = true,
}: DimensionInputProps) {
  const [unit, setUnit] = useState<DimensionUnit>('mm');

  // mm mode state
  const [mmText, setMmText] = useState('');
  const [selectedFrac, setSelectedFrac] = useState(0);

  // ft-in mode state
  const [ftText, setFtText] = useState('');
  const [inText, setInText] = useState('');

  // Pre-fill from initialMm when it changes (edit form)
  useEffect(() => {
    if (initialMm != null && initialMm > 0) {
      const whole = Math.floor(initialMm);
      const frac = snapTo16th(initialMm - whole);
      if (frac >= 1) {
        setMmText(String(whole + 1));
        setSelectedFrac(0);
      } else {
        setMmText(String(whole));
        setSelectedFrac(frac);
      }

      const { ft, inches } = mmToFtIn(initialMm);
      setFtText(ft > 0 ? String(ft) : '');
      setInText(inches > 0 ? String(inches) : '');
    } else {
      setMmText('');
      setSelectedFrac(0);
      setFtText('');
      setInText('');
    }
  }, [initialMm]);

  // Recalculate and notify parent
  function emitMm(
    newUnit: DimensionUnit,
    newMm: string,
    newFrac: number,
    newFt: string,
    newIn: string,
  ) {
    if (newUnit === 'mm') {
      const whole = Number(newMm) || 0;
      const total = whole + newFrac;
      if (newMm.trim() === '' || total <= 0) {
        onValueChange(null);
      } else {
        // Emit rounded integer mm for database/cutting calculations
        onValueChange(Math.round(total));
      }
    } else {
      const ft = Number(newFt) || 0;
      const inches = Number(newIn) || 0;
      if (ft === 0 && inches === 0) {
        onValueChange(null);
      } else {
        onValueChange(ftInToMm(ft, inches));
      }
    }
  }

  function handleMmChange(text: string) {
    // If user enters a decimal point value in mm (e.g. "100.5" or "125.25" or "500.1"):
    // Automatically snap the point part to the nearest 1/16 mm fraction!
    if (text.includes('.')) {
      const parts = text.split('.');
      const wholeStr = parts[0].replace(/[^0-9]/g, '');
      const fracStr = parts[1] || '';

      if (fracStr.length > 0) {
        const decVal = Number('0.' + fracStr);
        if (!Number.isNaN(decVal)) {
          const snapped = snapTo16th(decVal);
          if (snapped >= 1) {
            const nextWhole = (parseInt(wholeStr, 10) || 0) + 1;
            setMmText(String(nextWhole));
            setSelectedFrac(0);
            emitMm('mm', String(nextWhole), 0, ftText, inText);
            return;
          }
          setMmText(wholeStr);
          setSelectedFrac(snapped);
          emitMm('mm', wholeStr, snapped, ftText, inText);
          return;
        }
      }
    }

    const sanitized = text.replace(/[^0-9]/g, '');
    setMmText(sanitized);
    emitMm('mm', sanitized, selectedFrac, ftText, inText);
  }

  function handleFracChange(fracValue: number) {
    setSelectedFrac(fracValue);
    emitMm('mm', mmText, fracValue, ftText, inText);
  }

  function handleFtChange(text: string) {
    const sanitized = text.replace(/[^0-9]/g, '');
    setFtText(sanitized);
    emitMm('ft-in', mmText, selectedFrac, sanitized, inText);
  }

  function handleInChange(text: string) {
    const sanitized = text.replace(/[^0-9.]/g, '');
    setInText(sanitized);
    emitMm('ft-in', mmText, selectedFrac, ftText, sanitized);
  }

  function handleUnitToggle(newUnit: DimensionUnit) {
    if (newUnit === unit) return;

    // Convert current value into the new unit's fields
    if (newUnit === 'ft-in' && (mmText.trim() !== '' || selectedFrac > 0)) {
      const totalMm = (Number(mmText) || 0) + selectedFrac;
      if (totalMm > 0) {
        const { ft, inches } = mmToFtIn(totalMm);
        setFtText(ft > 0 ? String(ft) : '');
        setInText(inches > 0 ? String(inches) : '');
      }
    } else if (newUnit === 'mm' && (ftText.trim() !== '' || inText.trim() !== '')) {
      const ft = Number(ftText) || 0;
      const inches = Number(inText) || 0;
      if (ft > 0 || inches > 0) {
        const { wholeMm, fracMm } = ftInToMmWithFrac(ft, inches);
        setMmText(wholeMm > 0 ? String(wholeMm) : '');
        setSelectedFrac(fracMm);
      }
    }

    setUnit(newUnit);
  }

  const computedMmFromFtIn =
    unit === 'ft-in'
      ? ftInToMmWithFrac(Number(ftText) || 0, Number(inText) || 0).totalMm
      : 0;

  const currentMmValue = (Number(mmText) || 0) + selectedFrac;

  return (
    <View style={styles.container}>
      {/* Label + unit toggle */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.unitToggle}>
          <Pressable
            onPress={() => handleUnitToggle('mm')}
            style={[styles.unitBtn, unit === 'mm' && styles.unitBtnActive]}
          >
            <Text style={[styles.unitBtnText, unit === 'mm' && styles.unitBtnTextActive]}>
              mm
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleUnitToggle('ft-in')}
            style={[styles.unitBtn, unit === 'ft-in' && styles.unitBtnActive]}
          >
            <Text style={[styles.unitBtnText, unit === 'ft-in' && styles.unitBtnTextActive]}>
              ft / in
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Input fields */}
      {unit === 'mm' ? (
        <View>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            value={mmText}
            onChangeText={handleMmChange}
            placeholder="e.g. 1200 (mm)"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            editable={editable}
          />

          {/* 1/16th Fraction Picker for MM */}
          <View style={styles.fractionRow}>
            <Text style={styles.fractionTitle}>Fraction (mm):</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fracScroll}
            >
              {FRACTIONS_MM_16THS.map((f) => {
                const isSelected = Math.abs(f.value - selectedFrac) < 0.001;
                return (
                  <Pressable
                    key={f.label}
                    style={[styles.fracChip, isSelected && styles.fracChipActive]}
                    onPress={() => handleFracChange(f.value)}
                    disabled={!editable}
                  >
                    <Text style={[styles.fracChipText, isSelected && styles.fracChipTextActive]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.mmFooterRow}>
            <Text style={styles.mmHelperText}>
              Point values automatically convert to 1/16 mm fractions.
            </Text>
            {currentMmValue > 0 ? (
              <Text style={styles.convertedHint}>= {formatMm(currentMmValue)}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.ftInContainer}>
          <View style={styles.ftInRow}>
            <View style={styles.ftInField}>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                value={ftText}
                onChangeText={handleFtChange}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                editable={editable}
              />
              <Text style={styles.ftInLabel}>ft</Text>
            </View>
            <View style={styles.ftInField}>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                value={inText}
                onChangeText={handleInChange}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                editable={editable}
              />
              <Text style={styles.ftInLabel}>in</Text>
            </View>
          </View>

          {computedMmFromFtIn > 0 ? (
            <Text style={styles.convertedHint}>= {formatMm(computedMmFromFtIn)}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#F8FAFC',
  },
  unitBtnActive: {
    backgroundColor: '#1A73E8',
  },
  unitBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  unitBtnTextActive: {
    color: '#FFFFFF',
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
  inputDisabled: {
    opacity: 0.5,
  },
  ftInRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ftInField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ftInLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  ftInContainer: {
    gap: 8,
  },
  fractionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  fractionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  fracScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  fracChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fracChipActive: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  fracChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  fracChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  convertedHint: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
  mmFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  mmHelperText: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 2,
    flex: 1,
  },
});
