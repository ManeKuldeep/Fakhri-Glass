import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActivityLog } from '../src/features/settings/queries';
import type { ActivityLogFilters } from '../src/features/settings/queries';
import ActivityLogItem from '../src/features/settings/components/ActivityLogItem';
import OrderGroupedLogItem from '../src/features/settings/components/OrderGroupedLogItem';
import { groupActivityLogs, DisplayActivityItem } from '../src/features/settings/utils/groupActivityLogs';

const CATEGORIES: { label: string; value: ActivityLogFilters['actionCategory'] }[] = [
  { label: 'All', value: 'all' },
  { label: 'Orders', value: 'orders' },
  { label: 'Stock', value: 'stock' },
  { label: 'Events', value: 'events' },
];

export default function ActivityLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<ActivityLogFilters['actionCategory']>('all');
  const [page, setPage] = useState(0);

  const { data, isLoading, error, refetch, isFetching } = useActivityLog({
    actionCategory: category,
    page,
    pageSize: 40,
  });

  const handleCategoryChange = (cat: ActivityLogFilters['actionCategory']) => {
    setCategory(cat);
    setPage(0);
  };

  const displayItems = useMemo(
    () => (data?.items ? groupActivityLogs(data.items) : []),
    [data?.items],
  );

  const renderItem = useCallback(
    ({ item }: { item: DisplayActivityItem }) => {
      if (item.type === 'order_group') {
        return <OrderGroupedLogItem group={item} />;
      }
      return <ActivityLogItem item={item.log} />;
    },
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Activity Log</Text>
        <View style={styles.headerRight} />
      </View>

      {/* ── Category Filter Chips ── */}
      <View style={styles.filterRow}>
        {CATEGORIES.map((cat) => {
          const isSelected = category === cat.value;
          return (
            <Pressable
              key={cat.label}
              style={[styles.filterChip, isSelected && styles.filterChipSelected]}
              onPress={() => handleCategoryChange(cat.value)}
            >
              <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Count and status toolbar ── */}
      <View style={styles.toolbar}>
        <Text style={styles.countText}>
          {data ? `${data.totalCount} total events recorded` : ''}
        </Text>
        {isFetching && !isLoading ? (
          <ActivityIndicator size="small" color="#1A73E8" />
        ) : null}
      </View>

      {/* ── Content ── */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A73E8" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Failed to load activity logs.'}
          </Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : data && data.items.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="history" size={48} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No activity records found</Text>
          <Text style={styles.emptySubtext}>Events and data modifications will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 20 },
          ]}
          refreshing={isFetching && !isLoading}
          onRefresh={() => void refetch()}
          ListFooterComponent={
            data && data.hasMore ? (
              <View style={styles.footer}>
                <Pressable
                  style={({ pressed }) => [
                    styles.loadMoreBtn,
                    pressed && styles.loadMoreBtnPressed,
                  ]}
                  onPress={() => setPage((p) => p + 1)}
                >
                  <Text style={styles.loadMoreText}>Load Older Activity</Text>
                </Pressable>
              </View>
            ) : page > 0 ? (
              <View style={styles.footer}>
                <Pressable
                  style={styles.loadMoreBtn}
                  onPress={() => setPage(0)}
                >
                  <Text style={styles.loadMoreText}>Back to Newest Activity</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnPressed: {
    opacity: 0.7,
    backgroundColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRight: {
    width: 38,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipSelected: {
    backgroundColor: '#1A73E8',
    borderColor: '#1A73E8',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  listContent: {
    paddingTop: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A73E8',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  loadMoreBtnPressed: {
    backgroundColor: '#F1F5F9',
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
  },
});
