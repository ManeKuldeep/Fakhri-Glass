import {
  adminClient,
  createAnonClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Cutting & Cut Plan Confirmation Database Tests (CONF-03..06, CONF-09..10, CONF-12..14)', () => {
  let shopId: string;
  let user: TestUserSession;
  let productId: string;
  let liningProductId: string;

  beforeAll(async () => {
    shopId = await getOrCreateShop('Fakhri Glass');
    user = await createTestUserSession(
      'cutting-tester@fakhriglass.test',
      'Cutting Tester',
      'mumbai',
      shopId,
    );

    const { data: nonLining } = await adminClient
      .from('products')
      .select('id')
      .eq('shop_id', shopId)
      .eq('is_lining', false)
      .limit(1)
      .single();
    if (!nonLining) throw new Error('No non-lining product found');
    productId = nonLining.id;

    const { data: lining } = await adminClient
      .from('products')
      .select('id')
      .eq('shop_id', shopId)
      .eq('is_lining', true)
      .limit(1)
      .single();
    if (!lining) throw new Error('No lining product found');
    liningProductId = lining.id;
  });

  async function createOrder(qty = 1, prodId = productId) {
    const { data: cust } = await user.client
      .from('customers')
      .insert({ name: 'Cutting Customer', phone: '9876500000' })
      .select('id')
      .single();

    const { data: created } = await user.client.rpc('create_order_with_items', {
      p_customer_id: cust!.id,
      p_store: 'mumbai',
      p_items: [
        {
          product_id: prodId,
          width_mm: 500,
          height_mm: 500,
          qty,
          unit_price: 200,
          is_polished: false,
        },
      ],
    });

    const { data: order } = await user.client
      .from('orders')
      .select('id, order_items(id, qty)')
      .eq('id', created![0].id)
      .single();

    return { orderId: order!.id, orderItemId: order!.order_items[0].id };
  }

  async function createStockSheet(prodId = productId, isLining = false) {
    const { data: sheet } = await user.client
      .from('stock_items')
      .insert({
        product_id: prodId,
        width_mm: 1200,
        height_mm: 1200,
        source: 'full',
        vertical_line_height_mm: isLining ? 1200 : null,
      })
      .select('id')
      .single();
    return sheet!.id;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-03: Unavailable Sheet Rejected
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-03: Rejects confirm_batch_cut_plan referencing consumed sheet', async () => {
    const { orderId, orderItemId } = await createOrder(1);
    const sheetId = await createStockSheet();

    // Mark sheet consumed beforehand
    await user.client.from('stock_items').update({ status: 'consumed' }).eq('id', sheetId);

    const { error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [orderId],
      p_product_id: productId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [
        {
          order_id: orderId,
          order_item_id: orderItemId,
          stock_item_id: sheetId,
          x_mm: 0,
          y_mm: 0,
          w_mm: 500,
          h_mm: 500,
          rotated: false,
        },
      ],
      p_offcuts: [],
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('no longer available');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-04: Offcut with Wrong Parent Rejected
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-04: Rejects confirm_batch_cut_plan when offcut parent is not one of consumed sheets', async () => {
    const { orderId, orderItemId } = await createOrder(1);
    const sheetId = await createStockSheet();
    const unrelatedSheetId = await createStockSheet();

    const { error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [orderId],
      p_product_id: productId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [
        {
          order_id: orderId,
          order_item_id: orderItemId,
          stock_item_id: sheetId,
          x_mm: 0,
          y_mm: 0,
          w_mm: 500,
          h_mm: 500,
          rotated: false,
        },
      ],
      p_offcuts: [
        {
          parent_id: unrelatedSheetId, // Not the consumed sheet!
          width_mm: 600,
          height_mm: 1200,
        },
      ],
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('Offcut parent sheet is not one of the consumed sheets');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-06: Offcut Creation with Copied Lining Properties
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-06: Creates offcut inheriting parent vertical_line_height_mm on lining glass', async () => {
    const { orderId, orderItemId } = await createOrder(1, liningProductId);
    const sheetId = await createStockSheet(liningProductId, true);

    const { data: planIds, error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [orderId],
      p_product_id: liningProductId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [
        {
          order_id: orderId,
          order_item_id: orderItemId,
          stock_item_id: sheetId,
          x_mm: 0,
          y_mm: 0,
          w_mm: 500,
          h_mm: 500,
          rotated: false,
        },
      ],
      p_offcuts: [
        {
          parent_id: sheetId,
          width_mm: 600,
          height_mm: 1200,
        },
      ],
    });

    expect(error).toBeNull();
    expect(planIds).toBeDefined();

    // Verify offcut row in stock_items
    const { data: offcuts } = await user.client
      .from('stock_items')
      .select('*')
      .eq('parent_id', sheetId);

    expect(offcuts).toHaveLength(1);
    expect(offcuts![0].source).toBe('offcut');
    expect(offcuts![0].status).toBe('available');
    expect(offcuts![0].vertical_line_height_mm).toBe(1200); // Inherited from parent
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-09 & CONF-10: Stock Movements Ledger Entries
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-09 & CONF-10: Records consume and offcut_created ledger rows in stock_movements', async () => {
    const { orderId, orderItemId } = await createOrder(1);
    const sheetId = await createStockSheet();

    const { data: planIds, error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [orderId],
      p_product_id: productId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [
        {
          order_id: orderId,
          order_item_id: orderItemId,
          stock_item_id: sheetId,
          x_mm: 0,
          y_mm: 0,
          w_mm: 500,
          h_mm: 500,
          rotated: false,
        },
      ],
      p_offcuts: [
        {
          parent_id: sheetId,
          width_mm: 600,
          height_mm: 1200,
        },
      ],
    });
    expect(error).toBeNull();

    // Verify 'consume' row in stock_movements (CONF-09)
    const { data: consumeRows } = await user.client
      .from('stock_movements')
      .select('*')
      .eq('stock_item_id', sheetId)
      .eq('type', 'consume')
      .eq('ref_id', orderId);
    expect(consumeRows).toHaveLength(1);

    // Verify 'offcut_created' row in stock_movements (CONF-10)
    const { data: offcutRows } = await user.client
      .from('stock_movements')
      .select('*')
      .eq('type', 'offcut_created')
      .eq('ref_id', planIds![0]);
    expect(offcutRows).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-12: Unauthenticated Rejected
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-12: Rejects confirm_batch_cut_plan from unauthenticated caller', async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc('confirm_batch_cut_plan', {
      p_order_ids: ['00000000-0000-0000-0000-000000000000'],
      p_product_id: productId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [],
      p_offcuts: [],
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission denied|not authenticated/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-13: Pieces Not Belonging to Order Rejected
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-13: Rejects pieces referencing order_item from a different order', async () => {
    const order1 = await createOrder(1);
    const order2 = await createOrder(1);
    const sheetId = await createStockSheet();

    // Confirm cut plan specifying order1 in p_order_ids, but piece references order2 item
    const { error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [order1.orderId],
      p_product_id: productId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [
        {
          order_id: order1.orderId,
          order_item_id: order2.orderItemId, // Mismatched order item!
          stock_item_id: sheetId,
          x_mm: 0,
          y_mm: 0,
          w_mm: 500,
          h_mm: 500,
          rotated: false,
        },
      ],
      p_offcuts: [],
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('do not belong to the selected orders and product');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONF-14: Batch Multiple Orders on One Sheet
  // ─────────────────────────────────────────────────────────────────────────────
  it('CONF-14: Confirms batch cut plan with pieces from multiple orders on one shared sheet', async () => {
    const order1 = await createOrder(1);
    const order2 = await createOrder(1);
    const sharedSheetId = await createStockSheet();

    const { data: planIds, error } = await user.client.rpc('confirm_batch_cut_plan', {
      p_order_ids: [order1.orderId, order2.orderId],
      p_product_id: productId,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [
        {
          order_id: order1.orderId,
          order_item_id: order1.orderItemId,
          stock_item_id: sharedSheetId,
          x_mm: 0,
          y_mm: 0,
          w_mm: 400,
          h_mm: 400,
          rotated: false,
        },
        {
          order_id: order2.orderId,
          order_item_id: order2.orderItemId,
          stock_item_id: sharedSheetId,
          x_mm: 405,
          y_mm: 0,
          w_mm: 400,
          h_mm: 400,
          rotated: false,
        },
      ],
      p_offcuts: [],
    });

    expect(error).toBeNull();
    // Returns 2 cut_plans (one for each order)
    expect(planIds).toHaveLength(2);

    // Verify shared sheet is consumed exactly once
    const { data: sheet } = await user.client
      .from('stock_items')
      .select('status')
      .eq('id', sharedSheetId)
      .single();
    expect(sheet?.status).toBe('consumed');

    // Both orders have status='cut'
    const { data: o1 } = await user.client.from('orders').select('status').eq('id', order1.orderId).single();
    const { data: o2 } = await user.client.from('orders').select('status').eq('id', order2.orderId).single();
    expect(o1?.status).toBe('cut');
    expect(o2?.status).toBe('cut');
  });
});
