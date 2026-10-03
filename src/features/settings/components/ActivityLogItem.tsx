import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ActivityLogRow } from '../queries';
import { formatLogTime } from '../utils/formatLogTime';
import { formatActivityLog } from '../utils/formatActivityLog';

interface ActivityLogItemProps {
  item: ActivityLogRow;
}

export default function ActivityLogItem({ item }: ActivityLogItemProps) {
  const formatted = formatActivityLog(item);
  const assignment = item.user_assignment
    ? item.user_assignment.charAt(0).toUpperCase() + item.user_assignment.slice(1)
    : 'Shop';

  return (
    <View style={styles.card}>
      {/* Top row: user info and timestamp */}
      <View style={styles.topRow}>
        <View style={styles.userRow}>
          <MaterialCommunityIcons name="account-circle-outline" size={15} color="#64748B" />
          <Text style={styles.userName} numberOfLines={1}>
            {item.user_name} <Text style={styles.assignmentText}>· {assignment}</Text>
          </Text>
        </View>
        <Text style={styles.timestamp}>{formatLogTime(item.created_at)}</Text>
      </View>

      {/* Badges row: Action badge and Category badge */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.actionBadge,
            {
              backgroundColor: formatted.badge.bg,
              borderColor: formatted.badge.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={formatted.badge.icon}
            size={12}
            color={formatted.badge.color}
          />
          <Text style={[styles.actionBadgeText, { color: formatted.badge.color }]}>
            {formatted.badge.label}
          </Text>
        </View>

        <View style={styles.entityBadge}>
          <Text style={styles.entityBadgeText}>{formatted.entity}</Text>
        </View>
      </View>

      {/* Main vendor-friendly title */}
      <Text style={styles.titleText}>{formatted.title}</Text>

      {/* Detailed information row (if present) */}
      {formatted.details ? (
        <Text style={styles.detailsText}>{formatted.details}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    paddingRight: 8,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  assignmentText: {
    fontWeight: '500',
    color: '#64748B',
  },
  timestamp: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  entityBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  entityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  titleText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  detailsText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 3,
  },
});

