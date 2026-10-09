import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  FRACTIONS_MM_16THS,
  formatMm,
  inToMmWithFrac,
  snapTo16th,
} from '../utils';

export type DimensionUnit = 'mm' | 'in';

interface DimensionInputProps {
  label: string;
  /** Pre-fill value in mm (used for edit forms). Set to 0 or undefined for empty. */
  initialMm?: number;
  /** Called whenever the parsed mm value changes. null = invalid/empty input. */
  onValueChange: (mm: number | null) => void;
  editable?: boolean;
}

/**
 * Dimension input with a unit toggle (mm / in).
 * - Defaults to mm as standard unit.
 * - In mm mode: whole mm input + 1/16 mm fraction selector (0, 1/16, 1/8, ..., 15/16).
 *   Typing a decimal point automatically snaps to the nearest 1/16 fraction.
 * - In in (inches) mode: single numeric input for inches (no feet, no fractions).
 *   Shows live converted preview in mm with 1/16 mm fractional breakdown.
 * - Switching from in to mm automatically breaks down inches into whole mm + 1/16 mm fraction.
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

  // in mode state (inches only)
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

      const totalInches = initialMm / 25.4;
      const roundedInches = Math.round(totalInches * 100) / 100;
      if (Math.abs(roundedInches - Math.round(roundedInches)) < 0.01) {
        setInText(String(Math.round(roundedInches)));
      } else {
        setInText(String(roundedInches));
      }
    } else {
      setMmText('');
      setSelectedFrac(0);
      setInText('');
    }
  }, [initialMm]);

  // Recalculate and notify parent
  function emitMm(
    newUnit: DimensionUnit,
    newMm: string,
    newFrac: number,
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
      const inches = Number(newIn) || 0;
      if (newIn.trim() === '' || inches <= 0) {
        onValueChange(null);
      } else {
        onValueChange(Math.round(inches * 25.4));
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
            emitMm('mm', String(nextWhole), 0, inText);
            return;
          }
          setMmText(wholeStr);
          setSelectedFrac(snapped);
          emitMm('mm', wholeStr, snapped, inText);
          return;
        }
      }
    }

    const sanitized = text.replace(/[^0-9]/g, '');
    setMmText(sanitized);
    emitMm('mm', sanitized, selectedFrac, inText);
  }

  function handleFracChange(fracValue: number) {
    setSelectedFrac(fracValue);
    emitMm('mm', mmText, fracValue, inText);
  }

  function handleInChange(text: string) {
    const sanitized = text.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
    setInText(cleaned);
    emitMm('in', mmText, selectedFrac, cleaned);
  }

  function handleUnitToggle(newUnit: DimensionUnit) {
    if (newUnit === unit) return;

    // Convert current value into the new unit's fields
    if (newUnit === 'in' && (mmText.trim() !== '' || selectedFrac > 0)) {
      const totalMm = (Number(mmText) || 0) + selectedFrac;
      if (totalMm > 0) {
        const totalInches = totalMm / 25.4;
        const roundedInches = Math.round(totalInches * 100) / 100;
        if (Math.abs(roundedInches - Math.round(roundedInches)) < 0.01) {
          setInText(String(Math.round(roundedInches)));
        } else {
          setInText(String(roundedInches));
        }
      }
    } else if (newUnit === 'mm' && inText.trim() !== '') {
      const inches = Number(inText) || 0;
      if (inches > 0) {
        const { wholeMm, fracMm } = inToMmWithFrac(inches);
        setMmText(wholeMm > 0 ? String(wholeMm) : '');
        setSelectedFrac(fracMm);
      }
    }

    setUnit(newUnit);
  }

  const computedMmFromIn =
    unit === 'in' ? inToMmWithFrac(Number(inText) || 0).totalMm : 0;

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
            onPress={() => handleUnitToggle('in')}
            style={[styles.unitBtn, unit === 'in' && styles.unitBtnActive]}
          >
            <Text style={[styles.unitBtnText, unit === 'in' && styles.unitBtnTextActive]}>
              in
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
        <View style={styles.inContainer}>
          <View style={styles.inFieldWrapper}>
            <TextInput
              style={[styles.input, styles.inInput, !editable && styles.inputDisabled]}
              value={inText}
              onChangeText={handleInChange}
              placeholder="e.g. 48"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              editable={editable}
            />
            <Text style={styles.inSuffix}>in</Text>
          </View>

          {computedMmFromIn > 0 ? (
            <View style={styles.mmFooterRow}>
              <Text style={styles.mmHelperText}>
                Converted to mm with 1/16 fraction:
              </Text>
              <Text style={styles.convertedHint}>= {formatMm(computedMmFromIn)}</Text>
            </View>
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
  inContainer: {
    gap: 4,
  },
  inFieldWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  inInput: {
    flex: 1,
    paddingRight: 40,
  },
  inSuffix: {
    position: 'absolute',
    right: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#64748B',
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
