import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { STORES } from '../../../constants/stores';
import { ORDER_STATUSES } from '../constants';

interface OrderFilterBarProps {
  selectedStore: string | undefined;
  selectedStatus: string | undefined;
  onStoreChange: (store: string | undefined) => void;
  onStatusChange: (status: string | undefined) => void;
}

export default function OrderFilterBar({
  selectedStore,
  selectedStatus,
  onStoreChange,
  onStatusChange,
}: OrderFilterBarProps) {
  return (
    <View style={styles.container}>
      {/* Store filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label="All Stores"
          selected={!selectedStore}
          onPress={() => onStoreChange(undefined)}
        />
        {STORES.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            selected={selectedStore === s.value}
            onPress={() =>
              onStoreChange(selectedStore === s.value ? undefined : s.value)
            }
          />
        ))}
      </ScrollView>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label="All"
          selected={!selectedStatus}
          onPress={() => onStatusChange(undefined)}
        />
        {ORDER_STATUSES.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            selected={selectedStatus === s.value}
            onPress={() =>
              onStatusChange(selectedStatus === s.value ? undefined : s.value)
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
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
});
