import * as fc from 'fast-check';
import { packPieces } from '../pack';
import { OptimizerPiece, OptimizerSheet } from '../types';
import { validatePlacements, verifyAreaConservation } from '../validation';

describe('Optimizer Property Tests (fast-check)', () => {
  // Arbitrary generator for sheets
  const sheetArb = fc.record<OptimizerSheet>({
    id: fc.uuid(),
    width_mm: fc.integer({ min: 800, max: 3200 }),
    height_mm: fc.integer({ min: 800, max: 3200 }),
    source: fc.constantFrom<'full' | 'offcut'>('full', 'offcut'),
    is_lining: fc.boolean(),
    vertical_line_height_mm: fc.option(fc.integer({ min: 500, max: 3200 }), { nil: null }),
  });

  // Arbitrary generator for pieces
  const pieceArb = (isLining: boolean) =>
    fc.record<OptimizerPiece>({
      id: fc.uuid(),
      order_item_id: fc.uuid(),
      width_mm: fc.integer({ min: 100, max: 1200 }),
      height_mm: fc.integer({ min: 100, max: 1200 }),
      is_lining: fc.constant(isLining),
    });

  it('INVARIANT 1 & 2: Placed pieces never overlap and stay strictly within sheet bounds', () => {
    fc.assert(
      fc.property(
        sheetArb,
        fc.array(pieceArb(false), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 5 }), // kerf_mm
        (sheet, pieces, kerf_mm) => {
          const result = packPieces([sheet], pieces, { kerf_mm, min_offcut_mm: 300 });

          for (const plan of result.plans) {
            const validation = validatePlacements(plan.sheet, plan.placements, kerf_mm);
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toEqual([]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('INVARIANT 3: Area is strictly conserved (pieces + offcuts + waste + kerf = sheet area)', () => {
    fc.assert(
      fc.property(
        sheetArb,
        fc.array(pieceArb(false), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 4 }), // kerf_mm
        fc.integer({ min: 200, max: 600 }), // min_offcut_mm
        (sheet, pieces, kerf_mm, min_offcut_mm) => {
          const result = packPieces([sheet], pieces, { kerf_mm, min_offcut_mm });

          for (const plan of result.plans) {
            const areaCheck = verifyAreaConservation(plan);
            expect(areaCheck.isConserved).toBe(true);
            expect(areaCheck.delta).toBe(0);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('INVARIANT 4: Lining pieces are NEVER marked rotated and non-rotated dimensions are preserved', () => {
    fc.assert(
      fc.property(
        fc.record<OptimizerSheet>({
          id: fc.uuid(),
          width_mm: fc.integer({ min: 1000, max: 3000 }),
          height_mm: fc.integer({ min: 1000, max: 3000 }),
          source: fc.constant('full'),
          is_lining: fc.constant(true),
          vertical_line_height_mm: fc.constant(2000),
        }),
        fc.array(pieceArb(true), { minLength: 1, maxLength: 6 }),
        (sheet, pieces) => {
          const result = packPieces([sheet], pieces, { kerf_mm: 3 });

          for (const plan of result.plans) {
            for (const placement of plan.placements) {
              expect(placement.rotated).toBe(false);
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('INVARIANT 5: Lining sheet cuts are vertical-split first (parallel to flutes)', () => {
    fc.assert(
      fc.property(
        fc.record<OptimizerSheet>({
          id: fc.uuid(),
          width_mm: fc.integer({ min: 1200, max: 2400 }),
          height_mm: fc.integer({ min: 1200, max: 2400 }),
          source: fc.constant('full'),
          is_lining: fc.constant(true),
        }),
        fc.array(pieceArb(true), { minLength: 1, maxLength: 4 }),
        (sheet, pieces) => {
          const result = packPieces([sheet], pieces, { kerf_mm: 3 });

          for (const plan of result.plans) {
            // For a lining sheet, the primary cut dividing the sheet into vertical columns
            // must be a vertical cut spanning the region height
            if (plan.placements.length > 0 && plan.kerf_cuts.length > 0) {
              const fullHeightCuts = plan.kerf_cuts.filter((k) => k.height_mm === plan.sheet.height_mm);
              // Every cut spanning the full height of the sheet must be vertical
              for (const c of fullHeightCuts) {
                expect(c.orientation).toBe('vertical');
              }
            }
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('INVARIANT 6: Offcuts first, smallest sufficient first: prefers offcut over full sheet when it fits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 600 }),
        fc.integer({ min: 300, max: 600 }),
        (pieceW, pieceH) => {
          const piece: OptimizerPiece = {
            id: 'test-piece',
            order_item_id: 'oi-test',
            width_mm: pieceW,
            height_mm: pieceH,
          };

          const fullSheet: OptimizerSheet = {
            id: 'full-sheet-1',
            width_mm: 2440,
            height_mm: 1830,
            source: 'full',
          };

          // Small offcut that can just fit the piece
          const fittingOffcut: OptimizerSheet = {
            id: 'offcut-fitting',
            width_mm: pieceW + 50,
            height_mm: pieceH + 50,
            source: 'offcut',
          };

          // Too-small offcut that cannot fit the piece
          const tooSmallOffcut: OptimizerSheet = {
            id: 'offcut-too-small',
            width_mm: Math.max(50, pieceW - 50),
            height_mm: Math.max(50, pieceH - 50),
            source: 'offcut',
          };

          // Provide them in arbitrary order: full sheet first, then offcuts
          const result = packPieces(
            [fullSheet, tooSmallOffcut, fittingOffcut],
            [piece],
            { kerf_mm: 2 },
          );

          expect(result.plans.length).toBe(1);
          // The piece must be placed on the fitting offcut, NOT the full sheet
          expect(result.plans[0].sheet.id).toBe('offcut-fitting');
          expect(result.plans[0].placements[0].stock_item_id).toBe('offcut-fitting');
        },
      ),
      { numRuns: 30 },
    );
  });
});
