import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatMm, formatFtIn } from '../utils';
import { useRemoveStock } from '../mutations';

interface ProductInfo {
  id: string;
  name: string;
  thickness_mm: number;
  color: string | null;
  is_lining: boolean;
  category_id: string;
  category: { id: string; name: string };
}

interface StockItemCardProps {
  item: {
    id: string;
    width_mm: number;
    height_mm: number;
    source: string;
    status: string;
    vertical_line_height_mm: number | null;
    created_at: string;
    product: ProductInfo;
  };
  showFtIn: boolean;
  onEdit: (id: string) => void;
}

export default function StockItemCard({ item, showFtIn, onEdit }: StockItemCardProps) {
  const removeStock = useRemoveStock();
  const { product } = item;

  const dimFormat = showFtIn ? formatFtIn : formatMm;
  const dimensions = `${dimFormat(item.width_mm)} × ${dimFormat(item.height_mm)}`;

  function handleRemove() {
    Alert.alert(
      'Remove this sheet?',
      "This can't be undone from here.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeStock.mutate(item.id);
          },
        },
      ],
    );
  }

  const sourceLabel = item.source === 'full' ? 'Full Sheet' : 'Offcut';
  const sourceColor = item.source === 'full' ? '#059669' : '#D97706';

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.categoryName}>{product.category.name}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: sourceColor + '18' }]}>
          <Text style={[styles.badgeText, { color: sourceColor }]}>{sourceLabel}</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.details}>
        <DetailRow icon="ruler" label="Size" value={dimensions} />
        <DetailRow
          icon="view-dashboard-outline"
          label="Thickness"
          value={`${product.thickness_mm} mm`}
        />
        {product.color ? (
          <DetailRow icon="palette-outline" label="Color" value={product.color} />
        ) : null}
        {item.vertical_line_height_mm != null ? (
          <DetailRow
            icon="arrow-up-down"
            label="Line Height"
            value={dimFormat(item.vertical_line_height_mm)}
          />
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={() => onEdit(item.id)}
        >
          <MaterialCommunityIcons name="pencil-outline" size={16} color="#1A73E8" />
          <Text style={styles.actionTextEdit}>Edit</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={handleRemove}
          disabled={removeStock.isPending}
        >
          <MaterialCommunityIcons name="delete-outline" size={16} color="#DC2626" />
          <Text style={styles.actionTextRemove}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons name={icon} size={15} color="#64748B" />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  categoryName: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  details: {
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    width: 72,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionBtnPressed: {
    backgroundColor: '#F1F5F9',
  },
  actionTextEdit: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
  },
  actionTextRemove: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
});
