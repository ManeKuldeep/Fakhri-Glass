import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CuttingSheet, PlacedPiece } from '../types';

interface SheetSwitcherProps {
  sheets: CuttingSheet[];
  activeSheetIndex: number;
  placements: PlacedPiece[];
  onSelectSheetIndex: (index: number) => void;
  onAddBlankSheet: () => void;
}

export default function SheetSwitcher({
  sheets,
  activeSheetIndex,
  placements,
  onSelectSheetIndex,
  onAddBlankSheet,
}: SheetSwitcherProps) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {sheets.map((sheet, index) => {
          const isActive = index === activeSheetIndex;
          const piecesOnSheet = placements.filter((p) => p.stock_item_id === sheet.id);

          return (
            <Pressable
              key={sheet.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onSelectSheetIndex(index)}
            >
              <View style={styles.tabHeader}>
                <MaterialCommunityIcons
                  name={sheet.source === 'offcut' ? 'shape-outline' : 'crop-square'}
                  size={16}
                  color={isActive ? '#1A73E8' : '#64748B'}
                />
                <Text style={[styles.tabTitle, isActive && styles.tabTitleActive]}>
                  Sheet {index + 1}
                </Text>
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                    {piecesOnSheet.length}
                  </Text>
                </View>
              </View>

              <Text style={[styles.tabSubtitle, isActive && styles.tabSubtitleActive]}>
                {sheet.source === 'offcut' ? 'Offcut' : 'Full'} · {sheet.width_mm}×
                {sheet.height_mm}
              </Text>
            </Pressable>
          );
        })}

        {/* Add Blank Sheet Button */}
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={onAddBlankSheet}
        >
          <MaterialCommunityIcons name="plus-box-outline" size={18} color="#1A73E8" />
          <Text style={styles.addBtnText}>+ Add Sheet</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minWidth: 125,
  },
  tabActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1A73E8',
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  tabTitleActive: {
    color: '#1A73E8',
  },
  badge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  badgeActive: {
    backgroundColor: '#DBEAFE',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  badgeTextActive: {
    color: '#1A73E8',
  },
  tabSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  tabSubtitleActive: {
    color: '#3B82F6',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
  },
  addBtnPressed: {
    backgroundColor: '#EFF6FF',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A73E8',
  },
});
