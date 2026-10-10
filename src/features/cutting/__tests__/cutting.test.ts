jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../../lib/supabase', () => ({
  supabase: {},
}));

import { useCuttingSettingsStore } from '../stores/cuttingSettingsStore';
import { DEFAULT_OPTIMIZER_SETTINGS } from '../../../optimizer/types';
import { piecesOverlap } from '../../../optimizer/validation';
import {
  friendlyConfirmCutError,
  findBestPlacementOnSheet,
  canFitPieceOnSheet,
} from '../utils';
import { mergeCuttingQueueTasks } from '../queries';
import { CuttingQueueTask } from '../types';

describe('Cutting Feature Logic, Store & Error Translation Tests', () => {
  beforeEach(() => {
    useCuttingSettingsStore.getState().resetSettings();
  });

  describe('Settings Store', () => {
    it('initializes with default optimizer settings (3mm kerf, 500mm min offcut, 20% max wastage)', () => {
      const settings = useCuttingSettingsStore.getState().settings;
      expect(settings.kerf_mm).toBe(DEFAULT_OPTIMIZER_SETTINGS.kerf_mm);
      expect(settings.kerf_mm).toBe(3);
      expect(settings.min_offcut_mm).toBe(DEFAULT_OPTIMIZER_SETTINGS.min_offcut_mm);
      expect(settings.max_wastage_pct).toBe(DEFAULT_OPTIMIZER_SETTINGS.max_wastage_pct);
    });

    it('updates settings properly and resets to defaults', () => {
      const store = useCuttingSettingsStore.getState();
      store.updateSettings({ kerf_mm: 5, min_offcut_mm: 600 });

      expect(useCuttingSettingsStore.getState().settings.kerf_mm).toBe(5);
      expect(useCuttingSettingsStore.getState().settings.min_offcut_mm).toBe(600);
      expect(useCuttingSettingsStore.getState().settings.max_wastage_pct).toBe(20);

      store.resetSettings();
      expect(useCuttingSettingsStore.getState().settings.kerf_mm).toBe(3);
      expect(useCuttingSettingsStore.getState().settings.min_offcut_mm).toBe(500);
    });
  });

  describe('Collision Detection', () => {
    it('detects kerf-spaced collisions between interactive pieces correctly', () => {
      const kerf = 3;
      const pieceA = { x_mm: 0, y_mm: 0, w_mm: 400, h_mm: 500 };

      // pieceB placed with only 2mm gap (less than 3mm kerf) -> collision!
      const pieceBColliding = { x_mm: 402, y_mm: 0, w_mm: 400, h_mm: 500 };
      expect(piecesOverlap(pieceA, pieceBColliding, kerf)).toBe(true);

      // pieceC placed with exactly 3mm gap -> valid!
      const pieceCValid = { x_mm: 403, y_mm: 0, w_mm: 400, h_mm: 500 };
      expect(piecesOverlap(pieceA, pieceCValid, kerf)).toBe(false);

      // pieceD completely separated along Y -> valid
      const pieceDValid = { x_mm: 0, y_mm: 503, w_mm: 400, h_mm: 500 };
      expect(piecesOverlap(pieceA, pieceDValid, kerf)).toBe(false);
    });
  });

  describe('friendlyConfirmCutError translation', () => {
    it('translates "already confirmed" RPC error', () => {
      const msg = friendlyConfirmCutError('Cut plan already confirmed for this order and product');
      expect(msg).toContain('already been confirmed');
    });

    it('translates "no longer available" concurrency sheet race error', () => {
      const msg = friendlyConfirmCutError('One or more sheets are no longer available');
      expect(msg).toContain('no longer available');
      expect(msg).toContain('refresh your available stock');
    });

    it('translates "does not match ordered quantity" error', () => {
      const msg = friendlyConfirmCutError('Piece count (2) does not match ordered quantity (3)');
      expect(msg).toContain('does not match the ordered quantity');
    });

    it('translates "exceeded ordered quantity" error for partial cut plans', () => {
      const msg = friendlyConfirmCutError('Exceeded ordered quantity for item oi-123');
      expect(msg).toContain('exceed the ordered quantity');
    });

    it('translates "do not belong to this order" validation error', () => {
      const msg = friendlyConfirmCutError('One or more pieces do not belong to this order and product');
      expect(msg).toContain('do not belong to this order');
    });

    it('translates "offcut parent sheet is not one of the consumed sheets" validation error', () => {
      const msg = friendlyConfirmCutError('Offcut parent sheet is not one of the consumed sheets');
      expect(msg).toContain('Offcut parent sheet');
    });

    it('passes through other errors unchanged', () => {
      const msg = friendlyConfirmCutError('Network request failed');
      expect(msg).toBe('Network request failed');
    });
  });

  describe('mergeCuttingQueueTasks', () => {
    it('correctly merges multiple tasks for the same glass product', () => {
      const task1: CuttingQueueTask = {
        orderId: 'order-1',
        orderIds: ['order-1'],
        orderNo: 101,
        orderNos: [101],
        store: 'mumbai',
        customerName: 'Customer A',
        customerPhone: '1111111111',
        productId: 'prod-clear-5',
        productName: 'Clear Glass',
        categoryName: 'Float Glass',
        thicknessMm: 5,
        color: null,
        isLining: false,
        totalPiecesCount: 2,
        orderItems: [
          {
            orderItemId: 'oi-1',
            orderId: 'order-1',
            orderNo: 101,
            customerName: 'Customer A',
            widthMm: 400,
            heightMm: 500,
            qty: 2,
            isPolished: false,
          },
        ],
        ordersSummary: [
          {
            orderId: 'order-1',
            orderNo: 101,
            customerName: 'Customer A',
            store: 'mumbai',
            piecesCount: 2,
          },
        ],
      };

      const task2: CuttingQueueTask = {
        orderId: 'order-2',
        orderIds: ['order-2'],
        orderNo: 102,
        orderNos: [102],
        store: 'mumbai',
        customerName: 'Customer B',
        customerPhone: '2222222222',
        productId: 'prod-clear-5',
        productName: 'Clear Glass',
        categoryName: 'Float Glass',
        thicknessMm: 5,
        color: null,
        isLining: false,
        totalPiecesCount: 3,
        orderItems: [
          {
            orderItemId: 'oi-2',
            orderId: 'order-2',
            orderNo: 102,
            customerName: 'Customer B',
            widthMm: 600,
            heightMm: 800,
            qty: 3,
            isPolished: true,
          },
        ],
        ordersSummary: [
          {
            orderId: 'order-2',
            orderNo: 102,
            customerName: 'Customer B',
            store: 'mumbai',
            piecesCount: 3,
          },
        ],
      };

      const merged = mergeCuttingQueueTasks([task1, task2]);

      expect(merged.orderIds).toEqual(['order-1', 'order-2']);
      expect(merged.orderNos).toEqual([101, 102]);
      expect(merged.totalPiecesCount).toBe(5);
      expect(merged.orderItems).toHaveLength(2);
      expect(merged.ordersSummary).toHaveLength(2);
      expect(merged.customerName).toContain('2 Orders');
      expect(merged.customerName).toContain('#101, #102');
    });

    it('returns the same task unmodified if single task provided', () => {
      const singleTask: CuttingQueueTask = {
        orderId: 'order-1',
        orderIds: ['order-1'],
        orderNo: 101,
        orderNos: [101],
        store: 'mumbai',
        customerName: 'Customer A',
        customerPhone: '1111111111',
        productId: 'prod-clear-5',
        productName: 'Clear Glass',
        categoryName: 'Float Glass',
        thicknessMm: 5,
        color: null,
        isLining: false,
        totalPiecesCount: 1,
        orderItems: [],
        ordersSummary: [],
      };

      const result = mergeCuttingQueueTasks([singleTask]);
      expect(result).toBe(singleTask);
    });

    it('correctly sets isPartiallyCut flag if any merged task is partially cut', () => {
      const taskNormal: CuttingQueueTask = {
        orderId: 'order-1',
        orderIds: ['order-1'],
        orderNo: 101,
        orderNos: [101],
        store: 'mumbai',
        customerName: 'Customer A',
        customerPhone: '1111111111',
        productId: 'prod-clear-5',
        productName: 'Clear Glass',
        categoryName: 'Float Glass',
        thicknessMm: 5,
        color: null,
        isLining: false,
        totalPiecesCount: 2,
        isPartiallyCut: false,
        orderItems: [],
      };

      const taskPartial: CuttingQueueTask = {
        orderId: 'order-2',
        orderIds: ['order-2'],
        orderNo: 102,
        orderNos: [102],
        store: 'mumbai',
        customerName: 'Customer B',
        customerPhone: '2222222222',
        productId: 'prod-clear-5',
        productName: 'Clear Glass',
        categoryName: 'Float Glass',
        thicknessMm: 5,
        color: null,
        isLining: false,
        totalPiecesCount: 1,
        isPartiallyCut: true,
        orderItems: [],
      };

      const merged = mergeCuttingQueueTasks([taskNormal, taskPartial]);
      expect(merged.isPartiallyCut).toBe(true);
    });
  });

  describe('findBestPlacementOnSheet', () => {
    const sheet = { width_mm: 2000, height_mm: 1500 };
    const kerf = 3;

    it('places at (0, 0) when sheet is completely empty', () => {
      const pos = findBestPlacementOnSheet(sheet, 400, 500, [], kerf);
      expect(pos).toEqual({ x_mm: 0, y_mm: 0 });
    });

    it('places directly adjacent with kerf next to existing pieces without collision', () => {
      const existing = [{ x_mm: 0, y_mm: 0, w_mm: 500, h_mm: 600 }];
      const pos = findBestPlacementOnSheet(sheet, 400, 300, existing, kerf);

      // Should place below existing at (0, 603) or to the right at (503, 0)
      expect(pos.x_mm >= 503 || pos.y_mm >= 603).toBe(true);

      // Verify no collision with existing
      const hasOverlap = piecesOverlap(
        { x_mm: pos.x_mm, y_mm: pos.y_mm, w_mm: 400, h_mm: 300 },
        existing[0],
        kerf,
      );
      expect(hasOverlap).toBe(false);
    });

    it('stays strictly inside sheet boundaries', () => {
      const existing = [
        { x_mm: 0, y_mm: 0, w_mm: 1200, h_mm: 1400 },
      ];
      // Piece of 700 width can fit to the right (1200 + 3 + 700 = 1903 <= 2000)
      const pos = findBestPlacementOnSheet(sheet, 700, 400, existing, kerf);
      expect(pos.x_mm + 700).toBeLessThanOrEqual(sheet.width_mm);
      expect(pos.y_mm + 400).toBeLessThanOrEqual(sheet.height_mm);
    });
  });

  describe('canFitPieceOnSheet', () => {
    const sheet = { width_mm: 2000, height_mm: 1500 };

    it('returns true when piece fits directly without rotation', () => {
      expect(canFitPieceOnSheet(sheet, { width_mm: 1000, height_mm: 800 })).toBe(true);
    });

    it('returns true when piece fits with 90 degree rotation for standard glass', () => {
      // 1600 exceeds 1500 height, but rotated 1600x1200 fits in 2000x1500
      expect(canFitPieceOnSheet(sheet, { width_mm: 1200, height_mm: 1600 }, false)).toBe(true);
    });

    it('returns false when piece exceeds both dimensions', () => {
      expect(canFitPieceOnSheet(sheet, { width_mm: 2100, height_mm: 1600 }, false)).toBe(false);
    });

    it('disallows rotation for lining glass', () => {
      // For lining glass, width_mm cannot exceed sheet.width_mm and height_mm cannot exceed sheet.height_mm
      expect(canFitPieceOnSheet(sheet, { width_mm: 1200, height_mm: 1600 }, true)).toBe(false);
      expect(canFitPieceOnSheet(sheet, { width_mm: 1200, height_mm: 1400 }, true)).toBe(true);
    });
  });
});
