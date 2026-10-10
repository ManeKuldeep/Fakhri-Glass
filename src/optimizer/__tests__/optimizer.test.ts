import { DEFAULT_OPTIMIZER_SETTINGS, OptimizerPiece, OptimizerSheet } from '../types';
import { packPieces } from '../pack';
import { SAMPLE_SHEETS, SAMPLE_PIECES, SAMPLE_LINING_PIECES } from './fixtures';
import { validatePlacements, verifyAreaConservation, isUsableOffcut } from '../validation';

describe('Cutting Optimizer Core Unit Tests', () => {
  describe('isUsableOffcut helper', () => {
    it('returns false for degenerate dimensions', () => {
      expect(isUsableOffcut(0, 500, 500)).toBe(false);
      expect(isUsableOffcut(500, -10, 500)).toBe(false);
    });

    it('returns false when BOTH dimensions are strictly less than min_offcut_mm', () => {
      expect(isUsableOffcut(499, 499, 500)).toBe(false);
      expect(isUsableOffcut(100, 200, 500)).toBe(false);
    });

    it('returns true when at least ONE dimension is >= min_offcut_mm', () => {
      // Long narrow strip (e.g. 1200 x 200 mm)
      expect(isUsableOffcut(1200, 200, 500)).toBe(true);
      expect(isUsableOffcut(200, 1200, 500)).toBe(true);
      // Large rectangle
      expect(isUsableOffcut(500, 500, 500)).toBe(true);
      expect(isUsableOffcut(800, 900, 500)).toBe(true);
    });
  });

  describe('Single sheet packing', () => {
    it('packs an exact-fit piece with zero kerf and produces zero offcuts/waste', () => {
      const sheet: OptimizerSheet = {
        id: 'exact-sheet',
        width_mm: 500,
        height_mm: 500,
        source: 'full',
      };
      const piece: OptimizerPiece = {
        id: 'piece-exact',
        order_item_id: 'oi-1',
        width_mm: 500,
        height_mm: 500,
      };

      const result = packPieces([sheet], [piece], { kerf_mm: 0 });
      expect(result.unplaced_pieces).toHaveLength(0);
      expect(result.plans).toHaveLength(1);

      const plan = result.plans[0];
      expect(plan.placements).toHaveLength(1);
      expect(plan.placements[0]).toEqual({
        piece_id: 'piece-exact',
        order_item_id: 'oi-1',
        stock_item_id: 'exact-sheet',
        x_mm: 0,
        y_mm: 0,
        w_mm: 500,
        h_mm: 500,
        rotated: false,
      });
      expect(plan.offcuts).toHaveLength(0);
      expect(plan.wasted_rects).toHaveLength(0);
      expect(plan.used_area_mm2).toBe(250000);
      expect(verifyAreaConservation(plan).isConserved).toBe(true);
    });

    it('handles SPEC.md example: 7ft x 10ft sheet with three 300x400mm pieces', () => {
      // 7 ft x 10 ft ≈ 2134 x 3048 mm
      const sheet: OptimizerSheet = {
        id: 'spec-sheet',
        width_mm: 2134,
        height_mm: 3048,
        source: 'full',
      };
      const pieces: OptimizerPiece[] = [
        { id: 'p1', order_item_id: 'oi-1', width_mm: 300, height_mm: 400 },
        { id: 'p2', order_item_id: 'oi-1', width_mm: 300, height_mm: 400 },
        { id: 'p3', order_item_id: 'oi-1', width_mm: 300, height_mm: 400 },
      ];

      const result = packPieces([sheet], pieces, { kerf_mm: 3, min_offcut_mm: 500 });
      expect(result.unplaced_pieces).toHaveLength(0);
      expect(result.plans).toHaveLength(1);

      const plan = result.plans[0];
      expect(plan.placements).toHaveLength(3);
      expect(validatePlacements(plan.sheet, plan.placements, 3).isValid).toBe(true);
      expect(verifyAreaConservation(plan).isConserved).toBe(true);
      // Remainder must yield offcuts
      expect(plan.offcuts.length).toBeGreaterThan(0);
      for (const offcut of plan.offcuts) {
        expect(offcut.parent_id).toBe('spec-sheet');
        expect(isUsableOffcut(offcut.width_mm, offcut.height_mm, 500)).toBe(true);
      }
    });

    it('classifies small leftover as wasted rectangle if below min_offcut_mm in both dimensions', () => {
      // Sheet 400 x 400 with a piece 350 x 350 and kerf 0
      // Leftovers will be 50 x 350 (one dim >= 300? No, min_offcut is 500)
      // Both dims < 500, so leftovers are waste
      const sheet: OptimizerSheet = {
        id: 'small-sheet',
        width_mm: 400,
        height_mm: 400,
        source: 'offcut',
      };
      const piece: OptimizerPiece = {
        id: 'piece-1',
        order_item_id: 'oi-1',
        width_mm: 350,
        height_mm: 350,
      };

      const result = packPieces([sheet], [piece], { kerf_mm: 0, min_offcut_mm: 500 });
      expect(result.plans).toHaveLength(1);
      const plan = result.plans[0];
      expect(plan.offcuts).toHaveLength(0);
      expect(plan.wasted_rects.length).toBeGreaterThan(0);
      expect(verifyAreaConservation(plan).isConserved).toBe(true);
    });
  });

  describe('Rotation behavior', () => {
    it('rotates a non-lining piece when it only fits if rotated', () => {
      // Sheet is 500w x 1000h
      // Piece is 800w x 400h. Unrotated (800 > 500) does not fit. Rotated (400w x 800h) fits!
      const sheet: OptimizerSheet = {
        id: 'narrow-sheet',
        width_mm: 500,
        height_mm: 1000,
        source: 'offcut',
        is_lining: false,
      };
      const piece: OptimizerPiece = {
        id: 'wide-piece',
        order_item_id: 'oi-1',
        width_mm: 800,
        height_mm: 400,
        is_lining: false,
      };

      const result = packPieces([sheet], [piece], { kerf_mm: 2 });
      expect(result.unplaced_pieces).toHaveLength(0);
      expect(result.plans[0].placements[0].rotated).toBe(true);
      expect(result.plans[0].placements[0].w_mm).toBe(400);
      expect(result.plans[0].placements[0].h_mm).toBe(800);
    });

    it('NEVER rotates a lining piece even if rotating would fit', () => {
      // Sheet is 500w x 1000h
      // Lining piece is 800w x 400h. Cannot be rotated. So it cannot fit in 500w!
      const sheet: OptimizerSheet = {
        id: 'narrow-sheet',
        width_mm: 500,
        height_mm: 1000,
        source: 'full',
        is_lining: true,
      };
      const piece: OptimizerPiece = {
        id: 'lining-piece',
        order_item_id: 'oi-1',
        width_mm: 800,
        height_mm: 400,
        is_lining: true,
      };

      const result = packPieces([sheet], [piece], { kerf_mm: 2 });
      // Piece cannot fit without rotation, so it must remain unplaced
      expect(result.unplaced_pieces).toHaveLength(1);
      expect(result.unplaced_pieces[0].id).toBe('lining-piece');
      expect(result.plans).toHaveLength(0);
    });
  });

  describe('Offcuts-first strategy and stock management', () => {
    it('uses offcuts first and leaves full sheets untouched if offcut suffices', () => {
      const fullSheet: OptimizerSheet = {
        id: 'full-1',
        width_mm: 2440,
        height_mm: 1830,
        source: 'full',
      };
      const smallOffcut: OptimizerSheet = {
        id: 'offcut-small',
        width_mm: 500,
        height_mm: 500,
        source: 'offcut',
      };
      const mediumOffcut: OptimizerSheet = {
        id: 'offcut-medium',
        width_mm: 1000,
        height_mm: 1000,
        source: 'offcut',
      };

      // Piece of 450 x 450: both small and medium offcut can fit it.
      // Smallest sufficient offcut first -> offcut-small should be chosen!
      const piece: OptimizerPiece = {
        id: 'p-1',
        order_item_id: 'oi-1',
        width_mm: 450,
        height_mm: 450,
      };

      const result = packPieces([fullSheet, mediumOffcut, smallOffcut], [piece], {
        kerf_mm: 3,
      });

      expect(result.plans).toHaveLength(1);
      expect(result.plans[0].sheet.id).toBe('offcut-small');
      expect(result.unplaced_pieces).toHaveLength(0);
    });

    it('falls back to full sheet only when offcuts cannot fit remaining pieces', () => {
      const fullSheet: OptimizerSheet = {
        id: 'full-1',
        width_mm: 2440,
        height_mm: 1830,
        source: 'full',
      };
      const offcut: OptimizerSheet = {
        id: 'offcut-small',
        width_mm: 300,
        height_mm: 300,
        source: 'offcut',
      };
      // Piece is 500 x 500 (too large for offcut)
      const piece: OptimizerPiece = {
        id: 'p-large',
        order_item_id: 'oi-1',
        width_mm: 500,
        height_mm: 500,
      };

      const result = packPieces([offcut, fullSheet], [piece], { kerf_mm: 3 });

      expect(result.plans).toHaveLength(1);
      expect(result.plans[0].sheet.id).toBe('full-1');
      expect(result.unplaced_pieces).toHaveLength(0);
    });

    it('reports warnings when stock is insufficient for all pieces', () => {
      const smallOffcut: OptimizerSheet = {
        id: 'offcut-only',
        width_mm: 300,
        height_mm: 300,
        source: 'offcut',
      };
      const pieces: OptimizerPiece[] = [
        { id: 'p1', order_item_id: 'oi-1', width_mm: 200, height_mm: 200 },
        { id: 'p2', order_item_id: 'oi-1', width_mm: 200, height_mm: 200 }, // will not fit on 300x300 with p1
      ];

      const result = packPieces([smallOffcut], pieces, { kerf_mm: 2 });
      expect(result.unplaced_pieces).toHaveLength(1);
      expect(result.unplaced_pieces[0].id).toBe('p2');
      expect(result.warnings).toContain('Insufficient stock for 1 piece(s)');
    });

    it('packs multi-row elongated offcut sheets aligning row 2 pieces to left with maximized usable offcut', () => {
      const sheet: OptimizerSheet = {
        id: 'offcut-953-285',
        width_mm: 953,
        height_mm: 285,
        source: 'offcut',
      };
      const pieces: OptimizerPiece[] = [
        { id: 'p1', order_item_id: 'oi-1', width_mm: 328, height_mm: 143 },
        { id: 'p2', order_item_id: 'oi-1', width_mm: 328, height_mm: 143 },
        { id: 'p3', order_item_id: 'oi-2', width_mm: 353, height_mm: 123 },
      ];

      const result = packPieces([sheet], pieces, { kerf_mm: 3, min_offcut_mm: 500 });
      expect(result.unplaced_pieces).toHaveLength(0);
      expect(result.plans).toHaveLength(1);

      const plan = result.plans[0];
      expect(plan.placements).toHaveLength(3);

      // Verify that second row piece is left-aligned (x=0) and not shifted leaving dead space
      const row2Pieces = plan.placements.filter((p) => p.y_mm >= 120);
      expect(row2Pieces.length).toBeGreaterThanOrEqual(1);
      const minRow2X = Math.min(...row2Pieces.map((p) => p.x_mm));
      expect(minRow2X).toBe(0);

      // Verify validation and area conservation
      const val = validatePlacements(plan.sheet, plan.placements, 3);
      expect(val.isValid).toBe(true);
      expect(verifyAreaConservation(plan).isConserved).toBe(true);

      // Verify usable offcut is preserved (width >= 500mm) instead of being turned into scrap discard
      const usableOffcut = plan.offcuts.find((o) => o.width_mm >= 500 || o.height_mm >= 500);
      expect(usableOffcut).toBeDefined();
    });
  });

  describe('Integration with sample fixtures', () => {
    it('packs sample pieces into sample sheets successfully', () => {
      const result = packPieces(SAMPLE_SHEETS, SAMPLE_PIECES, DEFAULT_OPTIMIZER_SETTINGS);
      expect(result.unplaced_pieces).toHaveLength(0);
      expect(result.plans.length).toBeGreaterThan(0);

      for (const plan of result.plans) {
        const val = validatePlacements(plan.sheet, plan.placements, DEFAULT_OPTIMIZER_SETTINGS.kerf_mm);
        expect(val.isValid).toBe(true);
        expect(verifyAreaConservation(plan).isConserved).toBe(true);
      }
    });

    it('packs lining sample pieces into lining sheets with vertical cuts and no rotation', () => {
      const liningSheets = SAMPLE_SHEETS.filter((s) => s.is_lining);
      const result = packPieces(liningSheets, SAMPLE_LINING_PIECES, DEFAULT_OPTIMIZER_SETTINGS);

      expect(result.unplaced_pieces).toHaveLength(0);
      for (const plan of result.plans) {
        expect(plan.sheet.is_lining).toBe(true);
        for (const p of plan.placements) {
          expect(p.rotated).toBe(false);
        }
        expect(verifyAreaConservation(plan).isConserved).toBe(true);
      }
    });
  });
});
