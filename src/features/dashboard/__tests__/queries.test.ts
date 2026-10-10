import { fetchLowStock } from '../queries';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('fetchLowStock', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('flags demanded products in active orders as out_of_stock when available stock is 0', async () => {
    const fromMock = supabase.from as unknown as jest.Mock;

    fromMock.mockImplementation((table: string) => {
      if (table === 'low_stock') {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  product_id: 'prod-1',
                  name: 'Clear 5mm',
                  min_stock_sheets: 5,
                  sheets: 2,
                },
              ],
              error: null,
            }),
          }),
        };
      }

      if (table === 'orders') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'ord-101',
                  order_no: 101,
                  status: 'new',
                  order_items: [
                    {
                      id: 'oi-1',
                      product_id: 'prod-zero',
                      qty: 2,
                      product: {
                        id: 'prod-zero',
                        name: 'Frosted 8mm',
                        thickness_mm: 8,
                        min_stock_sheets: 0,
                        category: { name: 'Frosted' },
                      },
                    },
                  ],
                },
              ],
              error: null,
            }),
          }),
        };
      }

      if (table === 'stock_items') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [], // 0 available stock for prod-zero
                error: null,
              }),
            }),
          }),
        };
      }

      return {};
    });

    const items = await fetchLowStock();

    expect(items).toHaveLength(2);

    const frosted = items.find((i) => i.product_id === 'prod-zero');
    expect(frosted).toBeDefined();
    expect(frosted?.reason).toBe('out_of_stock');
    expect(frosted?.sheets).toBe(0);
    expect(frosted?.pending_orders_count).toBe(1);

    const clear = items.find((i) => i.product_id === 'prod-1');
    expect(clear).toBeDefined();
    expect(clear?.reason).toBe('min_stock_breach');
    expect(clear?.sheets).toBe(2);
  });
});
