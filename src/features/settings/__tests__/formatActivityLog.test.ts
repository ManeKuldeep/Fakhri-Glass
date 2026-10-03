import { formatActivityLog } from '../utils/formatActivityLog';
import type { ActivityLogRow } from '../queries';

function createMockLogRow(overrides: Partial<ActivityLogRow>): ActivityLogRow {
  return {
    id: 1,
    shop_id: 'test-shop-id',
    user_id: 'test-user-id',
    user_name: 'Kuldeep Mane',
    user_assignment: 'mumbai',
    action: 'insert',
    table_name: 'orders',
    record_id: 'rec-1',
    summary: 'Order #1001 · mumbai · new',
    old_data: null,
    new_data: null,
    created_at: '2026-10-03T10:00:00Z',
    ...overrides,
  };
}

describe('formatActivityLog', () => {
  describe('Stock items (Inventory)', () => {
    it('formats sheet removal with product and dimensions', () => {
      const item = createMockLogRow({
        table_name: 'stock_items',
        action: 'update',
        summary: 'Clear Glass 5mm 2440×1220 mm (full, removed)',
        new_data: { status: 'removed' },
        old_data: { status: 'available' },
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('REMOVED');
      expect(formatted.badge.color).toBe('#DC2626');
      expect(formatted.entity).toBe('Inventory');
      expect(formatted.title).toBe('Removed Clear Glass 5mm from Stock');
      expect(formatted.details).toBe('2440 × 1220 mm · Full sheet');
    });

    it('formats sheet addition with offcut details', () => {
      const item = createMockLogRow({
        table_name: 'stock_items',
        action: 'insert',
        summary: 'Tinted Glass 8mm 1200×600 mm (offcut, available)',
        new_data: { status: 'available' },
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('ADDED');
      expect(formatted.badge.color).toBe('#059669');
      expect(formatted.entity).toBe('Inventory');
      expect(formatted.title).toBe('Added Tinted Glass 8mm to Stock');
      expect(formatted.details).toBe('1200 × 600 mm · Offcut');
    });

    it('formats stock update when not removed', () => {
      const item = createMockLogRow({
        table_name: 'stock_items',
        action: 'update',
        summary: 'Clear Glass 5mm 2440×1220 mm (full, available)',
        new_data: { status: 'available' },
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('UPDATED');
      expect(formatted.title).toBe('Updated Clear Glass 5mm');
    });
  });

  describe('Orders', () => {
    it('formats order creation', () => {
      const item = createMockLogRow({
        table_name: 'orders',
        action: 'insert',
        summary: 'Order #1002 · mumbai · new',
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('NEW ORDER');
      expect(formatted.entity).toBe('Orders');
      expect(formatted.title).toBe('Order #1002 Placed');
      expect(formatted.details).toBe('Mumbai Store · Status: New');
    });

    it('formats order status change', () => {
      const item = createMockLogRow({
        table_name: 'orders',
        action: 'update',
        summary: 'Order #1005 · sanpada · in_progress',
        old_data: { status: 'new' },
        new_data: { status: 'in_progress', store: 'sanpada', order_no: 1005 },
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('STATUS');
      expect(formatted.entity).toBe('Orders');
      expect(formatted.title).toBe('Order #1005 Status Updated');
      expect(formatted.details).toBe('Status: In progress · Sanpada Store');
    });
  });

  describe('Order items', () => {
    it('formats added order item with quantity and dimensions', () => {
      const item = createMockLogRow({
        table_name: 'order_items',
        action: 'insert',
        summary: 'Clear Glass 5mm 1200×600 mm, qty 2',
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('ITEM ADDED');
      expect(formatted.entity).toBe('Order Items');
      expect(formatted.title).toBe('Added 2 pcs of Clear Glass 5mm');
      expect(formatted.details).toBe('1200 × 600 mm · Qty: 2');
    });

    it('formats removed order item', () => {
      const item = createMockLogRow({
        table_name: 'order_items',
        action: 'delete',
        summary: 'Mirror 4mm 900×600 mm, qty 1',
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('ITEM REMOVED');
      expect(formatted.title).toBe('Removed Mirror 4mm from Order');
    });
  });

  describe('Customers', () => {
    it('formats new customer added with phone number', () => {
      const item = createMockLogRow({
        table_name: 'customers',
        action: 'insert',
        summary: 'Rajesh Patel',
        new_data: { name: 'Rajesh Patel', phone: '9876543210' },
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('CUSTOMER');
      expect(formatted.entity).toBe('Customers');
      expect(formatted.title).toBe('New Customer: Rajesh Patel');
      expect(formatted.details).toBe('Phone: 9876543210');
    });
  });

  describe('Cut plans', () => {
    it('formats cutting plan log', () => {
      const item = createMockLogRow({
        table_name: 'cut_plans',
        action: 'insert',
        summary: 'Cut plan · Clear Glass 5mm',
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('CUT PLAN');
      expect(formatted.entity).toBe('Cutting');
      expect(formatted.title).toBe('Cut Plan: Clear Glass 5mm');
    });
  });

  describe('System & App events', () => {
    it('formats backup export event', () => {
      const item = createMockLogRow({
        table_name: 'app',
        action: 'event',
        summary: 'Backup exported',
      });

      const formatted = formatActivityLog(item);
      expect(formatted.badge.label).toBe('BACKUP');
      expect(formatted.entity).toBe('System');
      expect(formatted.title).toBe('Shop Data Backup Exported');
    });

    it('formats login and logout events', () => {
      const login = createMockLogRow({
        table_name: 'app',
        action: 'event',
        summary: 'login',
      });
      expect(formatActivityLog(login).title).toBe('User Signed In');

      const logout = createMockLogRow({
        table_name: 'app',
        action: 'event',
        summary: 'logout',
      });
      expect(formatActivityLog(logout).title).toBe('User Signed Out');
    });
  });

  describe('Fallback', () => {
    it('handles unexpected table or action safely', () => {
      const item = createMockLogRow({
        table_name: 'unknown_table',
        action: 'insert',
        summary: 'Something custom happened',
      });

      const formatted = formatActivityLog(item);
      expect(formatted.entity).toBe('Unknown Table');
      expect(formatted.badge.label).toBe('ADDED');
      expect(formatted.title).toBe('Something custom happened');
    });
  });
});
