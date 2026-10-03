import { packSingleSheet } from './guillotine';
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  OptimizerPiece,
  OptimizerResult,
  OptimizerSettings,
  OptimizerSheet,
  SheetCutPlan,
} from './types';

/**
 * Heuristic to sort pieces in Best-Fit-Decreasing order:
 * Larger pieces first by maximum dimension, then by area.
 */
function sortPiecesDecreasing(pieces: OptimizerPiece[]): OptimizerPiece[] {
  return [...pieces].sort((a, b) => {
    const maxDimA = Math.max(a.width_mm, a.height_mm);
    const maxDimB = Math.max(b.width_mm, b.height_mm);
    if (maxDimA !== maxDimB) return maxDimB - maxDimA;
    return b.width_mm * b.height_mm - a.width_mm * a.height_mm;
  });
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

/**
 * Main cutting optimizer entrypoint.
 *
 * Requirements:
 * 1. Try offcuts first, smallest sufficient offcut first, before using a full sheet.
 * 2. Only use a new full sheet when no combination of available offcuts works.
 * 3. Respect kerf_mm as material lost per cut.
 * 4. Lining pieces (is_lining = true): never rotated, cut vertically only.
 * 5. Leftovers become offcuts UNLESS smaller than min_offcut_mm in both dimensions.
 * 6. Pure function: no side effects, no database calls.
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
  const plans: SheetCutPlan[] = [];

  let remainingPieces = sortPiecesDecreasing(pieces);

  // Partition sheets into offcuts and full sheets
  // Sort offcuts: smallest area first ("smallest sufficient first")
  const offcuts = sheets
    .filter((s) => s.source === 'offcut')
    .sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm);

  // Sort full sheets: smallest area first (if different standard sizes are present)
  const fullSheets = sheets
    .filter((s) => s.source === 'full')
    .sort((a, b) => a.width_mm * a.height_mm - b.width_mm * b.height_mm);

  // 1. Try available offcuts first
  for (const offcut of offcuts) {
    if (remainingPieces.length === 0) break;
    if (!canSheetFitAnyPiece(offcut, remainingPieces)) continue;

    const { plan, placedPieceIds } = packSingleSheet(
      offcut,
      remainingPieces,
      settings.kerf_mm,
      settings.min_offcut_mm,
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

    const { plan, placedPieceIds } = packSingleSheet(
      fullSheet,
      remainingPieces,
      settings.kerf_mm,
      settings.min_offcut_mm,
    );

    if (placedPieceIds.size > 0) {
      plans.push(plan);
      remainingPieces = remainingPieces.filter((p) => !placedPieceIds.has(p.id));
    }
  }

  // 3. Check for any pieces that could not be placed with available stock
  if (remainingPieces.length > 0) {
    warnings.push(`Insufficient stock for ${remainingPieces.length} piece(s)`);
  }

  // 4. Compute metrics and wastage
  const totalSheetArea = plans.reduce((sum, p) => sum + p.total_sheet_area_mm2, 0);
  const totalPureWasteArea = plans.reduce(
    (sum, p) => sum + p.wasted_area_mm2 + p.kerf_loss_area_mm2,
    0,
  );

  const total_waste_pct =
    totalSheetArea > 0 ? Number(((totalPureWasteArea / totalSheetArea) * 100).toFixed(2)) : 0;

  if (total_waste_pct > settings.max_wastage_pct) {
    warnings.push(
      `Wastage of ${total_waste_pct}% exceeds maximum allowed ${settings.max_wastage_pct}%`,
    );
  }

  return {
    plans,
    unplaced_pieces: remainingPieces,
    total_waste_pct,
    warnings,
  };
}
