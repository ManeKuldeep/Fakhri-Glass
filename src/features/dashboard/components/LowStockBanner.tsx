import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLowStock } from '../queries';
import { useStockItems } from '../../inventory/queries';

export default function LowStockBanner() {
  const router = useRouter();
  const { data: lowStockItems, isLoading: isLowStockLoading, error } = useLowStock();
  const { data: stockItems, isLoading: isStockLoading } = useStockItems({ status: 'available' });

  if (isLowStockLoading || isStockLoading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator size="small" color="#D97706" />
        <Text style={styles.loadingText}>Checking stock levels...</Text>
      </View>
    );
  }

  if (error) {
    return null; // Don't block dashboard on low stock fetch error
  }

  const totalAvailable = stockItems?.length ?? 0;
  const hasLowStock = lowStockItems && lowStockItems.length > 0;

  // 1. If there is NO stock at all in the entire inventory
  if (totalAvailable === 0) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <View style={styles.emptyIconBox}>
          <MaterialCommunityIcons name="package-variant-closed" size={24} color="#64748B" />
        </View>
        <View style={styles.emptyContent}>
          <Text style={styles.emptyTitle}>Inventory is Empty</Text>
          <Text style={styles.emptySubtext}>
            0 sheets in stock. Add stock to begin cutting orders.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.viewBtnPressed]}
          onPress={() => router.push('/(tabs)/inventory')}
        >
          <Text style={styles.emptyAddBtnText}>+ Add</Text>
        </Pressable>
      </View>
    );
  }

  // 2. If stock exists and no products are below their minimums
  if (!hasLowStock) {
    return (
      <View style={[styles.card, styles.healthyCard]}>
        <View style={styles.healthyIconBox}>
          <MaterialCommunityIcons name="check-circle" size={24} color="#059669" />
        </View>
        <View style={styles.healthyContent}>
          <Text style={styles.healthyTitle}>Stock Levels Healthy</Text>
          <Text style={styles.healthySubtext}>
            {totalAvailable} {totalAvailable === 1 ? 'sheet' : 'sheets'} available across inventory
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.alertCard]}>
      {/* Header */}
      <View style={styles.alertHeader}>
        <View style={styles.alertHeaderLeft}>
          <MaterialCommunityIcons name="alert-circle" size={22} color="#D97706" />
          <Text style={styles.alertTitle}>
            {lowStockItems.length} {lowStockItems.length === 1 ? 'Product' : 'Products'} Low on Stock
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.viewBtn, pressed && styles.viewBtnPressed]}
          onPress={() => router.push('/(tabs)/inventory')}
        >
          <Text style={styles.viewBtnText}>View Stock</Text>
        </Pressable>
      </View>

      {/* Product list */}
      <View style={styles.itemsList}>
        {lowStockItems.map((item) => {
          const current = item.sheets ?? 0;
          const min = item.min_stock_sheets ?? 0;
          const shortage = Math.max(0, min - current);

          return (
            <View key={item.product_id ?? item.name} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSubtext}>
                  {current} available · Min required: {min}
                </Text>
              </View>

              <View style={styles.badgeBox}>
                <Text style={styles.shortageText}>
                  -{shortage} {shortage === 1 ? 'sheet' : 'sheets'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  loadingCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContent: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  emptyAddBtn: {
    backgroundColor: '#1A73E8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  healthyCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthyContent: {
    flex: 1,
  },
  healthyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  healthySubtext: {
    fontSize: 12,
    color: '#15803D',
    lineHeight: 16,
  },
  alertCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  alertHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
  },
  viewBtn: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewBtnPressed: {
    opacity: 0.7,
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
  },
  itemsList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  itemInfo: {
    flex: 1,
    paddingRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  itemSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  badgeBox: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  shortageText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
});
