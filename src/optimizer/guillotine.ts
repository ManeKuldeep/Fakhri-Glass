import {
  KerfCut,
  OptimizerPiece,
  OptimizerSheet,
  PiecePlacement,
  ResultOffcut,
  SheetCutPlan,
  WastedRect,
} from './types';
import { isUsableOffcut } from './validation';

export interface FreeRect {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
}

export interface SplitResult {
  placed: {
    w_mm: number;
    h_mm: number;
    rotated: boolean;
  };
  kerfCuts: KerfCut[];
  newFreeRects: FreeRect[];
  wastedRects: WastedRect[];
}

export type GuillotineSplitMode = 'horizontal' | 'vertical' | 'max_offcut';
export type FitRule = 'shelf' | 'strip' | 'best_area' | 'best_short_side' | 'best_long_side';

export interface PackSheetOptions {
  splitMode?: GuillotineSplitMode;
  fitRule?: FitRule;
}

/**
 * Split a free rectangle when a piece is placed at (rect.x_mm, rect.y_mm).
 * Adheres strictly to edge-to-edge guillotine cutting and tracks kerf cuts.
 */
export function splitGuillotine(
  rect: FreeRect,
  pw: number,
  ph: number,
  rotated: boolean,
  kerf_mm: number,
  isLining: boolean,
  splitMode: GuillotineSplitMode = 'horizontal',
  min_offcut_mm = 500,
): SplitResult {
  const kerfCuts: KerfCut[] = [];
  const newFreeRects: FreeRect[] = [];
  const wastedRects: WastedRect[] = [];

  const { x_mm: x, y_mm: y, width_mm: W, height_mm: H } = rect;

  // Exact fit in both dimensions -> no cuts, no kerf
  if (pw === W && ph === H) {
    return {
      placed: { w_mm: pw, h_mm: ph, rotated },
      kerfCuts,
      newFreeRects,
      wastedRects,
    };
  }

  // Exact width fit, partial height
  if (pw === W && ph < H) {
    const leftoverH = H - ph;
    if (leftoverH <= kerf_mm) {
      // Leftover height is smaller than or equal to kerf -> pure waste sliver, no cut possible
      wastedRects.push({ x_mm: x, y_mm: y + ph, width_mm: W, height_mm: leftoverH });
    } else {
      kerfCuts.push({
        x_mm: x,
        y_mm: y + ph,
        width_mm: W,
        height_mm: kerf_mm,
        orientation: 'horizontal',
      });
      newFreeRects.push({
        x_mm: x,
        y_mm: y + ph + kerf_mm,
        width_mm: W,
        height_mm: leftoverH - kerf_mm,
      });
    }
    return {
      placed: { w_mm: pw, h_mm: ph, rotated },
      kerfCuts,
      newFreeRects,
      wastedRects,
    };
  }

  // Exact height fit, partial width
  if (ph === H && pw < W) {
    const leftoverW = W - pw;
    if (leftoverW <= kerf_mm) {
      wastedRects.push({ x_mm: x + pw, y_mm: y, width_mm: leftoverW, height_mm: H });
    } else {
      kerfCuts.push({
        x_mm: x + pw,
        y_mm: y,
        width_mm: kerf_mm,
        height_mm: H,
        orientation: 'vertical',
      });
      newFreeRects.push({
        x_mm: x + pw + kerf_mm,
        y_mm: y,
        width_mm: leftoverW - kerf_mm,
        height_mm: H,
      });
    }
    return {
      placed: { w_mm: pw, h_mm: ph, rotated },
      kerfCuts,
      newFreeRects,
      wastedRects,
    };
  }

  // Both width and height are strictly smaller than free rectangle:
  // Decide whether to split vertically first or horizontally first.
  // Rule: For lining glass, ALWAYS split vertically first (parallel to flutes).
  let splitVerticalFirst = isLining;

  if (!isLining) {
    if (splitMode === 'vertical') {
      splitVerticalFirst = true;
    } else if (splitMode === 'horizontal') {
      splitVerticalFirst = false;
    } else if (splitMode === 'max_offcut') {
      // Choose the cut orientation that yields the larger usable offcut rectangle (>= min_offcut_mm)
      const leftoverW = W - pw - kerf_mm;
      const leftoverH = H - ph - kerf_mm;

      // Horizontal-first cut:
      // Top rect: W x leftoverH; Right rect: leftoverW x ph
      const usableTopH = leftoverH > 0 && isUsableOffcut(W, leftoverH, min_offcut_mm);
      const usableRightH = leftoverW > 0 && isUsableOffcut(leftoverW, ph, min_offcut_mm);
      const maxSingleH = Math.max(
        usableTopH ? W * leftoverH : 0,
        usableRightH ? leftoverW * ph : 0,
      );
      const totalAreaH = (usableTopH ? W * leftoverH : 0) + (usableRightH ? leftoverW * ph : 0);

      // Vertical-first cut:
      // Right rect: leftoverW x H; Top rect: pw x leftoverH
      const usableRightV = leftoverW > 0 && isUsableOffcut(leftoverW, H, min_offcut_mm);
      const usableTopV = leftoverH > 0 && isUsableOffcut(pw, leftoverH, min_offcut_mm);
      const maxSingleV = Math.max(
        usableRightV ? leftoverW * H : 0,
        usableTopV ? pw * leftoverH : 0,
      );
      const totalAreaV = (usableRightV ? leftoverW * H : 0) + (usableTopV ? pw * leftoverH : 0);

      if (maxSingleV > maxSingleH) {
        splitVerticalFirst = true;
      } else if (maxSingleH > maxSingleV) {
        splitVerticalFirst = false;
      } else if (totalAreaV > totalAreaH) {
        splitVerticalFirst = true;
      } else {
        splitVerticalFirst = false;
      }
    }
  }

  if (splitVerticalFirst) {
    // 1. Primary vertical cut across full height H at x + pw
    const leftoverW = W - pw;
    if (leftoverW <= kerf_mm) {
      wastedRects.push({ x_mm: x + pw, y_mm: y, width_mm: leftoverW, height_mm: H });
    } else {
      kerfCuts.push({
        x_mm: x + pw,
        y_mm: y,
        width_mm: kerf_mm,
        height_mm: H,
        orientation: 'vertical',
      });
      newFreeRects.push({
        x_mm: x + pw + kerf_mm,
        y_mm: y,
        width_mm: leftoverW - kerf_mm,
        height_mm: H,
      });
    }

    // 2. Secondary horizontal cut across width pw at y + ph
    const leftoverH = H - ph;
    if (leftoverH <= kerf_mm) {
      wastedRects.push({ x_mm: x, y_mm: y + ph, width_mm: pw, height_mm: leftoverH });
    } else {
      kerfCuts.push({
        x_mm: x,
        y_mm: y + ph,
        width_mm: pw,
        height_mm: kerf_mm,
        orientation: 'horizontal',
      });
      newFreeRects.push({
        x_mm: x,
        y_mm: y + ph + kerf_mm,
        width_mm: pw,
        height_mm: leftoverH - kerf_mm,
      });
    }
  } else {
    // 1. Primary horizontal cut across full width W at y + ph
    const leftoverH = H - ph;
    if (leftoverH <= kerf_mm) {
      wastedRects.push({ x_mm: x, y_mm: y + ph, width_mm: W, height_mm: leftoverH });
    } else {
      kerfCuts.push({
        x_mm: x,
        y_mm: y + ph,
        width_mm: W,
        height_mm: kerf_mm,
        orientation: 'horizontal',
      });
      newFreeRects.push({
        x_mm: x,
        y_mm: y + ph + kerf_mm,
        width_mm: W,
        height_mm: leftoverH - kerf_mm,
      });
    }

    // 2. Secondary vertical cut across height ph at x + pw
    const leftoverW = W - pw;
    if (leftoverW <= kerf_mm) {
      wastedRects.push({ x_mm: x + pw, y_mm: y, width_mm: leftoverW, height_mm: ph });
    } else {
      kerfCuts.push({
        x_mm: x + pw,
        y_mm: y,
        width_mm: kerf_mm,
        height_mm: ph,
        orientation: 'vertical',
      });
      newFreeRects.push({
        x_mm: x + pw + kerf_mm,
        y_mm: y,
        width_mm: leftoverW - kerf_mm,
        height_mm: ph,
      });
    }
  }

  return {
    placed: { w_mm: pw, h_mm: ph, rotated },
    kerfCuts,
    newFreeRects,
    wastedRects,
  };
}

