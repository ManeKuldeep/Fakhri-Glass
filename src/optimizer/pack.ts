import {
  FitRule,
  GuillotineSplitMode,
  PackSheetOptions,
  packSingleSheet,
} from './guillotine';
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  OptimizerPiece,
  OptimizerResult,
  OptimizerSettings,
  OptimizerSheet,
  SheetCutPlan,
} from './types';

type PieceSorter = (pieces: OptimizerPiece[]) => OptimizerPiece[];

const SORTERS: { name: string; sort: PieceSorter }[] = [
  {
    name: 'BFD_HEIGHT',
    sort: (pieces) =>
      [...pieces].sort((a, b) => {
        if (b.height_mm !== a.height_mm) return b.height_mm - a.height_mm;
        return b.width_mm - a.width_mm;
      }),
  },
  {
    name: 'BFD_AREA',
    sort: (pieces) =>
      [...pieces].sort((a, b) => {
        const areaA = a.width_mm * a.height_mm;
        const areaB = b.width_mm * b.height_mm;
        if (areaA !== areaB) return areaB - areaA;
        return Math.max(b.width_mm, b.height_mm) - Math.max(a.width_mm, a.height_mm);
      }),
  },
  {
    name: 'BFD_MAX_DIM',
    sort: (pieces) =>
      [...pieces].sort((a, b) => {
        const maxA = Math.max(a.width_mm, a.height_mm);
        const maxB = Math.max(b.width_mm, b.height_mm);
        if (maxA !== maxB) return maxB - maxA;
        return b.width_mm * b.height_mm - a.width_mm * a.height_mm;
      }),
  },
  {
    name: 'BFD_WIDTH',
    sort: (pieces) =>
      [...pieces].sort((a, b) => {
        if (b.width_mm !== a.width_mm) return b.width_mm - a.width_mm;
        return b.height_mm - a.height_mm;
      }),
  },
  {
    name: 'BFD_MIN_DIM',
    sort: (pieces) =>
      [...pieces].sort((a, b) => {
        const minA = Math.min(a.width_mm, a.height_mm);
        const minB = Math.min(b.width_mm, b.height_mm);
        if (minA !== minB) return minB - minA;
        return b.width_mm * b.height_mm - a.width_mm * a.height_mm;
      }),
  },
  {
    name: 'BFD_PERIMETER',
    sort: (pieces) =>
      [...pieces].sort((a, b) => {
        const perimA = a.width_mm + a.height_mm;
        const perimB = b.width_mm + b.height_mm;
        if (perimA !== perimB) return perimB - perimA;
        return b.width_mm * b.height_mm - a.width_mm * a.height_mm;
      }),
  },
];

const PACK_STRATEGIES: {
  splitMode: GuillotineSplitMode;
  fitRule: FitRule;
}[] = [
  { splitMode: 'horizontal', fitRule: 'shelf' },
  { splitMode: 'max_offcut', fitRule: 'shelf' },
  { splitMode: 'vertical', fitRule: 'strip' },
  { splitMode: 'max_offcut', fitRule: 'strip' },
  { splitMode: 'max_offcut', fitRule: 'best_area' },
  { splitMode: 'max_offcut', fitRule: 'best_short_side' },
  { splitMode: 'max_offcut', fitRule: 'best_long_side' },
];

function scoreSheetPlan(plan: SheetCutPlan, placedCount: number): number {
  const largestOffcut = plan.offcuts.reduce((max, o) => Math.max(max, o.width_mm * o.height_mm), 0);
  return (
    placedCount * 100_000_000 +
    largestOffcut * 3 +
    plan.offcut_area_mm2 * 2 -
    plan.wasted_area_mm2 * 4
  );
}

