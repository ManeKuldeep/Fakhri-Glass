import { OrderCutPlan } from '../queries';
import { calculateAreaSqFt, calculateAreaSqM } from '../../inventory/utils';

describe('Order Cut Plans and Visualizer Tests', () => {
  const samplePlans: OrderCutPlan[] = [
    {
      id: 'plan-1',
      order_id: 'ord-101',
      product_id: 'prod-clear-5',
      kerf_mm: 3,
      max_wastage_pct: 10,
      created_at: '2026-10-03T10:00:00Z',
      product: {
        id: 'prod-clear-5',
        name: '5 mm Clear Glass',
        thickness_mm: 5,
        color: null,
        is_lining: false,
      },
      cut_pieces: [
        {
          id: 'cp-1',
          order_item_id: 'oi-1',
          stock_item_id: 'sheet-full-1',
          x_mm: 0,
          y_mm: 0,
          w_mm: 600,
          h_mm: 900,
          rotated: false,
          stock_item: {
            id: 'sheet-full-1',
            width_mm: 2440,
            height_mm: 1830,
            source: 'full',
            vertical_line_height_mm: null,
          },
        },
        {
          id: 'cp-2',
          order_item_id: 'oi-1',
          stock_item_id: 'sheet-full-1',
          x_mm: 603,
          y_mm: 0,
          w_mm: 600,
          h_mm: 900,
          rotated: false,
          stock_item: {
            id: 'sheet-full-1',
            width_mm: 2440,
            height_mm: 1830,
            source: 'full',
            vertical_line_height_mm: null,
          },
        },
        {
          id: 'cp-3',
          order_item_id: 'oi-2',
          stock_item_id: 'sheet-offcut-2',
          x_mm: 0,
          y_mm: 0,
          w_mm: 400,
          h_mm: 500,
          rotated: true,
          stock_item: {
            id: 'sheet-offcut-2',
            width_mm: 800,
            height_mm: 600,
            source: 'offcut',
            vertical_line_height_mm: null,
          },
        },
      ],
    },
  ];

  it('correctly aggregates sheets from cut plans', () => {
    const sheetIds = new Set<string>();
    for (const plan of samplePlans) {
      for (const piece of plan.cut_pieces) {
        sheetIds.add(piece.stock_item_id);
      }
    }

    expect(sheetIds.size).toBe(2);
    expect(sheetIds.has('sheet-full-1')).toBe(true);
    expect(sheetIds.has('sheet-offcut-2')).toBe(true);
  });

  it('calculates utilized area and leftover accurately for a sheet', () => {
    // Sheet 1: 2440 × 1830 mm
    const sheetW = 2440;
    const sheetH = 1830;
    const totalAreaMm = sheetW * sheetH;

    // Two pieces of 600 × 900 mm
    const piece1Area = 600 * 900;
    const piece2Area = 600 * 900;
    const usedAreaMm = piece1Area + piece2Area;

    const usedPct = Math.round((usedAreaMm / totalAreaMm) * 100);
    expect(usedPct).toBe(24); // 1,080,000 / 4,465,200 ≈ 24.18%

    const sheetSqFt = calculateAreaSqFt(sheetW, sheetH);
    const usedSqFt = Number((usedAreaMm / 92903.04).toFixed(2));
    const leftoverSqFt = Number((sheetSqFt - usedSqFt).toFixed(2));

    expect(sheetSqFt).toBeCloseTo(48.06, 1);
    expect(usedSqFt).toBeCloseTo(11.63, 1);
    expect(leftoverSqFt).toBeCloseTo(36.43, 1);
  });


  it('calculates metrics for an offcut parent sheet', () => {
    // Sheet 2: 800 × 600 mm (Offcut)
    const offcutW = 800;
    const offcutH = 600;
    const pieceW = 400;
    const pieceH = 500;

    const usedAreaMm = pieceW * pieceH; // 200,000
    const totalAreaMm = offcutW * offcutH; // 480,000
    const usedPct = Math.round((usedAreaMm / totalAreaMm) * 100);

    expect(usedPct).toBe(42); // 200,000 / 480,000 ≈ 41.67%
    expect(calculateAreaSqM(pieceW, pieceH)).toBe(0.2);
  });
});
