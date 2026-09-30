import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCategories, useProducts } from '../queries';

interface FilterBarProps {
  selectedCategoryId: string | undefined;
  selectedProductId: string | undefined;
  selectedSource: 'full' | 'offcut' | undefined;
  onCategoryChange: (id: string | undefined) => void;
  onProductChange: (id: string | undefined) => void;
  onSourceChange: (source: 'full' | 'offcut' | undefined) => void;
}

export default function FilterBar({
  selectedCategoryId,
  selectedProductId,
  selectedSource,
  onCategoryChange,
  onProductChange,
  onSourceChange,
}: FilterBarProps) {
  const { data: categories } = useCategories();
  const { data: products } = useProducts(selectedCategoryId);

  return (
    <View style={styles.container}>
      {/* Source filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label="All"
          selected={!selectedSource}
          onPress={() => onSourceChange(undefined)}
        />
        <Chip
          label="Full Sheets"
          selected={selectedSource === 'full'}
          onPress={() => onSourceChange(selectedSource === 'full' ? undefined : 'full')}
        />
        <Chip
          label="Offcuts"
          selected={selectedSource === 'offcut'}
          onPress={() => onSourceChange(selectedSource === 'offcut' ? undefined : 'offcut')}
        />
      </ScrollView>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label="All Categories"
          selected={!selectedCategoryId}
          onPress={() => {
            onCategoryChange(undefined);
            onProductChange(undefined);
          }}
        />
        {categories?.map((cat) => (
          <Chip
            key={cat.id}
            label={cat.name}
            selected={selectedCategoryId === cat.id}
            onPress={() => {
              onCategoryChange(selectedCategoryId === cat.id ? undefined : cat.id);
              onProductChange(undefined);
            }}
          />
        ))}
      </ScrollView>

      {/* Product filter — only when a category is selected */}
      {selectedCategoryId && products && products.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Chip
            label="All Products"
            selected={!selectedProductId}
            onPress={() => onProductChange(undefined)}
          />
          {products.map((prod) => (
            <Chip
              key={prod.id}
              label={`${prod.name} ${prod.thickness_mm}mm`}
              selected={selectedProductId === prod.id}
              onPress={() =>
                onProductChange(selectedProductId === prod.id ? undefined : prod.id)
              }
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

// ─── Chip helper ─────────────────────────────────────────────────────────────

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