function packSingleSheetOptimally(
  sheet: OptimizerSheet,
  pieces: OptimizerPiece[],
  settings: OptimizerSettings,
  preferredOptions: PackSheetOptions,
): { plan: SheetCutPlan; placedPieceIds: Set<string> } {
  const preferred = packSingleSheet(
    sheet,
    pieces,
    settings.kerf_mm,
    settings.min_offcut_mm,
    preferredOptions,
  );

  if (preferred.placedPieceIds.size === pieces.length && preferred.plan.wasted_area_mm2 === 0) {
    return preferred;
  }

  let best = preferred;
  let bestScore = scoreSheetPlan(best.plan, best.placedPieceIds.size);

  for (const strat of PACK_STRATEGIES) {
    if (strat.splitMode === preferredOptions.splitMode && strat.fitRule === preferredOptions.fitRule) {
      continue;
    }
    const cand = packSingleSheet(
      sheet,
      pieces,
      settings.kerf_mm,
      settings.min_offcut_mm,
      strat,
    );
    const score = scoreSheetPlan(cand.plan, cand.placedPieceIds.size);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }

  return best;
}

/**
 * Check if a sheet can potentially accommodate at least one of the candidate pieces.
 */
function canSheetFitAnyPiece(sheet: OptimizerSheet, pieces: OptimizerPiece[]): boolean {
  for (const piece of pieces) {
    const isLining = (sheet.is_lining ?? false) || (piece.is_lining ?? false);
    // Unrotated fit
    if (piece.width_mm <= sheet.width_mm && piece.height_mm <= sheet.height_mm) {
      return true;
    }
    // Rotated fit (allowed only if not lining)
    if (!isLining && piece.height_mm <= sheet.width_mm && piece.width_mm <= sheet.height_mm) {
      return true;
    }
  }
  return false;
}

interface PackingPassResult {
  plans: SheetCutPlan[];
  unplaced_pieces: OptimizerPiece[];
  totalSheetArea: number;
  totalPureWasteArea: number;
  usableOffcutArea: number;
  largestOffcutArea: number;
}

/**
 * Simulate packing pieces into available stock using a specific heuristic sorting and strategy.
 * Respects: offcuts first, smallest sufficient first, then full sheets.
 */
function runPackingPass(
  sheets: OptimizerSheet[],
  pieces: OptimizerPiece[],
  settings: OptimizerSettings,
  sortFn: PieceSorter,
  packOptions: PackSheetOptions,
): PackingPassResult {
  const plans: SheetCutPlan[] = [];
  let remainingPieces = sortFn(pieces);

  // Partition sheets: offcuts first, smallest area first
  const offcuts = sheets
    .filter((s) => s.source === 'offcut')
    .sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm);

  // Full sheets: smallest area first
  const fullSheets = sheets
    .filter((s) => s.source === 'full')
    .sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm);

  // 1. Try available offcuts first
  for (const offcut of offcuts) {
    if (remainingPieces.length === 0) break;
    if (!canSheetFitAnyPiece(offcut, remainingPieces)) continue;

    const { plan, placedPieceIds } = packSingleSheetOptimally(
      offcut,
      remainingPieces,
      settings,
      packOptions,
    );

    if (placedPieceIds.size > 0) {
      plans.push(plan);
      remainingPieces = remainingPieces.filter((p) => !placedPieceIds.has(p.id));
    }
  }

  // 2. Fall back to full sheets only when remaining pieces could not be placed in offcuts
  for (const fullSheet of fullSheets) {
    if (remainingPieces.length === 0) break;
    if (!canSheetFitAnyPiece(fullSheet, remainingPieces)) continue;

    const { plan, placedPieceIds } = packSingleSheetOptimally(
      fullSheet,
      remainingPieces,
      settings,
      packOptions,
    );

    if (placedPieceIds.size > 0) {
      plans.push(plan);
      remainingPieces = remainingPieces.filter((p) => !placedPieceIds.has(p.id));
    }
  }

  let totalSheetArea = 0;
  let totalPureWasteArea = 0;
  let usableOffcutArea = 0;
  let largestOffcutArea = 0;

  for (const plan of plans) {
    totalSheetArea += plan.total_sheet_area_mm2;
    totalPureWasteArea += plan.wasted_area_mm2 + plan.kerf_loss_area_mm2;
    for (const offcut of plan.offcuts) {
      const area = offcut.width_mm * offcut.height_mm;
      usableOffcutArea += area;
      if (area > largestOffcutArea) {
        largestOffcutArea = area;
      }
    }
  }

  return {
    plans,
    unplaced_pieces: remainingPieces,
    totalSheetArea,
    totalPureWasteArea,
    usableOffcutArea,
    largestOffcutArea,
  };
}

