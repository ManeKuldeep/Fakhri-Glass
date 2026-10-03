import { useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CuttingPiece } from '../types';

interface UnplacedTrayProps {
  pieces: CuttingPiece[];
  onPlacePieceOnCurrentSheet: (piece: CuttingPiece) => void;
}

export default function UnplacedTray({
  pieces,
  onPlacePieceOnCurrentSheet,
}: UnplacedTrayProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (pieces.length === 0) {
    return (
      <View style={styles.allPlacedBar}>
        <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
        <Text style={styles.allPlacedText}>All ordered pieces are placed on sheets</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={() => setCollapsed(!collapsed)}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="tray-full" size={18} color="#D97706" />
          <Text style={styles.headerTitle}>
            Unplaced Pieces ({pieces.length})
          </Text>
        </View>
        <MaterialCommunityIcons
          name={collapsed ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#64748B"
        />
      </Pressable>

      {!collapsed && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {pieces.map((piece) => (
            <View key={piece.id} style={styles.pieceChip}>
              <View style={styles.pieceInfo}>
                <Text style={styles.orderLabel}>
                  Order #{piece.order_no} ({piece.piece_index}/{piece.total_qty})
                </Text>
                <Text style={styles.dimText}>
                  {piece.width_mm} × {piece.height_mm} mm
                </Text>
                <Text style={styles.custText} numberOfLines={1}>
                  {piece.customer_name}
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.placeBtn,
                  pressed && styles.placeBtnPressed,
                ]}
                onPress={() => onPlacePieceOnCurrentSheet(piece)}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.placeBtnText}>Place</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFBEB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  pieceChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    width: 170,
    justifyContent: 'space-between',
  },
  pieceInfo: {
    marginBottom: 8,
  },
  orderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  dimText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
    marginTop: 2,
  },
  custText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  placeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#1A73E8',
    borderRadius: 6,
    paddingVertical: 6,
  },
  placeBtnPressed: {
    backgroundColor: '#1557B0',
  },
  placeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  allPlacedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#ECFDF5',
    borderTopWidth: 1,
    borderTopColor: '#A7F3D0',
  },
  allPlacedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
});
