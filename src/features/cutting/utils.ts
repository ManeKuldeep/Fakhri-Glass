import { isUsableOffcut } from '../../optimizer/validation';

/**
 * Pure helper utilities for cutting feature.
 * Zero external framework dependencies.
 */

export function friendlyConfirmCutError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already confirmed')) {
    return 'This cut plan has already been confirmed for this order and product. The screen will refresh.';
  }
  if (lower.includes('no longer available')) {
    return 'One or more stock sheets are no longer available (they may have been consumed or removed by another user). Please refresh your available stock and re-run the layout.';
  }
  if (lower.includes('does not match ordered quantity')) {
    return 'Piece count does not match the ordered quantity. Please ensure all ordered pieces are placed.';
  }
  if (lower.includes('exceeded ordered quantity')) {
    return 'Total cut pieces would exceed the ordered quantity for one or more items.';
  }
  if (lower.includes('do not belong to this order')) {
    return 'One or more pieces do not belong to this order and product.';
  }
  if (lower.includes('offcut parent sheet is not one of the consumed sheets')) {
    return 'Validation failed: Offcut parent sheet was not one of the consumed sheets.';
  }
  return message;
}

export interface ComputedSheetLeftovers {
  offcuts: Array<{
    id: string;
    parent_id: string;
    x_mm: number;
    y_mm: number;
    width_mm: number;
    height_mm: number;
  }>;
  wastedRects: Array<{
    x_mm: number;
    y_mm: number;
    width_mm: number;
    height_mm: number;
  }>;
  kerfCuts: Array<{
    x_mm: number;
    y_mm: number;
    width_mm: number;
    height_mm: number;
    orientation: 'horizontal' | 'vertical';
  }>;
  liveWastePct: number;
}

export function computeSheetLeftovers(
  sheet: { id: string; width_mm: number; height_mm: number; is_lining?: boolean },
  piecesOnSheet: Array<{ x_mm: number; y_mm: number; w_mm: number; h_mm: number }>,
  kerf_mm: number,
  min_offcut_mm: number,
): ComputedSheetLeftovers {
  const totalSheetArea = sheet.width_mm * sheet.height_mm;
  const pieceArea = piecesOnSheet.reduce((sum, p) => sum + p.w_mm * p.h_mm, 0);

  const offcuts: ComputedSheetLeftovers['offcuts'] = [];
  const wastedRects: ComputedSheetLeftovers['wastedRects'] = [];
  const kerfCuts: ComputedSheetLeftovers['kerfCuts'] = [];

  if (piecesOnSheet.length > 0 && totalSheetArea > 0) {
    const maxX = Math.max(...piecesOnSheet.map((p) => p.x_mm + p.w_mm));
    const maxY = Math.max(...piecesOnSheet.map((p) => p.y_mm + p.h_mm));

    const rightW = sheet.width_mm - maxX - kerf_mm;
    const topH = sheet.height_mm - maxY - kerf_mm;

    // Horizontal-first cut:
    // Top rect: sheet.width_mm x topH; Right rect: rightW x maxY
    const hTopUsable = topH > 0 && isUsableOffcut(sheet.width_mm, topH, min_offcut_mm);
    const hRightUsable =
      rightW > 0 && maxY > 0 && isUsableOffcut(rightW, maxY, min_offcut_mm);
    const hLargest = Math.max(
      hTopUsable ? sheet.width_mm * topH : 0,
      hRightUsable ? rightW * maxY : 0,
    );
    const hTotal =
      (hTopUsable ? sheet.width_mm * topH : 0) + (hRightUsable ? rightW * maxY : 0);

    // Vertical-first cut:
    // Right rect: rightW x sheet.height_mm; Top rect: maxX x topH
    const vRightUsable =
      rightW > 0 && isUsableOffcut(rightW, sheet.height_mm, min_offcut_mm);
    const vTopUsable = topH > 0 && maxX > 0 && isUsableOffcut(maxX, topH, min_offcut_mm);
    const vLargest = Math.max(
      vRightUsable ? rightW * sheet.height_mm : 0,
      vTopUsable ? maxX * topH : 0,
    );
    const vTotal =
      (vRightUsable ? rightW * sheet.height_mm : 0) + (vTopUsable ? maxX * topH : 0);

    const useVerticalCut =
      sheet.is_lining === true || vLargest > hLargest || (vLargest === hLargest && vTotal > hTotal);

    if (useVerticalCut) {
      // 1. Vertical cut across full height at maxX
      if (rightW > 0) {
        kerfCuts.push({
          x_mm: maxX,
          y_mm: 0,
          width_mm: kerf_mm,
          height_mm: sheet.height_mm,
          orientation: 'vertical',
        });
        if (vRightUsable) {
          offcuts.push({
            id: `${sheet.id}-right-offcut`,
            parent_id: sheet.id,
            x_mm: maxX + kerf_mm,
            y_mm: 0,
            width_mm: rightW,
            height_mm: sheet.height_mm,
          });
        } else {
          wastedRects.push({
            x_mm: maxX + kerf_mm,
            y_mm: 0,
            width_mm: rightW,
            height_mm: sheet.height_mm,
          });
        }
      }

      // 2. Horizontal cut across width maxX at maxY
      if (topH > 0 && maxX > 0) {
        kerfCuts.push({
          x_mm: 0,
          y_mm: maxY,
          width_mm: maxX,
          height_mm: kerf_mm,
          orientation: 'horizontal',
        });
        if (vTopUsable) {
          offcuts.push({
            id: `${sheet.id}-top-offcut`,
            parent_id: sheet.id,
            x_mm: 0,
            y_mm: maxY + kerf_mm,
            width_mm: maxX,
            height_mm: topH,
          });
        } else {
          wastedRects.push({
            x_mm: 0,
            y_mm: maxY + kerf_mm,
            width_mm: maxX,
            height_mm: topH,
          });
        }
      }
    } else {
      // 1. Horizontal cut across full width at maxY
      if (topH > 0) {
        kerfCuts.push({
          x_mm: 0,
          y_mm: maxY,
          width_mm: sheet.width_mm,
          height_mm: kerf_mm,
          orientation: 'horizontal',
        });
        if (hTopUsable) {
          offcuts.push({
            id: `${sheet.id}-top-offcut`,
            parent_id: sheet.id,
            x_mm: 0,
            y_mm: maxY + kerf_mm,
            width_mm: sheet.width_mm,
            height_mm: topH,
          });
        } else {
          wastedRects.push({
            x_mm: 0,
            y_mm: maxY + kerf_mm,
            width_mm: sheet.width_mm,
            height_mm: topH,
          });
        }
      }

      // 2. Vertical cut across height maxY at maxX
      if (rightW > 0 && maxY > 0) {
        kerfCuts.push({
          x_mm: maxX,
          y_mm: 0,
          width_mm: kerf_mm,
          height_mm: maxY,
          orientation: 'vertical',
        });
        if (hRightUsable) {
          offcuts.push({
            id: `${sheet.id}-right-offcut`,
            parent_id: sheet.id,
            x_mm: maxX + kerf_mm,
            y_mm: 0,
            width_mm: rightW,
            height_mm: maxY,
          });
        } else {
          wastedRects.push({
            x_mm: maxX + kerf_mm,
            y_mm: 0,
            width_mm: rightW,
            height_mm: maxY,
          });
        }
      }
    }
  }

  const pureWasteArea =
    totalSheetArea -
    pieceArea -
    offcuts.reduce((sum, o) => sum + o.width_mm * o.height_mm, 0);

  const liveWastePct =
    totalSheetArea > 0
      ? Number(((Math.max(0, pureWasteArea) / totalSheetArea) * 100).toFixed(1))
      : 0;

  return {
    offcuts,
    wastedRects,
    kerfCuts,
    liveWastePct,
  };
}