/**
 * Objective scoring function to pick the best packing candidate:
 * 1. Primary: fewest unplaced pieces (ideally 0)
 * 2. Secondary: fewest sheets used (minimises total sheet consumption)
 * 3. Tertiary: maximize usable offcut area and single largest offcut rectangle; minimize pure scrap
 */
function isBetterPass(cand: PackingPassResult, best: PackingPassResult): boolean {
  if (cand.unplaced_pieces.length !== best.unplaced_pieces.length) {
    return cand.unplaced_pieces.length < best.unplaced_pieces.length;
  }
  if (cand.plans.length !== best.plans.length) {
    return cand.plans.length < best.plans.length;
  }

  const scoreCand =
    cand.largestOffcutArea * 3 + cand.usableOffcutArea * 2 - cand.totalPureWasteArea * 4;
  const scoreBest =
    best.largestOffcutArea * 3 + best.usableOffcutArea * 2 - best.totalPureWasteArea * 4;

  return scoreCand > scoreBest;
}

/**
 * Main cutting optimizer entrypoint.
 * Executes a fast multi-heuristic tournament to find the layout that consumes
 * the fewest sheets and minimizes offset / scrap wastage.
 */
export function packPieces(
  sheets: OptimizerSheet[],
  pieces: OptimizerPiece[],
  options?: Partial<OptimizerSettings>,
): OptimizerResult {
  const settings: OptimizerSettings = {
    ...DEFAULT_OPTIMIZER_SETTINGS,
    ...options,
  };

  const warnings: string[] = [];

  if (pieces.length === 0 || sheets.length === 0) {
    return {
      plans: [],
      unplaced_pieces: pieces,
      total_waste_pct: 0,
      warnings: sheets.length === 0 && pieces.length > 0 ? ['No stock available'] : [],
    };
  }

  let bestResult: PackingPassResult | null = null;

  // Run competitive tournament across heuristics and strategies
  for (const sorter of SORTERS) {
    for (const strategy of PACK_STRATEGIES) {
      const candidate = runPackingPass(
        sheets,
        pieces,
        settings,
        sorter.sort,
        strategy,
      );

      if (!bestResult || isBetterPass(candidate, bestResult)) {
        bestResult = candidate;
        // If we found a perfect solution (0 unplaced, 1 sheet, 0 scrap), we can keep searching
        // as the entire tournament runs in < 15ms.
      }
    }
  }

  const finalResult = bestResult!;

  if (finalResult.unplaced_pieces.length > 0) {
    warnings.push(`Insufficient stock for ${finalResult.unplaced_pieces.length} piece(s)`);
  }

  const totalSheetArea = finalResult.totalSheetArea;
  const totalPureWasteArea = finalResult.totalPureWasteArea;

  const total_waste_pct =
    totalSheetArea > 0 ? Number(((totalPureWasteArea / totalSheetArea) * 100).toFixed(2)) : 0;

  if (total_waste_pct > settings.max_wastage_pct) {
    warnings.push(
      `Wastage of ${total_waste_pct}% exceeds maximum allowed ${settings.max_wastage_pct}%`,
    );
  }

  return {
    plans: finalResult.plans,
    unplaced_pieces: finalResult.unplaced_pieces,
    total_waste_pct,
    warnings,
  };
}
