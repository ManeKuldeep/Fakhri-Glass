/**
 * Pure TypeScript types for the cutting optimizer.
 * Zero external or framework dependencies.
 */

export interface OptimizerSheet {
  id: string; // matches stock_items.id
  width_mm: number;
  height_mm: number;
  source: 'full' | 'offcut';
  is_lining?: boolean;
  vertical_line_height_mm?: number | null;
}

export interface OptimizerPiece {
  id: string; // unique piece instance identifier
  order_item_id: string; // foreign key to order_items.id
  width_mm: number;
  height_mm: number;
  is_lining?: boolean;
}

export interface OptimizerSettings {
  /** Blade / scoring loss per cut in mm (default 3mm) */
  kerf_mm: number;
  /** Minimum dimension in mm below which a leftover is wasted in both dimensions (default 500mm) */
  min_offcut_mm: number;
  /** Max allowable pure wastage percentage before a warning is raised (default 20%) */
  max_wastage_pct: number;
}

export const DEFAULT_OPTIMIZER_SETTINGS: OptimizerSettings = {
  kerf_mm: 0,
  min_offcut_mm: 500,
  max_wastage_pct: 20,
};

export interface PiecePlacement {
  piece_id: string;
  order_item_id: string;
  stock_item_id: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotated: boolean;
}

export interface ResultOffcut {
  id: string;
  parent_id: string; // parent sheet stock_item_id
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
}

export interface WastedRect {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
}

export interface KerfCut {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  orientation: 'vertical' | 'horizontal';
}

export interface SheetCutPlan {
  sheet: OptimizerSheet;
  placements: PiecePlacement[];
  offcuts: ResultOffcut[];
  wasted_rects: WastedRect[];
  kerf_cuts: KerfCut[];
  used_area_mm2: number;
  offcut_area_mm2: number;
  wasted_area_mm2: number;
  kerf_loss_area_mm2: number;
  total_sheet_area_mm2: number;
}

export interface OptimizerResult {
  plans: SheetCutPlan[];
  unplaced_pieces: OptimizerPiece[];
  total_waste_pct: number; // percentage of used sheet area that is pure waste (waste + kerf)
  warnings: string[];
}