/**
 * Finds the first collision-free anchor point (x_mm, y_mm) on a target sheet for a piece.
 * Evaluates candidate points aligned with existing pieces and edges with kerf spacing.
 */
export function findBestPlacementOnSheet(
  sheet: { width_mm: number; height_mm: number },
  pieceW: number,
  pieceH: number,
  existingPieces: Array<{ x_mm: number; y_mm: number; w_mm: number; h_mm: number }>,
  kerf_mm: number,
): { x_mm: number; y_mm: number } {
  if (existingPieces.length === 0) {
    return { x_mm: 0, y_mm: 0 };
  }

  // Generate candidate anchor points (top-left corners)
  const candidatePoints: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];

  for (const p of existingPieces) {
    candidatePoints.push({ x: p.x_mm + p.w_mm + kerf_mm, y: p.y_mm });
    candidatePoints.push({ x: p.x_mm, y: p.y_mm + p.h_mm + kerf_mm });
    candidatePoints.push({ x: 0, y: p.y_mm + p.h_mm + kerf_mm });
    candidatePoints.push({ x: p.x_mm + p.w_mm + kerf_mm, y: 0 });
  }

  // Sort candidate points: primary Y ascending, secondary X ascending
  candidatePoints.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  for (const pt of candidatePoints) {
    if (pt.x + pieceW <= sheet.width_mm && pt.y + pieceH <= sheet.height_mm) {
      // Check collision against all existing pieces
      const hasOverlap = existingPieces.some((other) => {
        return (
          pt.x < other.x_mm + other.w_mm + kerf_mm &&
          pt.x + pieceW + kerf_mm > other.x_mm &&
          pt.y < other.y_mm + other.h_mm + kerf_mm &&
          pt.y + pieceH + kerf_mm > other.y_mm
        );
      });
      if (!hasOverlap) {
        return { x_mm: pt.x, y_mm: pt.y };
      }
    }
  }

  // If no collision-free point fits within boundaries, fallback to (0, 0)
  return { x_mm: 0, y_mm: 0 };
}

/**
 * Checks whether a piece can physically fit on a sheet.
 * If isLining is true, the piece cannot be rotated.
 */
export function canFitPieceOnSheet(
  sheet: { width_mm: number; height_mm: number },
  piece: { width_mm: number; height_mm: number },
  isLining?: boolean,
): boolean {
  if (isLining) {
    return piece.width_mm <= sheet.width_mm && piece.height_mm <= sheet.height_mm;
  }
  return (
    (piece.width_mm <= sheet.width_mm && piece.height_mm <= sheet.height_mm) ||
    (piece.height_mm <= sheet.width_mm && piece.width_mm <= sheet.height_mm)
  );
}
