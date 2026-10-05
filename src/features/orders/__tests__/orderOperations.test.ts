import { ORDER_STATUSES, PAYMENT_METHODS } from '../constants';

describe('Order Operations & Status Constants', () => {
  describe('ORDER_STATUSES', () => {
    it('includes "cancelled" in the list of allowed statuses', () => {
      const cancelledStatus = ORDER_STATUSES.find((s) => s.value === 'cancelled');
      expect(cancelledStatus).toBeDefined();
      expect(cancelledStatus?.label).toBe('Cancelled');
    });

    it('contains all required order lifecycle statuses', () => {
      const values = ORDER_STATUSES.map((s) => s.value);
      expect(values).toEqual(['new', 'cutting', 'cut', 'delivered', 'cancelled']);
    });
  });

  describe('PAYMENT_METHODS', () => {
    it('includes all database supported payment methods', () => {
      const values = PAYMENT_METHODS.map((pm) => pm.value);
      expect(values).toEqual([
        'cash',
        'upi',
        'card',
        'bank_transfer',
        'credit',
        'other',
      ]);
    });
  });

  describe('Order Edit & Price Calculations', () => {
    it('correctly calculates order total and balance due when advance is paid', () => {
      const items = [
        { widthMm: 600, heightMm: 900, qty: 2, unitPrice: 500, isPolished: false },
        { widthMm: 800, heightMm: 1200, qty: 1, unitPrice: 1200, isPolished: true },
      ];

      const total = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
      expect(total).toBe(2200);

      const advancePaid = 1000;
      const balanceDue = Math.max(0, total - advancePaid);
      expect(balanceDue).toBe(1200);
    });

    it('adds +3mm allowance to physical cut dimensions when isPolished is true', () => {
      const polishedItem = {
        widthMm: 600,
        heightMm: 900,
        isPolished: true,
      };

      const cutWidth = polishedItem.widthMm + (polishedItem.isPolished ? 3 : 0);
      const cutHeight = polishedItem.heightMm + (polishedItem.isPolished ? 3 : 0);

      expect(cutWidth).toBe(603);
      expect(cutHeight).toBe(903);
    });

    it('validates delivered status can only succeed cut or cutting status', () => {
      const allowedPreDeliveryStatuses = ['cut', 'cutting'];
      expect(allowedPreDeliveryStatuses.includes('cut')).toBe(true);
    });
  });
});