/**
 * Packs as many given pieces as possible into a single sheet using guillotine cutting.
 */
export function packSingleSheet(
  sheet: OptimizerSheet,
  pieces: OptimizerPiece[],
  kerf_mm: number,
  min_offcut_mm: number,
  options?: PackSheetOptions,
): {
  plan: SheetCutPlan;
  placedPieceIds: Set<string>;
} {
  const splitMode = options?.splitMode ?? 'horizontal';
  const fitRule = options?.fitRule ?? 'shelf';

  let freeRects: FreeRect[] = [
    {
      x_mm: 0,
      y_mm: 0,
      width_mm: sheet.width_mm,
      height_mm: sheet.height_mm,
    },
  ];

  const placements: PiecePlacement[] = [];
  const allKerfCuts: KerfCut[] = [];
  const allWastedRects: WastedRect[] = [];
  const placedPieceIds = new Set<string>();

  const isLiningSheet = sheet.is_lining ?? false;

  for (const piece of pieces) {
    if (placedPieceIds.has(piece.id)) continue;

    const isLiningPiece = piece.is_lining ?? false;
    const allowRotation = !isLiningSheet && !isLiningPiece;

    interface Candidate {
      index: number;
      rect: FreeRect;
      rotated: boolean;
      placedW: number;
      placedH: number;
      leftoverArea: number;
    }

    const isBetterCandidate = (cand: Candidate, best: Candidate): boolean => {
      if (fitRule === 'shelf') {
        // Shelf packing:
        // 1. Finish lower shelf first (lower Y coordinate)
        if (cand.rect.y_mm !== best.rect.y_mm) {
          return cand.rect.y_mm < best.rect.y_mm;
        }
        // 2. Pack left to right (lower X coordinate)
        if (cand.rect.x_mm !== best.rect.x_mm) {
          return cand.rect.x_mm < best.rect.x_mm;
        }
        // 3. Minimize shelf ceiling gap (match height of current shelf)
        const candCeilingGap = Math.abs(cand.rect.height_mm - cand.placedH);
        const bestCeilingGap = Math.abs(best.rect.height_mm - best.placedH);
        if (candCeilingGap !== bestCeilingGap) {
          return candCeilingGap < bestCeilingGap;
        }
        // 4. Prefer unrotated orientation
        if (cand.rotated !== best.rotated) {
          return !cand.rotated;
        }
        // 5. Prefer tighter fit (minimal leftover area)
        return cand.leftoverArea < best.leftoverArea;
      }

      if (fitRule === 'strip') {
        // Strip / column packing:
        // 1. Finish left column first (lower X coordinate)
        if (cand.rect.x_mm !== best.rect.x_mm) {
          return cand.rect.x_mm < best.rect.x_mm;
        }
        // 2. Pack bottom to top (lower Y coordinate)
        if (cand.rect.y_mm !== best.rect.y_mm) {
          return cand.rect.y_mm < best.rect.y_mm;
        }
        // 3. Minimize column wall gap (match width of current column)
        const candWallGap = Math.abs(cand.rect.width_mm - cand.placedW);
        const bestWallGap = Math.abs(best.rect.width_mm - best.placedW);
        if (candWallGap !== bestWallGap) {
          return candWallGap < bestWallGap;
        }
        // 4. Prefer unrotated orientation
        if (cand.rotated !== best.rotated) {
          return !cand.rotated;
        }
        return cand.leftoverArea < best.leftoverArea;
      }

      if (fitRule === 'best_short_side') {
        const candShort = Math.min(
          cand.rect.width_mm - cand.placedW,
          cand.rect.height_mm - cand.placedH,
        );
        const bestShort = Math.min(
          best.rect.width_mm - best.placedW,
          best.rect.height_mm - best.placedH,
        );
        if (candShort !== bestShort) {
          return candShort < bestShort;
        }
        if (cand.rect.y_mm !== best.rect.y_mm) return cand.rect.y_mm < best.rect.y_mm;
        if (cand.rect.x_mm !== best.rect.x_mm) return cand.rect.x_mm < best.rect.x_mm;
        return cand.leftoverArea < best.leftoverArea;
      }

      if (fitRule === 'best_long_side') {
        const candLong = Math.max(
          cand.rect.width_mm - cand.placedW,
          cand.rect.height_mm - cand.placedH,
        );
        const bestLong = Math.max(
          best.rect.width_mm - best.placedW,
          best.rect.height_mm - best.placedH,
        );
        if (candLong !== bestLong) {
          return candLong < bestLong;
        }
        if (cand.rect.y_mm !== best.rect.y_mm) return cand.rect.y_mm < best.rect.y_mm;
        if (cand.rect.x_mm !== best.rect.x_mm) return cand.rect.x_mm < best.rect.x_mm;
        return cand.leftoverArea < best.leftoverArea;
      }

      // Default: Best Area Fit
      if (cand.leftoverArea !== best.leftoverArea) {
        return cand.leftoverArea < best.leftoverArea;
      }
      if (cand.rect.y_mm !== best.rect.y_mm) return cand.rect.y_mm < best.rect.y_mm;
      if (cand.rect.x_mm !== best.rect.x_mm) return cand.rect.x_mm < best.rect.x_mm;
      if (cand.rotated !== best.rotated) return !cand.rotated;
      return false;
    };

    let bestCandidate: Candidate | null = null;

    for (let i = 0; i < freeRects.length; i++) {
      const rect = freeRects[i];

      // Option 1: Unrotated
      if (piece.width_mm <= rect.width_mm && piece.height_mm <= rect.height_mm) {
        const leftover = rect.width_mm * rect.height_mm - piece.width_mm * piece.height_mm;
        const cand: Candidate = {
          index: i,
          rect,
          rotated: false,
          placedW: piece.width_mm,
          placedH: piece.height_mm,
          leftoverArea: leftover,
        };
        if (!bestCandidate || isBetterCandidate(cand, bestCandidate)) {
          bestCandidate = cand;
        }
      }

      // Option 2: Rotated (if allowed)
      if (
        allowRotation &&
        piece.height_mm <= rect.width_mm &&
        piece.width_mm <= rect.height_mm
      ) {
        const leftover = rect.width_mm * rect.height_mm - piece.height_mm * piece.width_mm;
        const cand: Candidate = {
          index: i,
          rect,
          rotated: true,
          placedW: piece.height_mm,
          placedH: piece.width_mm,
          leftoverArea: leftover,
        };
        if (!bestCandidate || isBetterCandidate(cand, bestCandidate)) {
          bestCandidate = cand;
        }
      }
    }

    const bestRectIndex = bestCandidate ? bestCandidate.index : -1;
    const bestRotated = bestCandidate ? bestCandidate.rotated : false;
    const bestPlacedW = bestCandidate ? bestCandidate.placedW : 0;
    const bestPlacedH = bestCandidate ? bestCandidate.placedH : 0;

    if (bestRectIndex >= 0) {
      const targetRect = freeRects[bestRectIndex];

      const split = splitGuillotine(
        targetRect,
        bestPlacedW,
        bestPlacedH,
        bestRotated,
        kerf_mm,
        isLiningSheet,
        splitMode,
        min_offcut_mm,
      );

      placements.push({
        piece_id: piece.id,
        order_item_id: piece.order_item_id,
        stock_item_id: sheet.id,
        x_mm: targetRect.x_mm,
        y_mm: targetRect.y_mm,
        w_mm: bestPlacedW,
        h_mm: bestPlacedH,
        rotated: bestRotated,
      });

      allKerfCuts.push(...split.kerfCuts);
      allWastedRects.push(...split.wastedRects);

      // Replace targetRect with newly split free rectangles
      freeRects.splice(bestRectIndex, 1, ...split.newFreeRects);
      placedPieceIds.add(piece.id);
    }
  }

  // Final classification of leftover free rectangles:
  // Discard as waste if both dimensions are strictly less than min_offcut_mm,
  // otherwise save as reusable offcut.
  const offcuts: ResultOffcut[] = [];
  let offcutCounter = 1;

  for (const rect of freeRects) {
    if (rect.width_mm <= 0 || rect.height_mm <= 0) continue;

    if (isUsableOffcut(rect.width_mm, rect.height_mm, min_offcut_mm)) {
      offcuts.push({
        id: `${sheet.id}-offcut-${offcutCounter++}`,
        parent_id: sheet.id,
        x_mm: rect.x_mm,
        y_mm: rect.y_mm,
        width_mm: rect.width_mm,
        height_mm: rect.height_mm,
      });
    } else {
      allWastedRects.push({
        x_mm: rect.x_mm,
        y_mm: rect.y_mm,
        width_mm: rect.width_mm,
        height_mm: rect.height_mm,
      });
    }
  }

  const usedArea = placements.reduce((sum, p) => sum + p.w_mm * p.h_mm, 0);
  const offcutArea = offcuts.reduce((sum, o) => sum + o.width_mm * o.height_mm, 0);
  const wastedArea = allWastedRects.reduce((sum, w) => sum + w.width_mm * w.height_mm, 0);
  const kerfArea = allKerfCuts.reduce((sum, k) => sum + k.width_mm * k.height_mm, 0);
  const totalSheetArea = sheet.width_mm * sheet.height_mm;

  const plan: SheetCutPlan = {
    sheet,
    placements,
    offcuts,
    wasted_rects: allWastedRects,
    kerf_cuts: allKerfCuts,
    used_area_mm2: usedArea,
    offcut_area_mm2: offcutArea,
    wasted_area_mm2: wastedArea,
    kerf_loss_area_mm2: kerfArea,
    total_sheet_area_mm2: totalSheetArea,
  };

  return { plan, placedPieceIds };
}
