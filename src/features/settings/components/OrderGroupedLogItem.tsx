import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { OrderActivityGroup } from '../utils/groupActivityLogs';
import { formatLogTime } from '../utils/formatLogTime';

interface OrderGroupedLogItemProps {
  group: OrderActivityGroup;
}

export default function OrderGroupedLogItem({ group }: OrderGroupedLogItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const eventCount = group.events.length;
  const latestEvent = group.events[0];
  const orderTitle = group.orderNo ? `Order #${group.orderNo}` : 'Order Activity';
  const storeLabel = group.store
    ? group.store === 'mumbai'
      ? 'Mumbai'
      : 'Sanpada'
    : null;

  return (
    <View style={styles.card}>
      {/* Top Header Row */}
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#1A73E8" />
          <Text style={styles.orderTitle}>{orderTitle}</Text>
          {storeLabel ? (
            <View style={styles.storeBadge}>
              <Text style={styles.storeBadgeText}>{storeLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.timestamp}>{formatLogTime(group.latestCreatedAt)}</Text>
      </View>

      {/* Customer / Actor line */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText} numberOfLines={1}>
          {group.customerName ? `Customer: ${group.customerName} · ` : ''}
          Latest by {group.latestUser} ({group.latestAssignment})
        </Text>
      </View>

      {/* Latest Event Action Highlight */}
      <View style={styles.latestActionBox}>
        <View
          style={[
            styles.actionBadge,
            {
              backgroundColor: latestEvent.formatted.badge.bg,
              borderColor: latestEvent.formatted.badge.border,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={latestEvent.formatted.badge.icon}
            size={12}
            color={latestEvent.formatted.badge.color}
          />
          <Text style={[styles.actionBadgeText, { color: latestEvent.formatted.badge.color }]}>
            {latestEvent.formatted.badge.label}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.latestActionTitle}>{latestEvent.formatted.title}</Text>
          {latestEvent.formatted.details ? (
            <Text style={styles.latestActionDetails}>{latestEvent.formatted.details}</Text>
          ) : null}
        </View>
      </View>

      {/* Accordion Toggle if multiple events */}
      {eventCount > 1 ? (
        <View style={styles.footerRow}>
          <Pressable
            style={({ pressed }) => [
              styles.expandBtn,
              pressed && styles.expandBtnPressed,
            ]}
            onPress={() => setIsExpanded((prev) => !prev)}
          >
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#1A73E8"
            />
            <Text style={styles.expandBtnText}>
              {isExpanded
                ? 'Hide Order Timeline'
                : `View All ${eventCount} Order Actions`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Timeline Expansion */}
      {isExpanded && eventCount > 1 ? (
        <View style={styles.timelineContainer}>
          <View style={styles.timelineLine} />
          {group.events.map((ev, idx) => {
            const assignment = ev.log.user_assignment
              ? ev.log.user_assignment.charAt(0).toUpperCase() + ev.log.user_assignment.slice(1)
              : 'Shop';
            return (
              <View key={`${ev.log.id}-${idx}`} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <Text style={styles.timelineUser}>
                      {ev.log.user_name || 'System'} ({assignment})
                    </Text>
                    <Text style={styles.timelineTime}>
                      {formatLogTime(ev.log.created_at)}
                    </Text>
                  </View>
                  <Text style={styles.timelineTitle}>{ev.formatted.title}</Text>
                  {ev.formatted.details ? (
                    <Text style={styles.timelineDetails}>{ev.formatted.details}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
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
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  orderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  storeBadge: {
    backgroundColor: '#E0E7FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  storeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3730A3',
    textTransform: 'uppercase',
  },
  timestamp: {
    fontSize: 11,
    color: '#94A3B8',
  },
  metaRow: {
    marginBottom: 10,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },
  latestActionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  latestActionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  latestActionDetails: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  footerRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  expandBtnPressed: {
    opacity: 0.7,
  },
  expandBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A73E8',
  },
  timelineContainer: {
    marginTop: 10,
    paddingLeft: 12,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 17,
    top: 6,
    bottom: 6,
    width: 2,
    backgroundColor: '#E2E8F0',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1A73E8',
    marginTop: 3,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timelineUser: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  timelineTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  timelineDetails: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
});
