import { OptimizerSheet, PiecePlacement, SheetCutPlan } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Determine if a leftover rectangle is usable as an offcut or must be discarded as waste.
 * Rule: A leftover is wasted UNLESS at least one dimension is >= min_offcut_mm.
 * In other words, discarded if both width and height are strictly smaller than min_offcut_mm.
 */
export function isUsableOffcut(
  width_mm: number,
  height_mm: number,
  min_offcut_mm: number,
): boolean {
  if (width_mm <= 0 || height_mm <= 0) return false;
  return !(width_mm < min_offcut_mm && height_mm < min_offcut_mm);
}

/**
 * Validate that two placed rectangles do not overlap, taking kerf into account.
 * With kerf, two adjacent pieces must have at least kerf_mm separation between them.
 */
export function piecesOverlap(
  a: { x_mm: number; y_mm: number; w_mm: number; h_mm: number },
  b: { x_mm: number; y_mm: number; w_mm: number; h_mm: number },
  kerf_mm = 0,
): boolean {
  // If a is completely to the left of b (with kerf)
  if (a.x_mm + a.w_mm + kerf_mm <= b.x_mm) return false;
  // If b is completely to the left of a (with kerf)
  if (b.x_mm + b.w_mm + kerf_mm <= a.x_mm) return false;
  // If a is completely below b (with kerf)
  if (a.y_mm + a.h_mm + kerf_mm <= b.y_mm) return false;
  // If b is completely below a (with kerf)
  if (b.y_mm + b.h_mm + kerf_mm <= a.y_mm) return false;

  return true;
}

/**
 * Check that all placements in a sheet cut plan satisfy:
 * 1. Inside sheet boundaries
 * 2. Non-negative coordinates and dimensions
 * 3. No mutual overlaps (with kerf spacing)
 * 4. Lining pieces are never rotated
 */
export function validatePlacements(
  sheet: OptimizerSheet,
  placements: PiecePlacement[],
  kerf_mm = 0,
): ValidationResult {
  const errors: string[] = [];

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];

    if (p.x_mm < 0 || p.y_mm < 0) {
      errors.push(`Piece ${p.piece_id} has negative coordinates (${p.x_mm}, ${p.y_mm})`);
    }

    if (p.w_mm <= 0 || p.h_mm <= 0) {
      errors.push(`Piece ${p.piece_id} has non-positive dimensions (${p.w_mm}x${p.h_mm})`);
    }

    if (p.x_mm + p.w_mm > sheet.width_mm || p.y_mm + p.h_mm > sheet.height_mm) {
      errors.push(
        `Piece ${p.piece_id} (${p.x_mm}+${p.w_mm}, ${p.y_mm}+${p.h_mm}) exceeds sheet bounds (${sheet.width_mm}x${sheet.height_mm})`,
      );
    }

    if (p.rotated && sheet.is_lining) {
      errors.push(`Piece ${p.piece_id} is marked rotated on a lining sheet`);
    }

    for (let j = i + 1; j < placements.length; j++) {
      const other = placements[j];
      if (piecesOverlap(p, other, kerf_mm)) {
        errors.push(
          `Piece ${p.piece_id} [${p.x_mm},${p.y_mm},${p.w_mm},${p.h_mm}] overlaps with piece ${other.piece_id} [${other.x_mm},${other.y_mm},${other.w_mm},${other.h_mm}] with kerf=${kerf_mm}`,
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Verify strict area conservation for a sheet cut plan:
 * sheet_area === piece_area + offcut_area + wasted_area + kerf_loss_area
 */
export function verifyAreaConservation(plan: SheetCutPlan): {
  isConserved: boolean;
  expectedArea: number;
  actualSum: number;
  delta: number;
} {
  const expectedArea = plan.sheet.width_mm * plan.sheet.height_mm;

  const pieceArea = plan.placements.reduce((sum, p) => sum + p.w_mm * p.h_mm, 0);
  const offcutArea = plan.offcuts.reduce((sum, o) => sum + o.width_mm * o.height_mm, 0);
  const wastedArea = plan.wasted_rects.reduce((sum, w) => sum + w.width_mm * w.height_mm, 0);
  const kerfArea = plan.kerf_cuts.reduce((sum, k) => sum + k.width_mm * k.height_mm, 0);

  const actualSum = pieceArea + offcutArea + wastedArea + kerfArea;
  const delta = actualSum - expectedArea;

  return {
    isConserved: delta === 0,
    expectedArea,
    actualSum,
    delta,
  };
}
