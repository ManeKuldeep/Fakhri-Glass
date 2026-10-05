import { groupActivityLogs } from '../utils/groupActivityLogs';
import type { ActivityLogRow } from '../queries';

describe('groupActivityLogs tests', () => {
  it('groups multiple events for the same order into 1 consolidated record', () => {
    const rawLogs: ActivityLogRow[] = [
      {
        id: 101,
        shop_id: 'shop-1',
        user_id: 'user-1',
        user_name: 'Murtuza',
        user_assignment: 'mumbai',
        action: 'event',
        table_name: '',
        record_id: '',
        summary: 'Order #1042 marked as delivered',
        old_data: null,
        new_data: null,
        created_at: '2026-10-05T12:00:00Z',
      },
      {
        id: 102,
        shop_id: 'shop-1',
        user_id: 'user-2',
        user_name: 'Hussain',
        user_assignment: 'cutter',
        action: 'event',
        table_name: '',
        record_id: '',
        summary: 'Labels printed for order #1042',
        old_data: null,
        new_data: null,
        created_at: '2026-10-05T11:00:00Z',
      },
      {
        id: 103,
        shop_id: 'shop-1',
        user_id: 'user-2',
        user_name: 'Hussain',
        user_assignment: 'cutter',
        action: 'insert',
        table_name: 'cut_plans',
        record_id: 'plan-1',
        summary: 'Cut plan confirmed for order #1042',
        old_data: null,
        new_data: { order_id: 'order-uuid-1042' },
        created_at: '2026-10-05T10:30:00Z',
      },
      {
        id: 104,
        shop_id: 'shop-1',
        user_id: 'user-1',
        user_name: 'Murtuza',
        user_assignment: 'mumbai',
        action: 'insert',
        table_name: 'orders',
        record_id: 'order-uuid-1042',
        summary: 'Order #1042 (new, mumbai, 2 items)',
        old_data: null,
        new_data: {
          order_no: 1042,
          customer_name: 'Mustafa Bhai',
          store: 'mumbai',
          status: 'new',
        },
        created_at: '2026-10-05T10:00:00Z',
      },
      {
        id: 105,
        shop_id: 'shop-1',
        user_id: 'user-3',
        user_name: 'Qutub',
        user_assignment: 'sanpada',
        action: 'insert',
        table_name: 'stock_items',
        record_id: 'stock-1',
        summary: 'Clear Glass 5mm 2440×1220 mm (full, available)',
        old_data: null,
        new_data: {
          status: 'available',
        },
        created_at: '2026-10-05T09:00:00Z',
      },
    ];

    const grouped = groupActivityLogs(rawLogs);

    // Expect 2 items: 1 consolidated Order #1042 group + 1 single stock item
    expect(grouped.length).toBe(2);

    const orderGroup = grouped[0];
    expect(orderGroup.type).toBe('order_group');
    if (orderGroup.type === 'order_group') {
      expect(orderGroup.orderNo).toBe(1042);
      expect(orderGroup.events.length).toBe(4);
      expect(orderGroup.customerName).toBe('Mustafa Bhai');
      expect(orderGroup.store).toBe('mumbai');
      expect(orderGroup.latestUser).toBe('Murtuza');
    }

    const singleItem = grouped[1];
    expect(singleItem.type).toBe('single');
    if (singleItem.type === 'single') {
      expect(singleItem.log.table_name).toBe('stock_items');
    }
  });
});
