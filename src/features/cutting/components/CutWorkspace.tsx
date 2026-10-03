import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { packPieces } from '../../../optimizer/pack';
import { piecesOverlap, isUsableOffcut } from '../../../optimizer/validation';
import { ResultOffcut, WastedRect, KerfCut } from '../../../optimizer/types';
import { useCuttingSettingsStore } from '../stores/cuttingSettingsStore';
import { useStockForProduct } from '../queries';
import {
  CuttingPiece,
  CuttingProductQueueItem,
  CuttingSheet,
  PlacedPiece,
} from '../types';
import SheetSwitcher from './SheetSwitcher';
import CutCanvas from './CutCanvas';
import UnplacedTray from './UnplacedTray';
import CutSettingsModal from './CutSettingsModal';

interface CutWorkspaceProps {
  productQueueItem: CuttingProductQueueItem;
  onBack: () => void;
}

export default function CutWorkspace({
  productQueueItem,
  onBack,
}: CutWorkspaceProps) {
  const { settings } = useCuttingSettingsStore();

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // Sheets currently in the workspace layout
  const [sheets, setSheets] = useState<CuttingSheet[]>([]);
  // Placed pieces across all sheets
  const [placements, setPlacements] = useState<PlacedPiece[]>([]);
  // Pieces not currently placed on any sheet
  const [unplacedPieces, setUnplacedPieces] = useState<CuttingPiece[]>([]);
  // Counter for new blank sheets added by cutter
  const [blankSheetCounter, setBlankSheetCounter] = useState(1);

  // Fetch available stock for this product
  const { data: stockItems, isLoading: isStockLoading } = useStockForProduct(
    productQueueItem.productId,
  );

  // Expand order items into individual physical pieces to cut
  const allOrderedPieces = useMemo<CuttingPiece[]>(() => {
    const list: CuttingPiece[] = [];
    for (const oi of productQueueItem.orderItems) {
      for (let idx = 1; idx <= oi.qty; idx++) {
        list.push({
          id: `${oi.orderItemId}-${idx}`,
          order_item_id: oi.orderItemId,
          order_id: oi.orderId,
          order_no: oi.orderNo,
          customer_name: oi.customerName,
          width_mm: oi.widthMm,
          height_mm: oi.heightMm,
          is_lining: productQueueItem.isLining,
          piece_index: idx,
          total_qty: oi.qty,
        });
      }
    }
    return list;
  }, [productQueueItem]);

  // Run initial auto-layout optimizer using Phase 4 packPieces
  const runOptimizer = useCallback(() => {
    // Collect stock sheets
    let availableSheets: CuttingSheet[] = [];
    if (stockItems && stockItems.length > 0) {
      availableSheets = stockItems.map((s) => ({
        ...s,
        is_lining: productQueueItem.isLining,
      }));
    } else {
      // Default fallback standard architectural sheet (2440 x 1830 mm) if no stock recorded
      availableSheets = [
        {
          id: 'default-full-sheet-1',
          width_mm: 2440,
          height_mm: 1830,
          source: 'full',
          is_lining: productQueueItem.isLining,
          vertical_line_height_mm: productQueueItem.isLining ? 1830 : null,
          isNewBlankSheet: true,
        },
      ];
    }

    const result = packPieces(availableSheets, allOrderedPieces, settings);

    const usedSheets: CuttingSheet[] = [];
    const initialPlacements: PlacedPiece[] = [];

    // Map pieces lookup
    const pieceMap = new Map(allOrderedPieces.map((p) => [p.id, p]));

    for (const plan of result.plans) {
      usedSheets.push(plan.sheet);

      for (const p of plan.placements) {
        const pieceMeta = pieceMap.get(p.piece_id);
        if (pieceMeta) {
          initialPlacements.push({
            ...pieceMeta,
            stock_item_id: p.stock_item_id,
            x_mm: p.x_mm,
            y_mm: p.y_mm,
            w_mm: p.w_mm,
            h_mm: p.h_mm,
            rotated: p.rotated,
            hasCollision: false,
          });
        }
      }
    }

    // If optimizer needed fewer sheets or if some sheets weren't used, ensure at least 1 sheet
    if (usedSheets.length === 0 && availableSheets.length > 0) {
      usedSheets.push(availableSheets[0]);
    }

    setSheets(usedSheets);
    setPlacements(initialPlacements);

    // Any unplaced pieces
    const placedIds = new Set(initialPlacements.map((p) => p.id));
    setUnplacedPieces(allOrderedPieces.filter((p) => !placedIds.has(p.id)));
    setActiveSheetIndex(0);
  }, [allOrderedPieces, stockItems, productQueueItem.isLining, settings]);

  // Initial load
  useEffect(() => {
    if (!isStockLoading) {
      runOptimizer();
    }
  }, [isStockLoading, runOptimizer]);

  // Active sheet
  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];

  // Placed pieces on active sheet
  const activePlacements = useMemo(() => {
    if (!activeSheet) return [];
    return placements.filter((p) => p.stock_item_id === activeSheet.id);
  }, [placements, activeSheet]);

  // Check collision for pieces on a given sheet
  const checkCollisions = useCallback(
    (sheetId: string, currentPlacements: PlacedPiece[]) => {
      const sheetPieces = currentPlacements.filter((p) => p.stock_item_id === sheetId);
      const collisionIds = new Set<string>();

      for (let i = 0; i < sheetPieces.length; i++) {
        for (let j = i + 1; j < sheetPieces.length; j++) {
          const a = sheetPieces[i];
          const b = sheetPieces[j];
          if (piecesOverlap(a, b, settings.kerf_mm)) {
            collisionIds.add(a.id);
            collisionIds.add(b.id);
          }
        }
      }

      return currentPlacements.map((p) => {
        if (p.stock_item_id === sheetId) {
          return {
            ...p,
            hasCollision: collisionIds.has(p.id),
          };
        }
        return p;
      });
    },
    [settings.kerf_mm],
  );

  // Update piece position on drag
  const handleUpdatePosition = (pieceId: string, x_mm: number, y_mm: number) => {
    setPlacements((prev) => {
      const updated = prev.map((p) => {
        if (p.id === pieceId) {
          return { ...p, x_mm, y_mm };
        }
        return p;
      });

      const targetPiece = updated.find((p) => p.id === pieceId);
      if (targetPiece) {
        return checkCollisions(targetPiece.stock_item_id, updated);
      }
      return updated;
    });
  };

  // Rotate piece (swaps w_mm and h_mm) — only if not lining
  const handleRotatePiece = (pieceId: string) => {
    if (productQueueItem.isLining) {
      Alert.alert('Figured Glass', 'Figured lining glass cannot be rotated.');
      return;
    }

    setPlacements((prev) => {
      const updated = prev.map((p) => {
        if (p.id === pieceId) {
          const newW = p.h_mm;
          const newH = p.w_mm;
          return {
            ...p,
            w_mm: newW,
            h_mm: newH,
            rotated: !p.rotated,
          };
        }
        return p;
      });

      const targetPiece = updated.find((p) => p.id === pieceId);
      if (targetPiece) {
        return checkCollisions(targetPiece.stock_item_id, updated);
      }
      return updated;
    });
  };

  // Move piece to another sheet
  const handleMoveToSheet = (pieceId: string, targetSheetId: string) => {
    setPlacements((prev) => {
      const updated = prev.map((p) => {
        if (p.id === pieceId) {
          return {
            ...p,
            stock_item_id: targetSheetId,
            x_mm: 0,
            y_mm: 0, // place at origin of new sheet
          };
        }
        return p;
      });

      return checkCollisions(targetSheetId, updated);
    });

    // Switch to target sheet
    const targetIdx = sheets.findIndex((s) => s.id === targetSheetId);
    if (targetIdx >= 0) {
      setActiveSheetIndex(targetIdx);
    }
  };

  // Remove piece from sheet back to unplaced tray
  const handleRemoveToTray = (pieceId: string) => {
    const pieceToRemove = placements.find((p) => p.id === pieceId);
    if (!pieceToRemove) return;

    setPlacements((prev) => {
      const remaining = prev.filter((p) => p.id !== pieceId);
      return checkCollisions(pieceToRemove.stock_item_id, remaining);
    });

    const originalPiece = allOrderedPieces.find((p) => p.id === pieceId);
    if (originalPiece) {
      setUnplacedPieces((prev) => [...prev, originalPiece]);
    }
  };

  // Place piece from unplaced tray onto current sheet
  const handlePlaceFromTray = (piece: CuttingPiece) => {
    if (!activeSheet) return;

    // Find next position: simple placement at (0, 0) or offset
    const existing = placements.filter((p) => p.stock_item_id === activeSheet.id);
    let nextX = 0;
    let nextY = 0;

    // Place at bottom of last piece if space permits
    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      if (last.y_mm + last.h_mm + settings.kerf_mm + piece.height_mm <= activeSheet.height_mm) {
        nextX = last.x_mm;
        nextY = last.y_mm + last.h_mm + settings.kerf_mm;
      } else if (
        last.x_mm + last.w_mm + settings.kerf_mm + piece.width_mm <=
        activeSheet.width_mm
      ) {
        nextX = last.x_mm + last.w_mm + settings.kerf_mm;
        nextY = 0;
      }
    }

    const newPlacedPiece: PlacedPiece = {
      ...piece,
      stock_item_id: activeSheet.id,
      x_mm: nextX,
      y_mm: nextY,
      w_mm: piece.width_mm,
      h_mm: piece.height_mm,
      rotated: false,
    };

    setUnplacedPieces((prev) => prev.filter((p) => p.id !== piece.id));
    setPlacements((prev) => checkCollisions(activeSheet.id, [...prev, newPlacedPiece]));
  };

  // Add a blank full sheet
  const handleAddBlankSheet = () => {
    const newSheetId = `blank-sheet-${blankSheetCounter}`;
    setBlankSheetCounter((c) => c + 1);

    const newSheet: CuttingSheet = {
      id: newSheetId,
      width_mm: 2440,
      height_mm: 1830,
      source: 'full',
      is_lining: productQueueItem.isLining,
      vertical_line_height_mm: productQueueItem.isLining ? 1830 : null,
      isNewBlankSheet: true,
    };

    setSheets((prev) => [...prev, newSheet]);
    setActiveSheetIndex(sheets.length); // switch to newly added sheet
  };

  // Live wastage and leftover calculation for the active sheet
  const { liveWastePct, liveOffcuts, liveWastedRects, liveKerfCuts } = useMemo(() => {
    if (!activeSheet) {
      return {
        liveWastePct: 0,
        liveOffcuts: [] as ResultOffcut[],
        liveWastedRects: [] as WastedRect[],
        liveKerfCuts: [] as KerfCut[],
      };
    }

    const totalSheetArea = activeSheet.width_mm * activeSheet.height_mm;
    const pieceArea = activePlacements.reduce((sum, p) => sum + p.w_mm * p.h_mm, 0);

    // Approximate remaining bounding spaces:
    // If pieces are placed, calculate bounding box of placed pieces
    const offcuts: ResultOffcut[] = [];
    const wasted: WastedRect[] = [];
    const kerfCuts: KerfCut[] = [];

    if (activePlacements.length > 0 && totalSheetArea > 0) {
      const maxX = Math.max(...activePlacements.map((p) => p.x_mm + p.w_mm));
      const maxY = Math.max(...activePlacements.map((p) => p.y_mm + p.h_mm));

      // Right leftover strip
      const rightW = activeSheet.width_mm - maxX - settings.kerf_mm;
      if (rightW > 0) {
        kerfCuts.push({
          x_mm: maxX,
          y_mm: 0,
          width_mm: settings.kerf_mm,
          height_mm: activeSheet.height_mm,
          orientation: 'vertical',
        });
        if (isUsableOffcut(rightW, activeSheet.height_mm, settings.min_offcut_mm)) {
          offcuts.push({
            id: 'right-offcut',
            parent_id: activeSheet.id,
            x_mm: maxX + settings.kerf_mm,
            y_mm: 0,
            width_mm: rightW,
            height_mm: activeSheet.height_mm,
          });
        } else {
          wasted.push({
            x_mm: maxX + settings.kerf_mm,
            y_mm: 0,
            width_mm: rightW,
            height_mm: activeSheet.height_mm,
          });
        }
      }

      // Top leftover strip (above placed block)
      const topH = activeSheet.height_mm - maxY - settings.kerf_mm;
      if (topH > 0 && maxX > 0) {
        kerfCuts.push({
          x_mm: 0,
          y_mm: maxY,
          width_mm: maxX,
          height_mm: settings.kerf_mm,
          orientation: 'horizontal',
        });
        if (isUsableOffcut(maxX, topH, settings.min_offcut_mm)) {
          offcuts.push({
            id: 'top-offcut',
            parent_id: activeSheet.id,
            x_mm: 0,
            y_mm: maxY + settings.kerf_mm,
            width_mm: maxX,
            height_mm: topH,
          });
        } else {
          wasted.push({
            x_mm: 0,
            y_mm: maxY + settings.kerf_mm,
            width_mm: maxX,
            height_mm: topH,
          });
        }
      }
    }

    const pureWasteArea =
      totalSheetArea -
      pieceArea -
      offcuts.reduce((sum, o) => sum + o.width_mm * o.height_mm, 0);

    const wastePct =
      totalSheetArea > 0
        ? Number(((Math.max(0, pureWasteArea) / totalSheetArea) * 100).toFixed(1))
        : 0;

    return {
      liveWastePct: wastePct,
      liveOffcuts: offcuts,
      liveWastedRects: wasted,
      liveKerfCuts: kerfCuts,
    };
  }, [activeSheet, activePlacements, settings]);

  const hasAnyCollisions = placements.some((p) => p.hasCollision);

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0F172A" />
        </Pressable>

        <View style={styles.headerTitleArea}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {productQueueItem.productName}
          </Text>
          <Text style={styles.headerSubtitle}>
            {productQueueItem.thicknessMm} mm · {productQueueItem.categoryName}
            {productQueueItem.isLining ? ' (Lining Glass)' : ''}
          </Text>
        </View>

        {/* Settings button */}
        <Pressable
          style={styles.settingsBtn}
          onPress={() => setSettingsModalVisible(true)}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="cog" size={22} color="#1E293B" />
        </Pressable>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Placed</Text>
          <Text style={styles.statValue}>
            {placements.length} / {allOrderedPieces.length}
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Sheets Used</Text>
          <Text style={styles.statValue}>{sheets.length}</Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Active Wastage</Text>
          <View
            style={[
              styles.wastageBadge,
              liveWastePct > settings.max_wastage_pct
                ? styles.wastageBadgeHigh
                : styles.wastageBadgeNormal,
            ]}
          >
            <Text
              style={[
                styles.wastageText,
                liveWastePct > settings.max_wastage_pct
                  ? styles.wastageTextHigh
                  : styles.wastageTextNormal,
              ]}
            >
              {liveWastePct}%
            </Text>
          </View>
        </View>
      </View>

      {/* Collision Warning Banner */}
      {hasAnyCollisions && (
        <View style={styles.collisionBanner}>
          <MaterialCommunityIcons name="alert" size={18} color="#B91C1C" />
          <Text style={styles.collisionBannerText}>
            Overlapping pieces detected! Drag pieces apart to clear kerf collisions.
          </Text>
        </View>
      )}

      {/* Sheet Switcher */}
      <SheetSwitcher
        sheets={sheets}
        activeSheetIndex={activeSheetIndex}
        placements={placements}
        onSelectSheetIndex={setActiveSheetIndex}
        onAddBlankSheet={handleAddBlankSheet}
      />

      {/* Canvas Area */}
      {isStockLoading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator size="large" color="#1A73E8" />
          <Text style={styles.loadingText}>Loading stock sheets and optimising...</Text>
        </View>
      ) : activeSheet ? (
        <CutCanvas
          sheet={activeSheet}
          placedPieces={activePlacements}
          allSheets={sheets}
          offcuts={liveOffcuts}
          wastedRects={liveWastedRects}
          kerfCuts={liveKerfCuts}
          kerfMm={settings.kerf_mm}
          onUpdatePosition={handleUpdatePosition}
          onRotatePiece={handleRotatePiece}
          onMoveToSheet={handleMoveToSheet}
          onRemoveToTray={handleRemoveToTray}
        />
      ) : (
        <View style={styles.loadingArea}>
          <Text style={styles.emptyText}>No sheets available. Tap + Add Sheet.</Text>
        </View>
      )}

      {/* Bottom Tray with Unplaced Pieces */}
      <UnplacedTray
        pieces={unplacedPieces}
        onPlacePieceOnCurrentSheet={handlePlaceFromTray}
      />

      {/* Action Footer */}
      <View style={styles.footer}>
        <Pressable
          style={styles.reoptimizeBtn}
          onPress={runOptimizer}
        >
          <MaterialCommunityIcons name="refresh" size={18} color="#1E293B" />
          <Text style={styles.reoptimizeText}>Auto-Pack</Text>
        </Pressable>

        {/* Confirm Cut Plan — Disabled in Phase 5 */}
        <Pressable
          style={[styles.confirmBtn, styles.confirmBtnDisabled]}
          onPress={() => {
            Alert.alert(
              'Phase 6 Coming Soon',
              'confirm_cut_plan atomic stock deduction and ledger creation is scheduled for Phase 6.',
            );
          }}
        >
          <MaterialCommunityIcons name="check" size={20} color="#94A3B8" />
          <Text style={styles.confirmBtnText}>Confirm Plan (Phase 6)</Text>
        </Pressable>
      </View>

      {/* Settings Modal */}
      <CutSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        onApply={runOptimizer}
      />
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
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleArea: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  settingsBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  wastageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  wastageBadgeNormal: {
    backgroundColor: '#ECFDF5',
  },
  wastageBadgeHigh: {
    backgroundColor: '#FEF2F2',
  },
  wastageText: {
    fontSize: 13,
    fontWeight: '700',
  },
  wastageTextNormal: {
    color: '#059669',
  },
  wastageTextHigh: {
    color: '#DC2626',
  },
  collisionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FEE2E2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  collisionBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
  },
  loadingArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 15,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  reoptimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reoptimizeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  confirmBtnDisabled: {
    opacity: 0.8,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
