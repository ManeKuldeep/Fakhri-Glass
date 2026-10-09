import { packPieces } from '../pack';
import { OptimizerPiece, OptimizerSheet } from '../types';

describe('Order #8 Packing Verification', () => {
  const sheet: OptimizerSheet = {
    id: 'sheet-1',
    width_mm: 1830,
    height_mm: 2441,
    source: 'full',
    is_lining: false,
  };

  const pieces: OptimizerPiece[] = [
    { id: 'p1', order_item_id: 'oi-1', width_mm: 425, height_mm: 1253 },
    { id: 'p2', order_item_id: 'oi-1', width_mm: 425, height_mm: 1253 },
    { id: 'p3', order_item_id: 'oi-1', width_mm: 425, height_mm: 1253 },
    { id: 'p4', order_item_id: 'oi-1', width_mm: 425, height_mm: 1253 },
    { id: 'p5', order_item_id: 'oi-2', width_mm: 320, height_mm: 725 },
    { id: 'p6', order_item_id: 'oi-2', width_mm: 320, height_mm: 725 },
    { id: 'p7', order_item_id: 'oi-2', width_mm: 320, height_mm: 725 },
    { id: 'p8', order_item_id: 'oi-3', width_mm: 458, height_mm: 723 },
  ];

  it('packs all 8 pieces on a single sheet with zero unplaced pieces', () => {
    const result = packPieces([sheet], pieces, { kerf_mm: 3, min_offcut_mm: 500 });
    expect(result.plans.length).toBe(1);
    expect(result.unplaced_pieces.length).toBe(0);
    expect(result.plans[0].placements.length).toBe(8);
  });

  it('packs second row pieces adjacent to each other starting from x=0', () => {
    const result = packPieces([sheet], pieces, { kerf_mm: 3 });
    const plan = result.plans[0];

    // Verify row 2 pieces start at x=0
    const row2Pieces = plan.placements.filter((p) => p.y_mm >= 1250);
    const minRow2X = Math.min(...row2Pieces.map((p) => p.x_mm));
    expect(minRow2X).toBe(0);

    // Verify row 2 pieces are adjacent (no large gaps between consecutive pieces)
    const sortedRow2 = [...row2Pieces].sort((a, b) => a.x_mm - b.x_mm);
    for (let i = 0; i < sortedRow2.length - 1; i++) {
      const current = sortedRow2[i];
      const next = sortedRow2[i + 1];
      const gap = next.x_mm - (current.x_mm + current.w_mm);
      expect(gap).toBe(3); // kerf gap exactly!
    }
  });

  it('clever space optimizer packs pieces to preserve reusable offcuts', () => {
    // When min_offcut_mm is 400, verify that the remaining glass is preserved as a usable offcut
    const result = packPieces([sheet], pieces, { kerf_mm: 3, min_offcut_mm: 400 });
    const plan = result.plans[0];

    expect(plan.offcuts.length).toBeGreaterThan(0);
    const largestOffcut = Math.max(...plan.offcuts.map((o) => o.width_mm * o.height_mm));
    expect(largestOffcut).toBeGreaterThan(0);
  });

  it('combines multiple orders on a shared sheet with optimal sheet usage', () => {
    const order9Pieces: OptimizerPiece[] = [
      { id: 'p9-1', order_item_id: 'oi-9-1', width_mm: 300, height_mm: 400 },
      { id: 'p9-2', order_item_id: 'oi-9-2', width_mm: 300, height_mm: 400 },
    ];

    const combined = [...pieces, ...order9Pieces];
    const result = packPieces([sheet], combined, { kerf_mm: 3 });

    // Both orders fit together on the single sheet!
    expect(result.plans.length).toBe(1);
    expect(result.unplaced_pieces.length).toBe(0);
    expect(result.plans[0].placements.length).toBe(10);
  });

  it('uses available offcuts from previous orders before using a new full sheet', () => {
    const all17Pieces: OptimizerPiece[] = [
      { id: 'p1', order_item_id: 'oi-1', width_mm: 350, height_mm: 120 },
      { id: 'p2', order_item_id: 'oi-2', width_mm: 455, height_mm: 720 },
      { id: 'p3', order_item_id: 'oi-2', width_mm: 455, height_mm: 720 },
      { id: 'p4', order_item_id: 'oi-3', width_mm: 342, height_mm: 1235 },
      { id: 'p5', order_item_id: 'oi-4', width_mm: 140, height_mm: 325 },
      { id: 'p6', order_item_id: 'oi-4', width_mm: 140, height_mm: 325 },
      { id: 'p7', order_item_id: 'oi-4', width_mm: 140, height_mm: 325 },
      { id: 'p8', order_item_id: 'oi-4', width_mm: 140, height_mm: 325 },
      { id: 'p9', order_item_id: 'oi-5', width_mm: 320, height_mm: 725 },
      { id: 'p10', order_item_id: 'oi-5', width_mm: 320, height_mm: 725 },
      { id: 'p11', order_item_id: 'oi-5', width_mm: 320, height_mm: 725 },
      { id: 'p12', order_item_id: 'oi-6', width_mm: 422, height_mm: 1250 },
      { id: 'p13', order_item_id: 'oi-6', width_mm: 422, height_mm: 1250 },
      { id: 'p14', order_item_id: 'oi-6', width_mm: 422, height_mm: 1250 },
      { id: 'p15', order_item_id: 'oi-6', width_mm: 422, height_mm: 1250 },
      { id: 'p16', order_item_id: 'oi-6', width_mm: 422, height_mm: 1250 },
      { id: 'p17', order_item_id: 'oi-6', width_mm: 422, height_mm: 1250 },
    ];

    const offcutFromOrder6: OptimizerSheet = {
      id: 'offcut-from-order-6',
      width_mm: 2140,
      height_mm: 897,
      source: 'offcut',
      is_lining: false,
    };

    const fullSheet: OptimizerSheet = {
      id: 'full-sheet',
      width_mm: 1830,
      height_mm: 2441,
      source: 'full',
      is_lining: false,
    };

    const result = packPieces([offcutFromOrder6, fullSheet], all17Pieces, { kerf_mm: 3 });

    // The offcut must be utilized!
    const offcutPlan = result.plans.find((p) => p.sheet.id === 'offcut-from-order-6');
    expect(offcutPlan).toBeDefined();
    expect(offcutPlan!.placements.length).toBeGreaterThan(0);
  });
});
