import {
  adminClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Database Edge Case Tests (EDGE-07..11)', () => {
  let shopId: string;
  let user: TestUserSession;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    shopId = await getOrCreateShop('Fakhri Glass');
    user = await createTestUserSession(
      'edge-tester@fakhriglass.test',
      'Edge Tester',
      'mumbai',
      shopId,
    );

    const { data: prod } = await adminClient
      .from('products')
      .select('id')
      .eq('shop_id', shopId)
      .eq('is_lining', false)
      .limit(1)
      .single();
    if (!prod) throw new Error('No product found');
    productId = prod.id;

    const { data: cust } = await user.client
      .from('customers')
      .insert({ name: 'Edge Case Customer', phone: `9800${Date.now().toString().slice(-6)}` })
      .select('id')
      .single();
    customerId = cust!.id;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE-07: Jumbo Sheet Dimensions
  // ─────────────────────────────────────────────────────────────────────────────
  it('EDGE-07: Stores jumbo glass sheet dimensions (6000 × 3210 mm) as integers without loss', async () => {
    const { data: sheet, error } = await user.client
      .from('stock_items')
      .insert({
        product_id: productId,
        width_mm: 6000,
        height_mm: 3210,
        source: 'full',
      })
      .select('width_mm, height_mm')
      .single();

    expect(error).toBeNull();
    expect(sheet?.width_mm).toBe(6000);
    expect(sheet?.height_mm).toBe(3210);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE-08: High Total Price & Quantity
  // ─────────────────────────────────────────────────────────────────────────────
  it('EDGE-08: Calculates high total amount without overflow or rounding error', async () => {
    // 50 pieces at ₹150,000 each = ₹7,500,000
    const { data: created, error } = await user.client.rpc('create_order_with_items', {
      p_customer_id: customerId,
      p_store: 'mumbai',
      p_items: [
        {
          product_id: productId,
          width_mm: 2000,
          height_mm: 2000,
          qty: 50,
          unit_price: 150000,
          is_polished: true,
        },
      ],
    });

    expect(error).toBeNull();
    const orderId = created![0].id;

    const { data: order } = await user.client
      .from('orders')
      .select('total')
      .eq('id', orderId)
      .single();

    expect(order?.total).toBe(7500000);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE-09: Order with Many Items
  // ─────────────────────────────────────────────────────────────────────────────
  it('EDGE-09: Creates order with 20 items atomically', async () => {
    const items = Array.from({ length: 20 }).map((_, i) => ({
      product_id: productId,
      width_mm: 300 + i * 10,
      height_mm: 400 + i * 10,
      qty: 1,
      unit_price: 100 + i * 10,
      is_polished: i % 2 === 0,
    }));

    const expectedTotal = items.reduce((sum, item) => sum + item.unit_price * item.qty, 0);

    const { data: created, error } = await user.client.rpc('create_order_with_items', {
      p_customer_id: customerId,
      p_store: 'sanpada',
      p_items: items,
    });

    expect(error).toBeNull();
    const orderId = created![0].id;

    const { data: order } = await user.client
      .from('orders')
      .select('total, order_items(id)')
      .eq('id', orderId)
      .single();

    expect(order?.order_items).toHaveLength(20);
    expect(order?.total).toBe(expectedTotal);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE-10: Smallest Piece Dimensions (1 × 1 mm)
  // ─────────────────────────────────────────────────────────────────────────────
  it('EDGE-10: Accepts order item with smallest dimension (1 × 1 mm)', async () => {
    const { data: created, error } = await user.client.rpc('create_order_with_items', {
      p_customer_id: customerId,
      p_store: 'mumbai',
      p_items: [
        {
          product_id: productId,
          width_mm: 1,
          height_mm: 1,
          qty: 1,
          unit_price: 10,
          is_polished: false,
        },
      ],
    });

    expect(error).toBeNull();
    const orderId = created![0].id;

    const { data: item } = await user.client
      .from('order_items')
      .select('width_mm, height_mm')
      .eq('order_id', orderId)
      .single();

    expect(item?.width_mm).toBe(1);
    expect(item?.height_mm).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE-11: Exact-Fit Piece (Zero Margin Layout)
  // ─────────────────────────────────────────────────────────────────────────────
  it('EDGE-11: Confirms cut plan for a piece that exactly matches stock sheet dimensions', async () => {
    const { data: created } = await user.client.rpc('create_order_with_items', {
      p_customer_id: customerId,
      p_store: 'mumbai',
      p_items: [
        {
          product_id: productId,
          width_mm: 800,
          height_mm: 800,
          qty: 1,
          unit_price: 200,
          is_polished: false,
        },
      ],
    });
    const orderId = created![0].id;

    const { data: order } = await user.client
      .from('orders')
      .select('order_items(id)')
      .eq('id', orderId)
      .single();
    const orderItemId = order!.order_items[0].id;

    // Sheet exactly 800 × 800 mm
    const { data: sheet } = await user.client
      .from('stock_items')
      .insert({
        product_id: productId,
        width_mm: 800,
        height_mm: 800,
        source: 'full',
      })
      .select('id')
      .single();

    const { data: planIds, error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [orderId],
      p_product_id: productId,
      p_kerf_mm: 0,
      p_max_wastage_pct: 0,
      p_pieces: [
        {
          order_id: orderId,
          order_item_id: orderItemId,
          stock_item_id: sheet!.id,
          x_mm: 0,
          y_mm: 0,
          w_mm: 800,
          h_mm: 800,
          rotated: false,
        },
      ],
      p_offcuts: [],
    });

    expect(error).toBeNull();
    expect(planIds).toBeDefined();

    const { data: sheetAfter } = await user.client
      .from('stock_items')
      .select('status')
      .eq('id', sheet!.id)
      .single();
    expect(sheetAfter?.status).toBe('consumed');
  });
});
