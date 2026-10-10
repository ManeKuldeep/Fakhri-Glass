import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { packPieces } from '../../../optimizer/pack';
import { piecesOverlap } from '../../../optimizer/validation';
import { ResultOffcut, WastedRect, KerfCut } from '../../../optimizer/types';
import { formatInches } from '../../inventory/utils';
import { useCuttingSettingsStore } from '../stores/cuttingSettingsStore';
import { useCuttingQueue, useStockForProduct } from '../queries';
import { useConfirmCutPlan, ConfirmOffcutInput } from '../mutations';
import { useRouter } from 'expo-router';
import { printOrderLabels } from '../../labels/services';
import { OrderWithItemsForLabels } from '../../labels/types';
import { computeSheetLeftovers, findBestPlacementOnSheet, canFitPieceOnSheet } from '../utils';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useCuttingSettingsStore();
  const confirmMutation = useConfirmCutPlan();

  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  const [sheets, setSheets] = useState<CuttingSheet[]>([]);
  // Placed pieces across all sheets
  const [placements, setPlacements] = useState<PlacedPiece[]>([]);
  // Pieces not currently placed on any sheet
  const [unplacedPieces, setUnplacedPieces] = useState<CuttingPiece[]>([]);
  // Currently selected piece for actions
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const selectedPiece = placements.find((p) => p.id === selectedPieceId);

  useEffect(() => {
    setSelectedPieceId(null);
  }, [activeSheetIndex]);

  // Fetch available stock for this product
  const { data: stockItems, isLoading: isStockLoading, refetch: refetchStock } =
    useStockForProduct(task.productId);

  // Fetch live queue to detect incoming orders for this product on the fly
  const { data: latestQueue } = useCuttingQueue();

  // Expand initial order items into individual physical pieces to cut
  const initialPieces = useMemo<CuttingPiece[]>(() => {
    const list: CuttingPiece[] = [];
    for (const oi of task.orderItems) {
      const cutOffset = oi.cutQty ?? 0;
      const totalOriginal = oi.originalQty ?? oi.qty;
      for (let idx = 1; idx <= oi.qty; idx++) {
        const pieceNum = cutOffset + idx;
        list.push({
          id: `${oi.orderItemId}-${pieceNum}`,
          order_item_id: oi.orderItemId,
          order_id: oi.orderId || task.orderId,
          order_no: oi.orderNo || task.orderNo,
          customer_name: oi.customerName || task.customerName,
          width_mm: oi.widthMm,
          height_mm: oi.heightMm,
          is_lining: task.isLining,
          piece_index: pieceNum,
          total_qty: totalOriginal,
        });
      }
    }
    return list;
  }, [task]);

  // Current pieces to cut in the workspace (updates on partial confirmations or incoming orders)
  const [currentPieces, setCurrentPieces] = useState<CuttingPiece[]>(initialPieces);

  useEffect(() => {
    setCurrentPieces(initialPieces);
  }, [initialPieces]);

  // Detect incoming orders for this product that are not yet in the workspace
  const incomingNewPieces = useMemo<CuttingPiece[]>(() => {
    if (!latestQueue) return [];
    const currentItemIds = new Set(currentPieces.map((p) => p.order_item_id));
    const matchingTasks = latestQueue.filter((t) => t.productId === task.productId);
    const newPieces: CuttingPiece[] = [];

    for (const t of matchingTasks) {
      for (const oi of t.orderItems) {
        if (!currentItemIds.has(oi.orderItemId)) {
          const cutOffset = oi.cutQty ?? 0;
          const totalOriginal = oi.originalQty ?? oi.qty;
          for (let idx = 1; idx <= oi.qty; idx++) {
            const pieceNum = cutOffset + idx;
            newPieces.push({
              id: `${oi.orderItemId}-${pieceNum}`,
              order_item_id: oi.orderItemId,
              order_id: oi.orderId || t.orderId,
              order_no: oi.orderNo || t.orderNo,
              customer_name: oi.customerName || t.customerName,
              width_mm: oi.widthMm,
              height_mm: oi.heightMm,
              is_lining: t.isLining,
              piece_index: pieceNum,
              total_qty: totalOriginal,
            });
          }
        }
      }
    }
    return newPieces;
  }, [latestQueue, task.productId, currentPieces]);

  // Run auto-layout optimizer using Phase 4 packPieces
  const runOptimizer = useCallback(
    async (
      piecesToPack?: CuttingPiece[],
      preserveUnplaced = false,
      stockToUse?: CuttingSheet[],
    ) => {
      const targetPieces = piecesToPack ?? currentPieces;
      if (targetPieces.length === 0) {
        setSheets([]);
        setPlacements([]);
        if (!preserveUnplaced) {
          setUnplacedPieces([]);
        }
        return;
      }

      let availableSheets: CuttingSheet[] = [];
      const stockSource = stockToUse ?? stockItems;

      if (stockSource && stockSource.length > 0) {
        // Prioritize offcuts first, then smaller area first
        const sortedStock = [...stockSource].sort((a, b) => {
          if (a.source === 'offcut' && b.source !== 'offcut') return -1;
          if (a.source !== 'offcut' && b.source === 'offcut') return 1;
          return a.width_mm * a.height_mm - b.width_mm * b.height_mm;
        });
        availableSheets = sortedStock.map((s) => ({
          ...s,
          is_lining: task.isLining,
        }));
      }

      if (availableSheets.length === 0) {
        setSheets([]);
        setPlacements([]);
        setUnplacedPieces(targetPieces);
        return;
      }

      const result = packPieces(availableSheets, targetPieces, settings);

      const usedSheets: CuttingSheet[] = [];
      const initialPlacements: PlacedPiece[] = [];

      const pieceMap = new Map(targetPieces.map((p) => [p.id, p]));

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

      // Ensure offcuts are placed first in workspace sheets so activeSheetIndex=0 shows the offcut sheet
      usedSheets.sort((a, b) => {
        if (a.source === 'offcut' && b.source !== 'offcut') return -1;
        if (a.source !== 'offcut' && b.source === 'offcut') return 1;
        return 0;
      });

      if (usedSheets.length === 0 && availableSheets.length > 0) {
        usedSheets.push(availableSheets[0]);
      }

      setSheets(usedSheets);
      setPlacements(initialPlacements);

      const placedIds = new Set(initialPlacements.map((p) => p.id));
      if (preserveUnplaced) {
        const unplacedFromRun = targetPieces.filter((p) => !placedIds.has(p.id));
        setUnplacedPieces((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const p of unplacedFromRun) {
            map.set(p.id, p);
          }
          return Array.from(map.values());
        });
      } else {
        setUnplacedPieces(targetPieces.filter((p) => !placedIds.has(p.id)));
      }
      setActiveSheetIndex(0);
    },
    [currentPieces, stockItems, task.isLining, settings],
  );

  // Initial load
  useEffect(() => {
    if (!isStockLoading) {
      void runOptimizer(initialPieces);
    }
  }, [isStockLoading, initialPieces, runOptimizer]);

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

  // Add a sheet from available inventory (preferring offcuts that fit, then full sheets)
  const handleAddBlankSheet = async (
    piecesToFit?: { width_mm: number; height_mm: number }[],
  ): Promise<CuttingSheet | null> => {
    try {
      const usedSheetIds = new Set(sheets.map((s) => s.id));
      const availableInventorySheets =
        stockItems?.filter((s) => !usedSheetIds.has(s.id)) ?? [];

      if (availableInventorySheets.length === 0) {
        Alert.alert(
          'Out of Stock',
          'No additional sheets available in inventory for this glass type. Please add stock in Inventory before cutting.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Inventory', onPress: () => router.push('/(tabs)/inventory') },
          ],
        );
        return null;
      }

      // If specific pieces need to be fitted (e.g. from unplaced tray or move)
      if (piecesToFit && piecesToFit.length > 0) {
        // 1. Check unused offcuts that can fit at least one piece (sorted smallest area first)
        const fittingOffcut = availableInventorySheets
          .filter((s) => s.source === 'offcut')
          .sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm)
          .find((offcut) =>
            piecesToFit.some((p) => canFitPieceOnSheet(offcut, p, task.isLining)),
          );

        if (fittingOffcut) {
          const newSheet: CuttingSheet = {
            ...fittingOffcut,
            is_lining: task.isLining,
          };
          setSheets((prev) => [...prev, newSheet]);
          setActiveSheetIndex(sheets.length);
          return newSheet;
        }

        // 2. If no offcut fits, check unused full sheets in inventory that can fit the pieces
        const fittingFull = availableInventorySheets
          .filter((s) => s.source === 'full')
          .find((full) =>
            piecesToFit.some((p) => canFitPieceOnSheet(full, p, task.isLining)),
          );

        if (fittingFull) {
          const newSheet: CuttingSheet = {
            ...fittingFull,
            is_lining: task.isLining,
          };
          setSheets((prev) => [...prev, newSheet]);
          setActiveSheetIndex(sheets.length);
          return newSheet;
        }

        // If neither fitting offcut nor fitting full sheet is available
        const hasAnyFull = availableInventorySheets.some((s) => s.source === 'full');
        const alertMsg = hasAnyFull
          ? 'The unplaced piece(s) exceed the dimensions of all remaining sheets in inventory.'
          : 'The unplaced piece(s) do not fit into any remaining offcuts, and no full sheets are available in inventory. Please add stock in Inventory.';

        Alert.alert('No Fitting Sheet in Inventory', alertMsg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Inventory', onPress: () => router.push('/(tabs)/inventory') },
        ]);
        return null;
      }

      // General blank sheet addition (e.g. user pressed + in switcher)
      const nextSheet =
        availableInventorySheets.find((s) => s.source === 'offcut') ??
        availableInventorySheets.find((s) => s.source === 'full');

      if (nextSheet) {
        const newSheet: CuttingSheet = {
          ...nextSheet,
          is_lining: task.isLining,
        };
        setSheets((prev) => [...prev, newSheet]);
        setActiveSheetIndex(sheets.length);
        return newSheet;
      }

      Alert.alert(
        'Out of Stock',
        'No additional sheets available in inventory for this glass type.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Inventory', onPress: () => router.push('/(tabs)/inventory') },
        ],
      );
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Error', msg);
      return null;
    }
  };

  // Move piece to another sheet with collision-free placement
  const handleMoveToSheet = (pieceId: string, targetSheetId: string) => {
    const targetSheet = sheets.find((s) => s.id === targetSheetId);
    if (!targetSheet) return;

    const targetPiece = placements.find((p) => p.id === pieceId);
    if (!targetPiece) return;

    const existingOnTarget = placements.filter(
      (p) => p.stock_item_id === targetSheetId && p.id !== pieceId,
    );
    const bestPos = findBestPlacementOnSheet(
      targetSheet,
      targetPiece.w_mm,
      targetPiece.h_mm,
      existingOnTarget,
      settings.kerf_mm,
    );

    setPlacements((prev) => {
      const updated = prev.map((p) => {
        if (p.id === pieceId) {
          return {
            ...p,
            stock_item_id: targetSheetId,
            x_mm: bestPos.x_mm,
            y_mm: bestPos.y_mm,
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

  // Move / stash a placed piece to the next sheet directly
  const handleMovePieceToNextSheet = async (pieceId: string) => {
    const piece = placements.find((p) => p.id === pieceId);
    if (!piece) return;

    const currentSheetIdx = sheets.findIndex((s) => s.id === piece.stock_item_id);
    if (currentSheetIdx === -1) return;

    let targetSheet: CuttingSheet | null = null;
    let targetIdx = currentSheetIdx + 1;

    if (targetIdx < sheets.length) {
      targetSheet = sheets[targetIdx];
    } else {
      targetSheet = await handleAddBlankSheet([{ width_mm: piece.w_mm, height_mm: piece.h_mm }]);
      targetIdx = sheets.length;
    }

    if (!targetSheet) return;

    const existingOnTarget = placements.filter(
      (p) => p.stock_item_id === targetSheet!.id && p.id !== pieceId,
    );
    const bestPos = findBestPlacementOnSheet(
      targetSheet,
      piece.w_mm,
      piece.h_mm,
      existingOnTarget,
      settings.kerf_mm,
    );

    setPlacements((prev) => {
      const updated = prev.map((p) => {
        if (p.id === pieceId) {
          return {
            ...p,
            stock_item_id: targetSheet!.id,
            x_mm: bestPos.x_mm,
            y_mm: bestPos.y_mm,
          };
        }
        return p;
      });
      return checkCollisions(targetSheet!.id, updated);
    });

    setActiveSheetIndex(targetIdx);
  };

  // Remove piece from sheet back to unplaced tray
  const handleRemoveToTray = (pieceId: string) => {
    const pieceToRemove = placements.find((p) => p.id === pieceId);
    if (!pieceToRemove) return;

    setPlacements((prev) => {
      const remaining = prev.filter((p) => p.id !== pieceId);
      return checkCollisions(pieceToRemove.stock_item_id, remaining);
    });
    const originalPiece = currentPieces.find((p) => p.id === pieceId);
    if (originalPiece) {
      setUnplacedPieces((prev) => [...prev, originalPiece]);
    }
  };

  // Place piece from unplaced tray onto current sheet
  const handlePlaceFromTray = (piece: CuttingPiece) => {
    if (!activeSheet) return;

    const existing = placements.filter((p) => p.stock_item_id === activeSheet.id);
    const pos = findBestPlacementOnSheet(
      activeSheet,
      piece.width_mm,
      piece.height_mm,
      existing,
      settings.kerf_mm,
    );

    const canPlaceNormal =
      pos.x_mm + piece.width_mm <= activeSheet.width_mm &&
      pos.y_mm + piece.height_mm <= activeSheet.height_mm;

    let canPlaceRotated = false;
    let rotatedPos = pos;
    if (!canPlaceNormal && !task.isLining) {
      rotatedPos = findBestPlacementOnSheet(
        activeSheet,
        piece.height_mm,
        piece.width_mm,
        existing,
        settings.kerf_mm,
      );
      canPlaceRotated =
        rotatedPos.x_mm + piece.height_mm <= activeSheet.width_mm &&
        rotatedPos.y_mm + piece.width_mm <= activeSheet.height_mm;
    }

    if (!canPlaceNormal && !canPlaceRotated) {
      Alert.alert('Cannot Fit', 'This piece exceeds the available dimensions of the active sheet.');
      return;
    }

    const newPlacedPiece: PlacedPiece = {
      ...piece,
      stock_item_id: activeSheet.id,
      x_mm: canPlaceNormal ? pos.x_mm : rotatedPos.x_mm,
      y_mm: canPlaceNormal ? pos.y_mm : rotatedPos.y_mm,
      w_mm: canPlaceNormal ? piece.width_mm : piece.height_mm,
      h_mm: canPlaceNormal ? piece.height_mm : piece.width_mm,
      rotated: !canPlaceNormal && canPlaceRotated,
    };

    setUnplacedPieces((prev) => prev.filter((p) => p.id !== piece.id));
    setPlacements((prev) => checkCollisions(activeSheet.id, [...prev, newPlacedPiece]));
  };

  // Place piece from unplaced tray directly onto next sheet
  const handlePlacePieceOnNextSheet = async (piece: CuttingPiece) => {
    let targetIdx = activeSheetIndex + 1;
    let targetSheet: CuttingSheet | null = null;

    if (targetIdx < sheets.length) {
      targetSheet = sheets[targetIdx];
    } else {
      targetSheet = await handleAddBlankSheet([piece]);
      targetIdx = sheets.length;
    }

    if (!targetSheet) return;

    const existingOnTarget = placements.filter((p) => p.stock_item_id === targetSheet!.id);
    const pos = findBestPlacementOnSheet(
      targetSheet,
      piece.width_mm,
      piece.height_mm,
      existingOnTarget,
      settings.kerf_mm,
    );

    const canPlaceNormal =
      pos.x_mm + piece.width_mm <= targetSheet.width_mm &&
      pos.y_mm + piece.height_mm <= targetSheet.height_mm;

    let canPlaceRotated = false;
    let rotatedPos = pos;
    if (!canPlaceNormal && !task.isLining) {
      rotatedPos = findBestPlacementOnSheet(
        targetSheet,
        piece.height_mm,
        piece.width_mm,
        existingOnTarget,
        settings.kerf_mm,
      );
      canPlaceRotated =
        rotatedPos.x_mm + piece.height_mm <= targetSheet.width_mm &&
        rotatedPos.y_mm + piece.width_mm <= targetSheet.height_mm;
    }

    if (!canPlaceNormal && !canPlaceRotated) {
      Alert.alert(
        'Cannot Fit',
        'This piece does not fit within the dimensions of the next sheet.',
      );
      return;
    }

    const newPlacedPiece: PlacedPiece = {
      ...piece,
      stock_item_id: targetSheet.id,
      x_mm: canPlaceNormal ? pos.x_mm : rotatedPos.x_mm,
      y_mm: canPlaceNormal ? pos.y_mm : rotatedPos.y_mm,
      w_mm: canPlaceNormal ? piece.width_mm : piece.height_mm,
      h_mm: canPlaceNormal ? piece.height_mm : piece.width_mm,
      rotated: !canPlaceNormal && canPlaceRotated,
    };

    setUnplacedPieces((prev) => prev.filter((p) => p.id !== piece.id));
    setPlacements((prev) => checkCollisions(targetSheet!.id, [...prev, newPlacedPiece]));
    setActiveSheetIndex(targetIdx);
  };

  // Auto-pack only the currently placed pieces without placing removed pieces again
  const handleAutoPack = async () => {
    const placedPiecesToPack: CuttingPiece[] = placements.map((p) => ({
      id: p.id,
      order_item_id: p.order_item_id,
      order_id: p.order_id,
      order_no: p.order_no,
      piece_index: p.piece_index,
      total_qty: p.total_qty,
      width_mm: p.width_mm,
      height_mm: p.height_mm,
      customer_name: p.customer_name,
    }));

    if (placedPiecesToPack.length === 0) {
      Alert.alert('No Placed Pieces', 'There are no pieces currently placed on sheets to auto-pack.');
      return;
    }

    await runOptimizer(placedPiecesToPack, true);
  };

  // Auto-pack all unplaced / on-hold pieces onto a fresh sheet
  const handlePackUnplacedToNewSheet = async () => {
    if (unplacedPieces.length === 0) return;

    const newSheet = await handleAddBlankSheet(unplacedPieces);
    if (!newSheet) return;

    const newlyPlaced: PlacedPiece[] = [];
    const stillUnplaced: CuttingPiece[] = [];

    for (const piece of unplacedPieces) {
      const currentPlaced = [...newlyPlaced];
      const pos = findBestPlacementOnSheet(
        newSheet,
        piece.width_mm,
        piece.height_mm,
        currentPlaced,
        settings.kerf_mm,
      );

      const canPlaceNormal =
        pos.x_mm + piece.width_mm <= newSheet.width_mm &&
        pos.y_mm + piece.height_mm <= newSheet.height_mm;

      let canPlaceRotated = false;
      let rotatedPos = pos;
      if (!canPlaceNormal && !task.isLining) {
        rotatedPos = findBestPlacementOnSheet(
          newSheet,
          piece.height_mm,
          piece.width_mm,
          currentPlaced,
          settings.kerf_mm,
        );
        canPlaceRotated =
          rotatedPos.x_mm + piece.height_mm <= newSheet.width_mm &&
          rotatedPos.y_mm + piece.width_mm <= newSheet.height_mm;
      }

      if (canPlaceNormal) {
        newlyPlaced.push({
          ...piece,
          stock_item_id: newSheet.id,
          x_mm: pos.x_mm,
          y_mm: pos.y_mm,
          w_mm: piece.width_mm,
          h_mm: piece.height_mm,
          rotated: false,
          hasCollision: false,
        });
      } else if (canPlaceRotated) {
        newlyPlaced.push({
          ...piece,
          stock_item_id: newSheet.id,
          x_mm: rotatedPos.x_mm,
          y_mm: rotatedPos.y_mm,
          w_mm: piece.height_mm,
          h_mm: piece.width_mm,
          rotated: true,
          hasCollision: false,
        });
      } else {
        stillUnplaced.push(piece);
      }
    }

    if (newlyPlaced.length === 0) {
      Alert.alert('Cannot Fit', 'The unplaced piece(s) exceed sheet dimensions.');
      return;
    }

    setPlacements((prev) => [...prev, ...newlyPlaced]);
    setUnplacedPieces(stillUnplaced);
  };

  // Live wastage and leftover calculation for the active sheet
  const {
    liveWastePct,
    offcuts: liveOffcuts,
    wastedRects: liveWastedRects,
    kerfCuts: liveKerfCuts,
  } = useMemo(() => {
    if (!activeSheet) {
      return {
        liveWastePct: 0,
        offcuts: [] as ResultOffcut[],
        wastedRects: [] as WastedRect[],
        kerfCuts: [] as KerfCut[],
      };
    }

    return computeSheetLeftovers(
      activeSheet,
      activePlacements,
      settings.kerf_mm,
      settings.min_offcut_mm,
    );
  }, [activeSheet, activePlacements, settings]);

  const hasAnyCollisions = placements.some((p) => p.hasCollision);

  // Helper to print physical labels for only the confirmed pieces
  const handlePrintLabelsForPieces = async (piecesToCut: PlacedPiece[]) => {
    try {
      const orderGroups = new Map<string, PlacedPiece[]>();
      for (const p of piecesToCut) {
        const arr = orderGroups.get(p.order_id) ?? [];
        arr.push(p);
        orderGroups.set(p.order_id, arr);
      }

      for (const [orderId, groupPieces] of orderGroups.entries()) {
        const firstPiece = groupPieces[0];
        const itemCounts = new Map<string, number>();
        for (const p of groupPieces) {
          itemCounts.set(p.order_item_id, (itemCounts.get(p.order_item_id) || 0) + 1);
        }

        const matchingOrderItems = task.orderItems.filter((oi) =>
          itemCounts.has(oi.orderItemId),
        );

        const orderForLabels: OrderWithItemsForLabels = {
          id: orderId,
          order_no: firstPiece.order_no,
          store: task.store,
          customer: {
            name: firstPiece.customer_name,
            phone: task.customerPhone || '',
          },
          order_items: matchingOrderItems.map((oi) => ({
            id: oi.orderItemId,
            width_mm: oi.finishedWidthMm ?? oi.widthMm,
            height_mm: oi.finishedHeightMm ?? oi.heightMm,
            qty: itemCounts.get(oi.orderItemId) ?? oi.qty,
            is_polished: oi.isPolished,
            product: {
              name: task.productName,
              thickness_mm: task.thicknessMm,
              color: task.color,
            },
          })),
        };
        await printOrderLabels(orderForLabels);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Label Printing Failed', msg);
    }
  };

  // Execute confirmation for a specific set of pieces and sheets
  const executeConfirm = (
    piecesToCut: PlacedPiece[],
    sheetsToConsume: CuttingSheet[],
  ) => {
    if (piecesToCut.length === 0) {
      Alert.alert('No Pieces to Cut', 'There are no pieces placed on the selected sheet(s).');
      return;
    }

    if (piecesToCut.some((p) => p.hasCollision)) {
      Alert.alert(
        'Collisions Detected',
        'Cannot confirm: overlapping pieces detected on the sheet. Please adjust placements first.',
      );
      return;
    }

    const usedSheetIds = Array.from(new Set(piecesToCut.map((p) => p.stock_item_id)));
    const allOffcuts: ConfirmOffcutInput[] = [];

    for (const sId of usedSheetIds) {
      const s = sheetsToConsume.find((sh) => sh.id === sId);
      if (!s) continue;
      const piecesOnSheet = piecesToCut.filter((p) => p.stock_item_id === sId);
      if (piecesOnSheet.length === 0) continue;

      const leftovers = computeSheetLeftovers(
        s,
        piecesOnSheet,
        settings.kerf_mm,
        settings.min_offcut_mm,
      );

      for (const off of leftovers.offcuts) {
        allOffcuts.push({
          parent_id: s.id,
          width_mm: off.width_mm,
          height_mm: off.height_mm,
        });
      }
    }

    const orderIds = Array.from(new Set(piecesToCut.map((p) => p.order_id)));
    const isPartial = piecesToCut.length < currentPieces.length;

    const title = isPartial
      ? `Confirm Sheet Cut (${piecesToCut.length} pcs)`
      : `Confirm Cut Plan (${piecesToCut.length} pcs)`;

    const message =
      `Confirm cutting for ${piecesToCut.length} piece(s) across ${usedSheetIds.length} sheet(s)?\n\n` +
      `• Stock deducted: ${usedSheetIds.length} sheet(s)\n` +
      `• Offcuts created: ${allOffcuts.length}\n` +
      (isPartial
        ? `• Remaining uncut: ${currentPieces.length - piecesToCut.length} piece(s)\n\n`
        : '\n') +
      `This will update stock and order status in the database.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm & Deduct Stock',
        style: 'default',
        onPress: () => {
          confirmMutation.mutate(
            {
              orderIds,
              productId: task.productId,
              kerfMm: settings.kerf_mm,
              maxWastagePct: settings.max_wastage_pct,
              pieces: piecesToCut.map((p) => ({
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
                const confirmedIds = new Set(piecesToCut.map((p) => p.id));
                const remainingUncut = currentPieces.filter((p) => !confirmedIds.has(p.id));

                if (remainingUncut.length === 0) {
                  Alert.alert(
                    'Cut Plan Confirmed!',
                    `All ${piecesToCut.length} pieces confirmed. Stock deducted and offcuts added to inventory.\n\nPrint piece labels now?`,
                    [
                      {
                        text: 'Print Labels',
                        onPress: async () => {
                          await handlePrintLabelsForPieces(piecesToCut);
                          onBack();
                        },
                      },
                      { text: 'Done', style: 'cancel', onPress: onBack },
                    ],
                  );
                } else {
                  Alert.alert(
                    'Sheet Cut Confirmed!',
                    `${piecesToCut.length} piece(s) confirmed and stock deducted.\n\n` +
                      `${remainingUncut.length} piece(s) remain on hold to cut later.\n\n` +
                      `Visualise next sheet now or return to queue?`,
                    [
                      {
                        text: '📐 Visualise Next Sheet',
                        onPress: async () => {
                          setCurrentPieces(remainingUncut);
                          const updated = await refetchStock();
                          void runOptimizer(remainingUncut, false, updated.data);
                        },
                      },
                      {
                        text: 'Print Labels',
                        onPress: async () => {
                          await handlePrintLabelsForPieces(piecesToCut);
                          Alert.alert(
                            'Labels Printed',
                            `${remainingUncut.length} piece(s) remain on hold to cut later. Visualise next sheet now?`,
                            [
                              {
                                text: '📐 Visualise Next Sheet',
                                onPress: async () => {
                                  setCurrentPieces(remainingUncut);
                                  const updated = await refetchStock();
                                  void runOptimizer(remainingUncut, false, updated.data);
                                },
                              },
                              { text: 'Back to Queue (Hold for Later)', style: 'cancel', onPress: onBack },
                            ],
                          );
                        },
                      },
                      { text: 'Back to Queue (Hold for Later)', style: 'cancel', onPress: onBack },
                    ],
                  );
                }
              },
              onError: (err) => {
                void refetchStock();
                Alert.alert('Cannot Confirm Cut Plan', err.message);
              },
            },
          );
        },
      },
    ]);
  };

  // Wire confirm button to call partial or full confirm
  const handleConfirmPlan = () => {
    if (activePlacements.length === 0 && placements.length === 0) {
      Alert.alert('No Pieces Placed', 'Please place pieces on sheets before confirming.');
      return;
    }

    if (sheets.length > 1 || unplacedPieces.length > 0) {
      Alert.alert(
        'Confirm Cutting Plan',
        `Choose what to approve:\n\n` +
          `• Active Sheet (${activeSheetIndex + 1}): ${activePlacements.length} piece(s)\n` +
          `• All Placed Sheets: ${placements.length} piece(s)\n` +
          (unplacedPieces.length > 0
            ? `• Tray Unplaced: ${unplacedPieces.length} piece(s) (can cut later)\n`
            : ''),
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Approve Sheet ${activeSheetIndex + 1} (${activePlacements.length} pcs)`,
            onPress: () => executeConfirm(activePlacements, [activeSheet]),
          },
          {
            text: `Approve All Placed (${placements.length} pcs)`,
            onPress: () => executeConfirm(placements, sheets),
          },
        ],
      );
    } else {
      executeConfirm(placements, sheets);
    }
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
            <Text style={styles.orderNoText}>
              {task.orderNos && task.orderNos.length > 1
                ? `${task.orderNos.length} Orders (${task.orderNos.map((n) => `#${n}`).join(', ')})`
                : `Order #${task.orderNo}`}
            </Text>
            <Text style={styles.customerText} numberOfLines={1}>
              · {task.orderNos && task.orderNos.length > 1 ? 'Combined Cut Layout' : task.customerName}
            </Text>
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

      {/* Real-Time Live Order Updates Banner */}
      {incomingNewPieces.length > 0 && (
        <View style={styles.incomingBanner}>
          <View style={styles.incomingTextWrap}>
            <MaterialCommunityIcons name="bell-ring" size={20} color="#1E40AF" />
            <View style={styles.incomingTitleCol}>
              <Text style={styles.incomingTitle}>
                New orders arrived (+{incomingNewPieces.length} pieces)
              </Text>
              <Text style={styles.incomingSubtitle}>
                Order #{incomingNewPieces[0].order_no} · {incomingNewPieces[0].customer_name}
              </Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.repackBtn,
              pressed && styles.repackBtnPressed,
            ]}
            onPress={() => {
              const merged = [...currentPieces, ...incomingNewPieces];
              setCurrentPieces(merged);
              void runOptimizer(merged);
            }}
          >
            <MaterialCommunityIcons name="lightning-bolt" size={15} color="#FFFFFF" />
            <Text style={styles.repackBtnText}>Re-Pack Live</Text>
          </Pressable>
        </View>
      )}

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Placed</Text>
          <Text style={styles.statValue}>
            {placements.length} / {currentPieces.length}
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
        onAddBlankSheet={() => void handleAddBlankSheet()}
      />

      {/* Remaining Offcut Dimensions Summary Banner */}
      {liveOffcuts.length > 0 && (
        <View style={styles.offcutBanner}>
          <View style={styles.offcutBannerLeft}>
            <MaterialCommunityIcons name="shape-outline" size={16} color="#047857" />
            <Text style={styles.offcutBannerTitle}>Remaining Offcut:</Text>
          </View>
          <View style={styles.offcutPillsWrap}>
            {liveOffcuts.map((o, idx) => (
              <View key={o.id || idx} style={styles.offcutBannerPill}>
                <Text style={styles.offcutBannerPillText}>
                  {o.width_mm} × {o.height_mm} mm
                </Text>
                <Text style={styles.offcutBannerPillSub}>
                  ({formatInches(o.width_mm)} × {formatInches(o.height_mm)})
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

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
          selectedPieceId={selectedPieceId}
          onSelectPiece={setSelectedPieceId}
          onUpdatePosition={handleUpdatePosition}
          onRotatePiece={handleRotatePiece}
          onMoveToSheet={handleMoveToSheet}
          onMoveToNextSheet={handleMovePieceToNextSheet}
          onRemoveToTray={handleRemoveToTray}
        />
      ) : (
        <View style={styles.loadingArea}>
          <MaterialCommunityIcons name="package-variant-closed" size={44} color="#64748B" />
          <Text style={styles.emptyTitle}>No Stock Available</Text>
          <Text style={styles.emptyText}>
            0 sheets found in inventory for this glass type. Add sheets in Inventory to begin cutting.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.emptyAddBtnPressed]}
            onPress={() => router.push('/(tabs)/inventory')}
          >
            <Text style={styles.emptyAddBtnText}>+ Go to Inventory</Text>
          </Pressable>
        </View>
      )}

      {/* Docked Action Toolbar for Selected Piece */}
      {selectedPiece && (
        <View style={styles.selectedPieceToolbar}>
          <View style={styles.selectedPieceHeader}>
            <View style={styles.selectedPieceBadge}>
              <Text style={styles.selectedPieceTitle}>
                Order #{selectedPiece.order_no} ({selectedPiece.piece_index}/
                {selectedPiece.total_qty})
              </Text>
              <Text style={styles.selectedPieceSubtitle}>
                {selectedPiece.w_mm} × {selectedPiece.h_mm} mm
              </Text>
            </View>

            <Pressable
              style={styles.closeToolbarBtn}
              onPress={() => setSelectedPieceId(null)}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="close" size={18} color="#94A3B8" />
            </Pressable>
          </View>

          <View style={styles.selectedPieceActions}>
            {/* Rotate button — STRICTLY HIDDEN IF LINING */}
            {!task.isLining && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => handleRotatePiece(selectedPiece.id)}
              >
                <MaterialCommunityIcons name="rotate-right" size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Rotate</Text>
              </Pressable>
            )}

            {/* Move/stash to next sheet directly */}
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.nextSheetBtn,
                pressed && styles.actionBtnPressed,
              ]}
              onPress={() => {
                void handleMovePieceToNextSheet(selectedPiece.id);
                setSelectedPieceId(null);
              }}
            >
              <MaterialCommunityIcons
                name="arrow-right-bold-circle-outline"
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.actionBtnText}>Next Sheet</Text>
            </Pressable>

            {/* Move to specific sheet modal */}
            {sheets.length > 1 && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => setMoveModalVisible(true)}
              >
                <MaterialCommunityIcons
                  name="file-move-outline"
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.actionBtnText}>Move...</Text>
              </Pressable>
            )}

            {/* Remove to tray */}
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.removeBtn,
                pressed && styles.actionBtnPressed,
              ]}
              onPress={() => {
                handleRemoveToTray(selectedPiece.id);
                setSelectedPieceId(null);
              }}
            >
              <MaterialCommunityIcons
                name="tray-arrow-down"
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.actionBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Move Sheet Modal */}
      <Modal
        visible={moveModalVisible && !!selectedPiece}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveModalVisible(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMoveModalVisible(false)}
        >
          <View style={styles.sheetPickerModal}>
            <Text style={styles.sheetPickerTitle}>Move Piece to Sheet</Text>
            {selectedPiece && (
              <Text style={styles.sheetPickerSubtitle}>
                Select destination sheet for #{selectedPiece.order_no} (
                {selectedPiece.w_mm}×{selectedPiece.h_mm} mm):
              </Text>
            )}

            {sheets
              .filter((s) => s.id !== activeSheet?.id)
              .map((targetSheet, idx) => (
                <Pressable
                  key={targetSheet.id}
                  style={styles.sheetChoiceBtn}
                  onPress={() => {
                    setMoveModalVisible(false);
                    if (selectedPiece) {
                      handleMoveToSheet(selectedPiece.id, targetSheet.id);
                      setSelectedPieceId(null);
                    }
                  }}
                >
                  <MaterialCommunityIcons
                    name={targetSheet.source === 'offcut' ? 'shape' : 'crop-square'}
                    size={20}
                    color="#1A73E8"
                  />
                  <View style={styles.sheetChoiceInfo}>
                    <Text style={styles.sheetChoiceTitle}>Sheet {idx + 1}</Text>
                    <Text style={styles.sheetChoiceMeta}>
                      {targetSheet.source === 'offcut' ? 'Offcut' : 'Full'} ·{' '}
                      {targetSheet.width_mm}×{targetSheet.height_mm} mm
                    </Text>
                  </View>
                </Pressable>
              ))}

            <Pressable
              style={styles.cancelBtn}
              onPress={() => setMoveModalVisible(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Bottom Tray with Unplaced Pieces */}
      <UnplacedTray
        pieces={unplacedPieces}
        onPlacePieceOnCurrentSheet={handlePlaceFromTray}
        onPlacePieceOnNextSheet={handlePlacePieceOnNextSheet}
        onPackAllToNewSheet={handlePackUnplacedToNewSheet}
      />

      {/* Action Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          style={styles.reoptimizeBtn}
          onPress={() => void handleAutoPack()}
        >
          <MaterialCommunityIcons name="refresh" size={18} color="#1E293B" />
          <Text style={styles.reoptimizeText}>Auto-Pack</Text>
        </Pressable>

        {/* Confirm Cut Plan — Allows partial or full confirmation */}
        <Pressable
          style={[
            styles.confirmBtn,
            (confirmMutation.isPending || activePlacements.length === 0) &&
              styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirmPlan}
          disabled={confirmMutation.isPending || activePlacements.length === 0}
        >
          {confirmMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-all" size={20} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>
                {sheets.length > 1 || unplacedPieces.length > 0
                  ? 'Confirm Sheet Cut'
                  : 'Confirm Cut Plan'}
              </Text>
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
  offcutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
  },
  offcutBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offcutBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  offcutPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  offcutBannerPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offcutBannerPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  offcutBannerPillSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#047857',
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
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyAddBtn: {
    backgroundColor: '#1A73E8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyAddBtnPressed: {
    backgroundColor: '#1557B0',
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
  incomingBanner: {
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incomingTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  incomingTitleCol: {
    flex: 1,
  },
  incomingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  incomingSubtitle: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 1,
  },
  repackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  repackBtnPressed: {
    backgroundColor: '#1D4ED8',
  },
  repackBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedPieceToolbar: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  selectedPieceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedPieceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedPieceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60A5FA',
  },
  selectedPieceSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  closeToolbarBtn: {
    padding: 4,
  },
  selectedPieceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  actionBtnPressed: {
    opacity: 0.75,
  },
  nextSheetBtn: {
    backgroundColor: '#2563EB',
  },
  removeBtn: {
    backgroundColor: '#DC2626',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetPickerModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  sheetPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sheetPickerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
  },
  sheetChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  sheetChoiceInfo: {
    flex: 1,
  },
  sheetChoiceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetChoiceMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
