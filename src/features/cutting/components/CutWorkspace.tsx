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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { packPieces } from '../../../optimizer/pack';
import { piecesOverlap, isUsableOffcut } from '../../../optimizer/validation';
import { ResultOffcut, WastedRect, KerfCut } from '../../../optimizer/types';
import { useCuttingSettingsStore } from '../stores/cuttingSettingsStore';
import { useStockForProduct } from '../queries';
import { useConfirmCutPlan, ConfirmOffcutInput } from '../mutations';
import { supabase } from '../../../lib/supabase';
import { printOrderLabels } from '../../labels/services';
import { OrderWithItemsForLabels } from '../../labels/types';
import {
  CuttingPiece,
  CuttingQueueTask,
  CuttingSheet,
  PlacedPiece,
} from '../types';
import SheetSwitcher from './SheetSwitcher';
import CutCanvas from './CutCanvas';
import UnplacedTray from './UnplacedTray';
import CutSettingsModal from './CutSettingsModal';

interface CutWorkspaceProps {
  task: CuttingQueueTask;
  onBack: () => void;
}

export default function CutWorkspace({ task, onBack }: CutWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const { settings } = useCuttingSettingsStore();
  const confirmMutation = useConfirmCutPlan();

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // Sheets currently in the workspace layout
  const [sheets, setSheets] = useState<CuttingSheet[]>([]);
  // Placed pieces across all sheets
  const [placements, setPlacements] = useState<PlacedPiece[]>([]);
  // Pieces not currently placed on any sheet
  const [unplacedPieces, setUnplacedPieces] = useState<CuttingPiece[]>([]);

  // Fetch available stock for this product
  const { data: stockItems, isLoading: isStockLoading, refetch: refetchStock } =
    useStockForProduct(task.productId);

  // Expand order items into individual physical pieces to cut
  const allOrderedPieces = useMemo<CuttingPiece[]>(() => {
    const list: CuttingPiece[] = [];
    for (const oi of task.orderItems) {
      for (let idx = 1; idx <= oi.qty; idx++) {
        list.push({
          id: `${oi.orderItemId}-${idx}`,
          order_item_id: oi.orderItemId,
          order_id: task.orderId,
          order_no: task.orderNo,
          customer_name: task.customerName,
          width_mm: oi.widthMm,
          height_mm: oi.heightMm,
          is_lining: task.isLining,
          piece_index: idx,
          total_qty: oi.qty,
        });
      }
    }
    return list;
  }, [task]);

  // Run initial auto-layout optimizer using Phase 4 packPieces
  const runOptimizer = useCallback(async () => {
    let availableSheets: CuttingSheet[] = [];

    if (stockItems && stockItems.length > 0) {
      availableSheets = stockItems.map((s) => ({
        ...s,
        is_lining: task.isLining,
      }));
    } else {
      // If no stock is recorded in inventory, create a default available full sheet
      // so the cutter can work and confirm without a manual round-trip to Inventory.
      const defaultW = 2440;
      const defaultH = 1830;
      const { data: created, error } = await supabase
        .from('stock_items')
        .insert({
          product_id: task.productId,
          width_mm: defaultW,
          height_mm: defaultH,
          source: 'full',
          status: 'available',
          vertical_line_height_mm: task.isLining ? defaultH : null,
        })
        .select('id, width_mm, height_mm, source, status, vertical_line_height_mm')
        .single();

      if (!error && created) {
        availableSheets = [
          {
            id: created.id,
            width_mm: created.width_mm,
            height_mm: created.height_mm,
            source: 'full',
            is_lining: task.isLining,
            vertical_line_height_mm: created.vertical_line_height_mm,
          },
        ];
      }
    }

    const result = packPieces(availableSheets, allOrderedPieces, settings);

    const usedSheets: CuttingSheet[] = [];
    const initialPlacements: PlacedPiece[] = [];

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

    if (usedSheets.length === 0 && availableSheets.length > 0) {
      usedSheets.push(availableSheets[0]);
    }

    setSheets(usedSheets);
    setPlacements(initialPlacements);

    const placedIds = new Set(initialPlacements.map((p) => p.id));
    setUnplacedPieces(allOrderedPieces.filter((p) => !placedIds.has(p.id)));
    setActiveSheetIndex(0);
  }, [allOrderedPieces, stockItems, task.isLining, task.productId, settings]);

  // Initial load
  useEffect(() => {
    if (!isStockLoading) {
      void runOptimizer();
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

  // Rotate piece (swaps w_mm and h_mm) — strictly disabled for lining glass
  const handleRotatePiece = (pieceId: string) => {
    if (task.isLining) {
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
            y_mm: 0,
          };
        }
        return p;
      });

      return checkCollisions(targetSheetId, updated);
    });

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

    const existing = placements.filter((p) => p.stock_item_id === activeSheet.id);
    let nextX = 0;
    let nextY = 0;

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

  // Add a blank full sheet backed by database row
  const handleAddBlankSheet = async () => {
    try {
      const usedSheetIds = new Set(sheets.map((s) => s.id));
      const availableUnused = stockItems?.find(
        (s) => s.source === 'full' && !usedSheetIds.has(s.id),
      );

      if (availableUnused) {
        const newSheet: CuttingSheet = {
          ...availableUnused,
          is_lining: task.isLining,
        };
        setSheets((prev) => [...prev, newSheet]);
        setActiveSheetIndex(sheets.length);
        return;
      }

      // Provision new full sheet in stock_items
      const defaultW = 2440;
      const defaultH = 1830;
      const { data: created, error } = await supabase
        .from('stock_items')
        .insert({
          product_id: task.productId,
          width_mm: defaultW,
          height_mm: defaultH,
          source: 'full',
          status: 'available',
          vertical_line_height_mm: task.isLining ? defaultH : null,
        })
        .select('id, width_mm, height_mm, source, status, vertical_line_height_mm')
        .single();

      if (error) {
        throw new Error(`Failed to add sheet: ${error.message}`);
      }

      const newSheet: CuttingSheet = {
        id: created.id,
        width_mm: created.width_mm,
        height_mm: created.height_mm,
        source: 'full',
        is_lining: task.isLining,
        vertical_line_height_mm: created.vertical_line_height_mm,
      };

      setSheets((prev) => [...prev, newSheet]);
      setActiveSheetIndex(sheets.length);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg);
    }
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
            id: `${activeSheet.id}-right-offcut`,
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
            id: `${activeSheet.id}-top-offcut`,
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

  // Wire confirm button to call confirm_cut_plan RPC
  const handleConfirmPlan = () => {
    // 1. Validation checks
    if (unplacedPieces.length > 0) {
      Alert.alert(
        'Unplaced Pieces',
        `Please place all ${allOrderedPieces.length} pieces on sheets before confirming. ${unplacedPieces.length} piece(s) are still in the tray.`,
      );
      return;
    }

    if (hasAnyCollisions) {
      Alert.alert(
        'Collisions Detected',
        'Cannot confirm: overlapping pieces detected on one or more sheets. Please adjust placements to satisfy kerf spacing.',
      );
      return;
    }

    if (placements.length !== allOrderedPieces.length) {
      Alert.alert(
        'Piece Count Mismatch',
        `Placed pieces (${placements.length}) does not match ordered quantity (${allOrderedPieces.length}).`,
      );
      return;
    }

    // 2. Compute offcuts across all used sheets
    const usedSheetIds = Array.from(new Set(placements.map((p) => p.stock_item_id)));
    const allOffcuts: ConfirmOffcutInput[] = [];

    for (const sId of usedSheetIds) {
      const s = sheets.find((sh) => sh.id === sId);
      if (!s) continue;
      const piecesOnSheet = placements.filter((p) => p.stock_item_id === sId);
      if (piecesOnSheet.length === 0) continue;

      const maxX = Math.max(...piecesOnSheet.map((p) => p.x_mm + p.w_mm));
      const maxY = Math.max(...piecesOnSheet.map((p) => p.y_mm + p.h_mm));

      // Right leftover strip
      const rightW = s.width_mm - maxX - settings.kerf_mm;
      if (rightW > 0 && isUsableOffcut(rightW, s.height_mm, settings.min_offcut_mm)) {
        allOffcuts.push({
          parent_id: s.id,
          width_mm: rightW,
          height_mm: s.height_mm,
        });
      }

      // Top leftover strip
      const topH = s.height_mm - maxY - settings.kerf_mm;
      if (topH > 0 && maxX > 0 && isUsableOffcut(maxX, topH, settings.min_offcut_mm)) {
        allOffcuts.push({
          parent_id: s.id,
          width_mm: maxX,
          height_mm: topH,
        });
      }
    }

    // 3. Confirmation Dialog
    Alert.alert(
      'Confirm Cut Plan',
      `Confirm cutting plan for Order #${task.orderNo}?\n\n` +
        `• Pieces to cut: ${placements.length}\n` +
        `• Sheets consumed: ${usedSheetIds.length}\n` +
        `• Offcuts created: ${allOffcuts.length}\n\n` +
        `This will deduct stock, record movements, and update the order status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Deduct Stock',
          style: 'default',
          onPress: () => {
            confirmMutation.mutate(
              {
                orderId: task.orderId,
                productId: task.productId,
                kerfMm: settings.kerf_mm,
                maxWastagePct: settings.max_wastage_pct,
                pieces: placements.map((p) => ({
                  order_item_id: p.order_item_id,
                  stock_item_id: p.stock_item_id,
                  x_mm: p.x_mm,
                  y_mm: p.y_mm,
                  w_mm: p.w_mm,
                  h_mm: p.h_mm,
                  rotated: p.rotated,
                })),
                offcuts: allOffcuts,
              },
              {
                onSuccess: () => {
                  Alert.alert(
                    'Cut Plan Confirmed!',
                    `Order #${task.orderNo} plan confirmed. Stock has been deducted and offcuts added to inventory.\n\nPrint piece labels now?`,
                    [
                      {
                        text: 'Print Labels',
                        onPress: async () => {
                          try {
                            const orderForLabels: OrderWithItemsForLabels = {
                              id: task.orderId,
                              order_no: task.orderNo,
                              store: task.store,
                              customer: {
                                name: task.customerName,
                                phone: task.customerPhone,
                              },
                              order_items: task.orderItems.map((oi) => ({
                                id: oi.orderItemId,
                                width_mm: oi.finishedWidthMm ?? oi.widthMm,
                                height_mm: oi.finishedHeightMm ?? oi.heightMm,
                                qty: oi.qty,
                                is_polished: oi.isPolished,
                                product: {
                                  name: task.productName,
                                  thickness_mm: task.thicknessMm,
                                  color: task.color,
                                },
                              })),
                            };
                            await printOrderLabels(orderForLabels);
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : String(err);
                            Alert.alert('Label Printing Failed', msg);
                          } finally {
                            onBack();
                          }
                        },
                      },
                      { text: 'Done', style: 'cancel', onPress: onBack },
                    ],
                  );
                },
                onError: (err) => {
                  // In case sheets were consumed or plan already confirmed, offer refresh
                  void refetchStock();
                  Alert.alert('Cannot Confirm Cut Plan', err.message);
                },
              },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header with notch/status bar spacing */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
        </Pressable>

        <View style={styles.headerTitleArea}>
          <View style={styles.orderBadgeRow}>
            <Text style={styles.orderNoText}>Order #{task.orderNo}</Text>
            <Text style={styles.customerText}>· {task.customerName}</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {task.productName} ({task.thicknessMm} mm)
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
          onPress={() => void runOptimizer()}
        >
          <MaterialCommunityIcons name="refresh" size={18} color="#1E293B" />
          <Text style={styles.reoptimizeText}>Auto-Pack</Text>
        </Pressable>

        {/* Confirm Cut Plan — Fully Wired in Phase 6 */}
        <Pressable
          style={[
            styles.confirmBtn,
            (confirmMutation.isPending || hasAnyCollisions || unplacedPieces.length > 0) &&
              styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirmPlan}
          disabled={confirmMutation.isPending}
        >
          {confirmMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-all" size={20} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>Confirm Cut Plan</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Settings Modal */}
      <CutSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        onApply={() => void runOptimizer()}
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitleArea: {
    flex: 1,
  },
  orderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderNoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
  },
  customerText: {
    fontSize: 13,
    color: '#64748B',
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#16A34A',
  },
  confirmBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.8,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
