import { isUsableOffcut } from '../../optimizer/validation';
import { friendlyDatabaseError } from '../../lib/friendlyDatabaseError';

/**
 * Pure helper utilities for cutting feature.
 * Zero external framework dependencies.
 */

export function friendlyConfirmCutError(message: string): string {
  return friendlyDatabaseError(message);
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

  if (piecesOnSheet.length === 0 || totalSheetArea <= 0) {
    if (totalSheetArea <= 0) {
      return { offcuts: [], wastedRects: [], kerfCuts: [], liveWastePct: 0 };
    }
    const usable = isUsableOffcut(sheet.width_mm, sheet.height_mm, min_offcut_mm);
    return {
      offcuts: usable
        ? [
            {
              id: `${sheet.id}-full-offcut`,
              parent_id: sheet.id,
              x_mm: 0,
              y_mm: 0,
              width_mm: sheet.width_mm,
              height_mm: sheet.height_mm,
            },
          ]
        : [],
      wastedRects: usable
        ? []
        : [
            {
              x_mm: 0,
              y_mm: 0,
              width_mm: sheet.width_mm,
              height_mm: sheet.height_mm,
            },
          ],
      kerfCuts: [],
      liveWastePct: usable ? 0 : 100,
    };
  }

  interface CandidatePartition {
    offcuts: ComputedSheetLeftovers['offcuts'];
    wastedRects: ComputedSheetLeftovers['wastedRects'];
    kerfCuts: ComputedSheetLeftovers['kerfCuts'];
    usableArea: number;
    largestOffcut: number;
    wasteArea: number;
  }

  const evaluateRectangles = (
    rects: Array<{ x_mm: number; y_mm: number; width_mm: number; height_mm: number }>,
    cuts: ComputedSheetLeftovers['kerfCuts'],
  ): CandidatePartition => {
    const offcuts: ComputedSheetLeftovers['offcuts'] = [];
    const wastedRects: ComputedSheetLeftovers['wastedRects'] = [];
    let usableArea = 0;
    let largestOffcut = 0;
    let wasteArea = 0;
    let counter = 1;

    for (const r of rects) {
      if (r.width_mm <= 0 || r.height_mm <= 0) continue;
      // An offcut must not be a razor-thin blade trim/sliver (< 40mm) and must meet min_offcut_mm
      const isSliver = Math.min(r.width_mm, r.height_mm) < 40;
      const usable = !isSliver && isUsableOffcut(r.width_mm, r.height_mm, min_offcut_mm);

      if (usable) {
        const area = r.width_mm * r.height_mm;
        usableArea += area;
        if (area > largestOffcut) largestOffcut = area;
        offcuts.push({
          id: `${sheet.id}-offcut-${counter++}`,
          parent_id: sheet.id,
          x_mm: r.x_mm,
          y_mm: r.y_mm,
          width_mm: r.width_mm,
          height_mm: r.height_mm,
        });
      } else {
        wasteArea += r.width_mm * r.height_mm;
        wastedRects.push({
          x_mm: r.x_mm,
          y_mm: r.y_mm,
          width_mm: r.width_mm,
          height_mm: r.height_mm,
        });
      }
    }

    return {
      offcuts,
      wastedRects,
      kerfCuts: cuts,
      usableArea,
      largestOffcut,
      wasteArea,
    };
  };

  // 1. Shelf (Row-based) Partition
  const buildRowPartition = (): CandidatePartition => {
    const rects: Array<{ x_mm: number; y_mm: number; width_mm: number; height_mm: number }> = [];
    const cuts: ComputedSheetLeftovers['kerfCuts'] = [];

    const sorted = [...piecesOnSheet].sort((a, b) =>
      a.y_mm !== b.y_mm ? a.y_mm - b.y_mm : a.x_mm - b.x_mm,
    );

    interface RowGroup {
      minY: number;
      maxY: number;
      pieces: typeof piecesOnSheet;
    }
    const rows: RowGroup[] = [];

    for (const p of sorted) {
      const existing = rows.find((r) => p.y_mm < r.maxY && p.y_mm + p.h_mm > r.minY);
      if (existing) {
        existing.minY = Math.min(existing.minY, p.y_mm);
        existing.maxY = Math.max(existing.maxY, p.y_mm + p.h_mm);
        existing.pieces.push(p);
      } else {
        rows.push({
          minY: p.y_mm,
          maxY: p.y_mm + p.h_mm,
          pieces: [p],
        });
      }
    }

    rows.sort((a, b) => a.minY - b.minY);

    for (const r of rows) {
      const rH = r.maxY - r.minY;
      const minX = Math.min(...r.pieces.map((p) => p.x_mm));
      const maxX = Math.max(...r.pieces.map((p) => p.x_mm + p.w_mm));

      // Void to the left of pieces on this row
      if (minX > kerf_mm) {
        rects.push({
          x_mm: 0,
          y_mm: r.minY,
          width_mm: minX - kerf_mm,
          height_mm: rH,
        });
        cuts.push({
          x_mm: minX - kerf_mm,
          y_mm: r.minY,
          width_mm: kerf_mm,
          height_mm: rH,
          orientation: 'vertical',
        });
      }

      // Space to the right of pieces on this row
      const rightW = sheet.width_mm - maxX - kerf_mm;
      if (rightW > 0) {
        rects.push({
          x_mm: maxX + kerf_mm,
          y_mm: r.minY,
          width_mm: rightW,
          height_mm: rH,
        });
        cuts.push({
          x_mm: maxX,
          y_mm: r.minY,
          width_mm: kerf_mm,
          height_mm: rH,
          orientation: 'vertical',
        });
      }

      // Cut between this row and top/next
      cuts.push({
        x_mm: 0,
        y_mm: r.maxY,
        width_mm: sheet.width_mm,
        height_mm: kerf_mm,
        orientation: 'horizontal',
      });
    }

    const totalMaxY = Math.max(...rows.map((r) => r.maxY));
    const topH = sheet.height_mm - totalMaxY - kerf_mm;
    if (topH > 0) {
      rects.push({
        x_mm: 0,
        y_mm: totalMaxY + kerf_mm,
        width_mm: sheet.width_mm,
        height_mm: topH,
      });
    }

    return evaluateRectangles(rects, cuts);
  };

  // 2. Strip (Column-based) Partition
  const buildColPartition = (): CandidatePartition => {
    const rects: Array<{ x_mm: number; y_mm: number; width_mm: number; height_mm: number }> = [];
    const cuts: ComputedSheetLeftovers['kerfCuts'] = [];

    const sorted = [...piecesOnSheet].sort((a, b) =>
      a.x_mm !== b.x_mm ? a.x_mm - b.x_mm : a.y_mm - b.y_mm,
    );

    interface ColGroup {
      minX: number;
      maxX: number;
      pieces: typeof piecesOnSheet;
    }
    const cols: ColGroup[] = [];

    for (const p of sorted) {
      const existing = cols.find((c) => p.x_mm < c.maxX && p.x_mm + p.w_mm > c.minX);
      if (existing) {
        existing.minX = Math.min(existing.minX, p.x_mm);
        existing.maxX = Math.max(existing.maxX, p.x_mm + p.w_mm);
        existing.pieces.push(p);
      } else {
        cols.push({
          minX: p.x_mm,
          maxX: p.x_mm + p.w_mm,
          pieces: [p],
        });
      }
    }

    cols.sort((a, b) => a.minX - b.minX);

    for (const c of cols) {
      const cW = c.maxX - c.minX;
      const maxY = Math.max(...c.pieces.map((p) => p.y_mm + p.h_mm));
      const topH = sheet.height_mm - maxY - kerf_mm;

      if (topH > 0) {
        rects.push({
          x_mm: c.minX,
          y_mm: maxY + kerf_mm,
          width_mm: cW,
          height_mm: topH,
        });
        cuts.push({
          x_mm: c.minX,
          y_mm: maxY,
          width_mm: cW,
          height_mm: kerf_mm,
          orientation: 'horizontal',
        });
      }

      cuts.push({
        x_mm: c.maxX,
        y_mm: 0,
        width_mm: kerf_mm,
        height_mm: sheet.height_mm,
        orientation: 'vertical',
      });
    }

    const totalMaxX = Math.max(...cols.map((c) => c.maxX));
    const rightW = sheet.width_mm - totalMaxX - kerf_mm;
    if (rightW > 0) {
      rects.push({
        x_mm: totalMaxX + kerf_mm,
        y_mm: 0,
        width_mm: rightW,
        height_mm: sheet.height_mm,
      });
    }

    return evaluateRectangles(rects, cuts);
  };

  // 3. Classic Bounding Box Partition
  const buildBBoxPartition = (verticalFirst: boolean): CandidatePartition => {
    const rects: Array<{ x_mm: number; y_mm: number; width_mm: number; height_mm: number }> = [];
    const cuts: ComputedSheetLeftovers['kerfCuts'] = [];

    const maxX = Math.max(...piecesOnSheet.map((p) => p.x_mm + p.w_mm));
    const maxY = Math.max(...piecesOnSheet.map((p) => p.y_mm + p.h_mm));
    const rightW = sheet.width_mm - maxX - kerf_mm;
    const topH = sheet.height_mm - maxY - kerf_mm;

    if (verticalFirst) {
      if (rightW > 0) {
        rects.push({
          x_mm: maxX + kerf_mm,
          y_mm: 0,
          width_mm: rightW,
          height_mm: sheet.height_mm,
        });
        cuts.push({
          x_mm: maxX,
          y_mm: 0,
          width_mm: kerf_mm,
          height_mm: sheet.height_mm,
          orientation: 'vertical',
        });
      }
      if (topH > 0 && maxX > 0) {
        rects.push({
          x_mm: 0,
          y_mm: maxY + kerf_mm,
          width_mm: maxX,
          height_mm: topH,
        });
        cuts.push({
          x_mm: 0,
          y_mm: maxY,
          width_mm: maxX,
          height_mm: kerf_mm,
          orientation: 'horizontal',
        });
      }
    } else {
      if (topH > 0) {
        rects.push({
          x_mm: 0,
          y_mm: maxY + kerf_mm,
          width_mm: sheet.width_mm,
          height_mm: topH,
        });
        cuts.push({
          x_mm: 0,
          y_mm: maxY,
          width_mm: sheet.width_mm,
          height_mm: kerf_mm,
          orientation: 'horizontal',
        });
      }
      if (rightW > 0 && maxY > 0) {
        rects.push({
          x_mm: maxX + kerf_mm,
          y_mm: 0,
          width_mm: rightW,
          height_mm: maxY,
        });
        cuts.push({
          x_mm: maxX,
          y_mm: 0,
          width_mm: kerf_mm,
          height_mm: maxY,
          orientation: 'vertical',
        });
      }
    }

    return evaluateRectangles(rects, cuts);
  };

  const candidates: CandidatePartition[] = [];
  if (sheet.is_lining) {
    candidates.push(buildColPartition());
    candidates.push(buildBBoxPartition(true));
  } else {
    candidates.push(buildRowPartition());
    candidates.push(buildColPartition());
    candidates.push(buildBBoxPartition(false));
    candidates.push(buildBBoxPartition(true));
  }

  candidates.sort((a, b) => {
    if (a.usableArea !== b.usableArea) return b.usableArea - a.usableArea;
    if (a.largestOffcut !== b.largestOffcut) return b.largestOffcut - a.largestOffcut;
    return a.wasteArea - b.wasteArea;
  });

  const best = candidates[0];

  const pureWasteArea =
    totalSheetArea -
    pieceArea -
    best.offcuts.reduce((sum, o) => sum + o.width_mm * o.height_mm, 0);

  const liveWastePct =
    totalSheetArea > 0
      ? Number(((Math.max(0, pureWasteArea) / totalSheetArea) * 100).toFixed(1))
      : 0;

  return {
    offcuts: best.offcuts,
    wastedRects: best.wastedRects,
    kerfCuts: best.kerfCuts,
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
