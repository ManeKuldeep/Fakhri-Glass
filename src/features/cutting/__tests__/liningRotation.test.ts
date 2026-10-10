import { packPieces } from '../../../optimizer/pack';
import { validatePlacements } from '../../../optimizer/validation';
import { DEFAULT_OPTIMIZER_SETTINGS } from '../../../optimizer/types';
import { CuttingQueueTask, CuttingSheet, CuttingPiece } from '../types';

describe('BUG-02: End-to-end Lining Glass Rotation Rule Verification', () => {
  const settings = {
    ...DEFAULT_OPTIMIZER_SETTINGS,
    kerf_mm: 3,
    min_offcut_mm: 100,
    max_wastage_pct: 20,
  };

  it('proves that a lining piece is NEVER rotated even when it only fits rotated', () => {
    // 1. Simulate Cut Screen query mapping (queries.ts -> CuttingQueueTask)
    const task: CuttingQueueTask = {
      orderId: 'ord-lining-1',
      orderIds: ['ord-lining-1'],
      orderNo: 101,
      orderNos: [101],
      store: 'mumbai',
      customerName: 'Test Customer',
      customerPhone: '9999999999',
      productId: 'prod-lining-moru',
      productName: 'Moru 4mm',
      categoryName: 'Figure Glass',
      thicknessMm: 4,
      color: null,
      isLining: true, // Lining product
      totalPiecesCount: 1,
      orderItems: [
        {
          orderItemId: 'oi-1',
          orderId: 'ord-lining-1',
          orderNo: 101,
          customerName: 'Test Customer',
          widthMm: 800,
          heightMm: 400,
          qty: 1,
          isPolished: false,
        },
      ],
      ordersSummary: [],
    };

    // 2. Simulate raw stock from DB (500 width x 1000 height)
    // Unrotated: 800w x 400h DOES NOT fit in 500w x 1000h (800 > 500)
    // Rotated: 400w x 800h WOULD fit in 500w x 1000h (400 <= 500 and 800 <= 1000)
    const rawStockItems: CuttingSheet[] = [
      {
        id: 'sheet-narrow-1',
        width_mm: 500,
        height_mm: 1000,
        source: 'full',
      },
    ];

    // 3. Simulate CutWorkspace mapping (CutWorkspace.tsx L78-90, L162-166)
    const targetPieces: CuttingPiece[] = [
      {
        id: 'oi-1-1',
        order_item_id: 'oi-1',
        order_id: task.orderId,
        order_no: task.orderNo,
        customer_name: task.customerName,
        width_mm: 800,
        height_mm: 400,
        is_lining: task.isLining, // true
        piece_index: 1,
        total_qty: 1,
      },
    ];

    const availableSheets: CuttingSheet[] = rawStockItems.map((s) => ({
      ...s,
      is_lining: task.isLining, // true
    }));

    // 4. Run optimizer
    const result = packPieces(availableSheets, targetPieces, settings);

    // 5. Verification:
    // Because rotating lining glass is strictly forbidden, this piece MUST NOT be placed rotated.
    // It must remain unplaced because it cannot fit vertically/unrotated.
    expect(result.plans).toHaveLength(0);
    expect(result.unplaced_pieces).toHaveLength(1);
    expect(result.unplaced_pieces[0].id).toBe('oi-1-1');
  });

  it('proves that a lining piece that fits unrotated is placed with rotated=false', () => {
    // 1. Task with isLining = true
    const isLining = true;

    // 2. Piece: 400w x 800h
    const targetPieces: CuttingPiece[] = [
      {
        id: 'oi-2-1',
        order_item_id: 'oi-2',
        order_id: 'ord-lining-2',
        order_no: 102,
        customer_name: 'Test Customer',
        width_mm: 400,
        height_mm: 800,
        is_lining: isLining,
        piece_index: 1,
        total_qty: 1,
      },
    ];

    // 3. Sheet: 600w x 1200h (fits unrotated)
    const availableSheets: CuttingSheet[] = [
      {
        id: 'sheet-fitting-1',
        width_mm: 600,
        height_mm: 1200,
        source: 'full',
        is_lining: isLining,
      },
    ];

    // 4. Run optimizer
    const result = packPieces(availableSheets, targetPieces, settings);

    // 5. Verification:
    expect(result.plans).toHaveLength(1);
    expect(result.unplaced_pieces).toHaveLength(0);

    const placement = result.plans[0].placements[0];
    expect(placement.rotated).toBe(false);
    expect(placement.w_mm).toBe(400);
    expect(placement.h_mm).toBe(800);

    // 6. Validation must pass with 0 errors
    const validation = validatePlacements(
      availableSheets[0],
      result.plans[0].placements,
      settings.kerf_mm,
    );
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('proves that rotation is blocked when piece.is_lining is true even if sheet.is_lining is undefined', () => {
    // If sheet.is_lining was somehow omitted by a query mapping bug:
    const targetPieces: CuttingPiece[] = [
      {
        id: 'oi-3-1',
        order_item_id: 'oi-3',
        order_id: 'ord-3',
        order_no: 103,
        customer_name: 'Test',
        width_mm: 800,
        height_mm: 400,
        is_lining: true, // Piece is explicitly lining
        piece_index: 1,
        total_qty: 1,
      },
    ];

    // Sheet WITHOUT is_lining set (e.g. from fetchStockForProduct if not enriched)
    const availableSheets: CuttingSheet[] = [
      {
        id: 'sheet-no-flag',
        width_mm: 500,
        height_mm: 1000,
        source: 'full',
        is_lining: undefined,
      },
    ];

    const result = packPieces(availableSheets, targetPieces, settings);

    // Guillotine line 297: `allowRotation = !isLiningSheet && !isLiningPiece`
    // Pack line 147: `const isLining = (sheet.is_lining ?? false) || (piece.is_lining ?? false)`
    // Therefore rotation is still strictly forbidden because piece.is_lining is true!
    expect(result.plans).toHaveLength(0);
    expect(result.unplaced_pieces).toHaveLength(1);
  });

  // Gaps identified in Stage 2 analysis:
  it.failing('fails because validatePlacements does NOT flag rotated piece when only piece is lining and sheet is not', () => {
    // Current validator only checks: `if (p.rotated && sheet.is_lining)`.
    // If a placement is marked rotated on a non-lining sheet, but the original piece was lining glass,
    // the validator currently fails to catch it.
    const nonLiningSheet = {
      id: 'sheet-plain',
      width_mm: 1000,
      height_mm: 1000,
      source: 'full' as const,
      is_lining: false,
    };

    const rotatedPlacements = [
      {
        piece_id: 'piece-lining-rot',
        order_item_id: 'oi-rot',
        stock_item_id: 'sheet-plain',
        x_mm: 0,
        y_mm: 0,
        w_mm: 400,
        h_mm: 800,
        rotated: true, // Marked rotated!
      },
    ];

    const validation = validatePlacements(nonLiningSheet, rotatedPlacements, 3);
    // Expected to be invalid and report error, but currently returns isValid: true
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContainEqual(expect.stringContaining('rotated'));
  });

  it('documents that the optimizer produces horizontal kerf cuts on lining sheets (vertical cuts only rule is not enforced)', () => {
    // When multiple pieces are packed on a lining sheet vertically,
    // guillotine cutting creates horizontal cuts (e.g. shelf splits across X).
    const liningSheet = {
      id: 'sheet-lining-full',
      width_mm: 1000,
      height_mm: 2000,
      source: 'full' as const,
      is_lining: true,
    };

    const twoPieces = [
      {
        id: 'p1',
        order_item_id: 'oi-1',
        width_mm: 400,
        height_mm: 500,
        is_lining: true,
      },
      {
        id: 'p2',
        order_item_id: 'oi-2',
        width_mm: 400,
        height_mm: 600,
        is_lining: true,
      },
    ];

    const result = packPieces([liningSheet], twoPieces, settings);
    expect(result.plans).toHaveLength(1);

    // Check cuts produced: horizontal cuts exist in kerf_cuts
    const plan = result.plans[0];
    const horizontalCuts = plan.kerf_cuts.filter((c) => c.orientation === 'horizontal');
    // Documents that horizontal cuts are generated despite "vertical cuts only" doc rule
    expect(horizontalCuts.length).toBeGreaterThan(0);
  });
});
