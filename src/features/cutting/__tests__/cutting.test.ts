jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useCuttingSettingsStore } from '../stores/cuttingSettingsStore';
import { DEFAULT_OPTIMIZER_SETTINGS } from '../../../optimizer/types';
import { piecesOverlap } from '../../../optimizer/validation';
import { friendlyConfirmCutError } from '../utils';

describe('Cutting Feature Logic, Store & Error Translation Tests', () => {
  beforeEach(() => {
    useCuttingSettingsStore.getState().resetSettings();
  });

  describe('Settings Store', () => {
    it('initializes with default optimizer settings (0mm kerf, 500mm min offcut, 20% max wastage)', () => {
      const settings = useCuttingSettingsStore.getState().settings;
      expect(settings.kerf_mm).toBe(DEFAULT_OPTIMIZER_SETTINGS.kerf_mm);
      expect(settings.kerf_mm).toBe(0);
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
      expect(useCuttingSettingsStore.getState().settings.kerf_mm).toBe(0);
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
});
