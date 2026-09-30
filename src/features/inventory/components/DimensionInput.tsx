import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ftInToMm, mmToFtIn } from '../utils';

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
 * - In ft-in mode: two numeric inputs (feet + inches), converted to mm on change.
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

  // Pre-fill from initialMm when it changes (edit form)
  useEffect(() => {
    if (initialMm != null && initialMm > 0) {
      setMmText(String(initialMm));
      const { ft, inches, fracInches } = mmToFtIn(initialMm);
      setFtText(ft > 0 ? String(ft) : '');
      const totalIn = inches + fracInches;
      setInText(totalIn > 0 ? String(totalIn) : '');
    } else {
      setMmText('');
      setFtText('');
      setInText('');
    }
  }, [initialMm]);

  // Recalculate and notify parent
  function emitMm(newUnit: DimensionUnit, newMm: string, newFt: string, newIn: string) {
    if (newUnit === 'mm') {
      const val = Number(newMm);
      if (newMm.trim() === '' || Number.isNaN(val) || val <= 0) {
        onValueChange(null);
      } else {
        onValueChange(Math.round(val));
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
    setMmText(text);
    emitMm('mm', text, ftText, inText);
  }

  function handleFtChange(text: string) {
    setFtText(text);
    emitMm('ft-in', mmText, text, inText);
  }

  function handleInChange(text: string) {
    setInText(text);
    emitMm('ft-in', mmText, ftText, text);
  }

  function handleUnitToggle(newUnit: DimensionUnit) {
    if (newUnit === unit) return;

    // Convert current value into the new unit's fields
    if (newUnit === 'ft-in' && mmText.trim() !== '') {
      const val = Number(mmText);
      if (!Number.isNaN(val) && val > 0) {
        const { ft, inches, fracInches } = mmToFtIn(Math.round(val));
        setFtText(ft > 0 ? String(ft) : '');
        const totalIn = inches + fracInches;
        setInText(totalIn > 0 ? String(totalIn) : '');
      }
    } else if (newUnit === 'mm' && (ftText.trim() !== '' || inText.trim() !== '')) {
      const ft = Number(ftText) || 0;
      const inches = Number(inText) || 0;
      if (ft > 0 || inches > 0) {
        setMmText(String(ftInToMm(ft, inches)));
      }
    }

    setUnit(newUnit);
    // Don't re-emit — the value in mm stays the same after a unit switch
  }

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
});
