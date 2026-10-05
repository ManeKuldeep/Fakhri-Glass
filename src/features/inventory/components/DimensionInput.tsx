import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FRACTIONS_16THS, ftInToMm, mmToFtIn } from '../utils';

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
 * - In mm mode: single numeric input, value stored directly.
 * - In ft-in mode: numeric inputs (feet + inches) + 1/16" fraction picker, converted to mm on change.
 * Parent always receives integer mm via onValueChange.
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

  // ft-in mode state
  const [ftText, setFtText] = useState('');
  const [inText, setInText] = useState('');
  const [selectedFrac, setSelectedFrac] = useState(0);

  // Pre-fill from initialMm when it changes (edit form)
  useEffect(() => {
    if (initialMm != null && initialMm > 0) {
      setMmText(String(initialMm));
      const { ft, inches, fracInches } = mmToFtIn(initialMm);
      setFtText(ft > 0 ? String(ft) : '');
      setInText(inches > 0 ? String(inches) : '');
      setSelectedFrac(fracInches);
    } else {
      setMmText('');
      setFtText('');
      setInText('');
      setSelectedFrac(0);
    }
  }, [initialMm]);

  // Recalculate and notify parent
  function emitMm(
    newUnit: DimensionUnit,
    newMm: string,
    newFt: string,
    newIn: string,
    newFrac: number,
  ) {
    if (newUnit === 'mm') {
      const val = Number(newMm);
      if (newMm.trim() === '' || Number.isNaN(val) || val <= 0) {
        onValueChange(null);
      } else {
        onValueChange(Math.round(val));
      }
    } else {
      const ft = Number(newFt) || 0;
      const inches = (Number(newIn) || 0) + newFrac;
      if (ft === 0 && inches === 0) {
        onValueChange(null);
      } else {
        onValueChange(ftInToMm(ft, inches));
      }
    }
  }

  function handleMmChange(text: string) {
    setMmText(text);
    emitMm('mm', text, ftText, inText, selectedFrac);
  }

  function handleFtChange(text: string) {
    setFtText(text);
    emitMm('ft-in', mmText, text, inText, selectedFrac);
  }

  function handleInChange(text: string) {
    setInText(text);
    emitMm('ft-in', mmText, ftText, text, selectedFrac);
  }

  function handleFracChange(fracValue: number) {
    setSelectedFrac(fracValue);
    emitMm('ft-in', mmText, ftText, inText, fracValue);
  }

  function handleUnitToggle(newUnit: DimensionUnit) {
    if (newUnit === unit) return;

    // Convert current value into the new unit's fields
    if (newUnit === 'ft-in' && mmText.trim() !== '') {
      const val = Number(mmText);
      if (!Number.isNaN(val) && val > 0) {
        const { ft, inches, fracInches } = mmToFtIn(Math.round(val));
        setFtText(ft > 0 ? String(ft) : '');
        setInText(inches > 0 ? String(inches) : '');
        setSelectedFrac(fracInches);
      }
    } else if (newUnit === 'mm' && (ftText.trim() !== '' || inText.trim() !== '' || selectedFrac > 0)) {
      const ft = Number(ftText) || 0;
      const inches = (Number(inText) || 0) + selectedFrac;
      if (ft > 0 || inches > 0) {
        setMmText(String(ftInToMm(ft, inches)));
      }
    }

    setUnit(newUnit);
  }

  const computedMm =
    unit === 'ft-in'
      ? ftInToMm(Number(ftText) || 0, (Number(inText) || 0) + selectedFrac)
      : Number(mmText) || 0;

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
              ft / in (1/16")
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Input fields */}
      {unit === 'mm' ? (
        <TextInput
          style={[styles.input, !editable && styles.inputDisabled]}
          value={mmText}
          onChangeText={handleMmChange}
          placeholder="e.g. 1200"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          editable={editable}
        />
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

          {/* 1/16th Fraction Picker */}
          <View style={styles.fractionRow}>
            <Text style={styles.fractionTitle}>Fraction:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fracScroll}
            >
              {FRACTIONS_16THS.map((f) => {
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

          {computedMm > 0 ? (
            <Text style={styles.convertedHint}>= {computedMm} mm</Text>
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
});
