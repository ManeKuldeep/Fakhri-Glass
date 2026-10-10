import {
  adminClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Stage 2 High-Risk Database Tests (Post-Fix Verification)', () => {
  let shopAId: string;
  let shopBId: string;
  let userA: TestUserSession;
  let userB: TestUserSession;
  let productId: string;

  beforeAll(async () => {
    shopAId = await getOrCreateShop('Fakhri Glass');
    shopBId = await getOrCreateShop('Competitor Glass Test');

    userA = await createTestUserSession(
      'tester-a@fakhriglass.test',
      'Tester Shop A',
      'mumbai',
      shopAId,
    );

    userB = await createTestUserSession(
      'tester-b@competitor.test',
      'Tester Shop B',
      'mumbai',
      shopBId,
    );

    // Get a product from catalogue for shop A
    const { data: prod } = await adminClient
      .from('products')
      .select('id')
      .eq('shop_id', shopAId)
      .eq('is_lining', false)
      .limit(1)
      .single();

    if (!prod) throw new Error('No product found in shop A');
    productId = prod.id;
  });

  // Helper to create an order and available stock sheet for testing
  async function setupOrderWithSheet(qty = 1) {
    // 1. Create customer
    const { data: cust, error: custErr } = await userA.client
      .from('customers')
      .insert({ name: 'High Risk Test Cust', phone: '9876543210' })
      .select('id')
      .single();
    if (custErr || !cust) throw new Error(`Cust create failed: ${custErr?.message}`);

    // 2. Create order via RPC
    const { data: createdRows, error: ordErr } = await userA.client.rpc('create_order_with_items', {
      p_customer_id: cust.id,
      p_store: 'mumbai',
      p_items: [
        {
          product_id: productId,
          width_mm: 500,
          height_mm: 500,
          qty,
          unit_price: 200,
          is_polished: false,
        },
      ],
    });
    if (ordErr || !createdRows || createdRows.length === 0) {
      throw new Error(`Order create failed: ${ordErr?.message}`);
    }

    const orderRecord = createdRows[0];

    const { data: order } = await userA.client
      .from('orders')
      .select('id, order_no, status, order_items(id, qty)')
      .eq('id', orderRecord.id)
      .single();
    if (!order) throw new Error('Failed to fetch created order');

    // 3. Create stock sheet
    const { data: sheet, error: sheetErr } = await userA.client
      .from('stock_items')
      .insert({
        product_id: productId,
        width_mm: 1200,
        height_mm: 1200,
        source: 'full',
      })
      .select('id, width_mm, height_mm, status')
      .single();
    if (sheetErr || !sheet) throw new Error(`Stock create failed: ${sheetErr?.message}`);

    return { customerId: cust.id, order, sheet, orderItemId: order.order_items[0].id };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. BUG-01 FIXED: cancel_order and update_order_with_items write type='revert'
  // ─────────────────────────────────────────────────────────────────────────────
  describe('BUG-01 Fixed: cancel_order and update_order_with_items with cut plans', () => {
    it('cancels an order with confirmed cut plans: consumed sheets restored, offcuts marked removed, revert logged', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      // Confirm cut plan with a generated offcut
      const { data: planIds, error: confErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [
          {
            parent_id: sheet.id,
            width_mm: 600,
            height_mm: 1200,
          },
        ],
      });
      expect(confErr).toBeNull();
      expect(planIds).toBeDefined();

      // Check sheet was consumed
      const { data: consumedSheet } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet.id)
        .single();
      expect(consumedSheet?.status).toBe('consumed');

      // Fetch the generated offcut
      const { data: offcuts } = await userA.client
        .from('stock_items')
        .select('id, status')
        .eq('parent_id', sheet.id);
      expect(offcuts).toHaveLength(1);
      expect(offcuts![0].status).toBe('available');
      const offcutId = offcuts![0].id;

      // Cancel the order — must now succeed cleanly with fix_revert_type migration!
      const { error: cancelErr } = await userA.client.rpc('cancel_order', {
        p_order_id: order.id,
      });
      expect(cancelErr).toBeNull();

      // Assert: Consumed sheet is restored to available
      const { data: restoredSheet } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet.id)
        .single();
      expect(restoredSheet?.status).toBe('available');

      // Assert: Generated offcut is marked removed
      const { data: removedOffcut } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', offcutId)
        .single();
      expect(removedOffcut?.status).toBe('removed');

      // Assert: Order status is cancelled and plans deleted
      const { data: finalOrder } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(finalOrder?.status).toBe('cancelled');

      const { data: plansAfter } = await userA.client
        .from('cut_plans')
        .select('id')
        .eq('order_id', order.id);
      expect(plansAfter).toHaveLength(0);

      // Assert: 'revert' rows exist in stock_movements
      const { data: revertMovements } = await userA.client
        .from('stock_movements')
        .select('id, type, stock_item_id')
        .eq('ref_id', order.id)
        .eq('type', 'revert');
      expect(revertMovements!.length).toBeGreaterThan(0);
    });

    it('edits an order that has cut plans via update_order_with_items and restores stock and removes offcuts', async () => {
      const { order, sheet, orderItemId, customerId } = await setupOrderWithSheet(1);

      // Confirm cut plan with an offcut
      await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [
          {
            parent_id: sheet.id,
            width_mm: 600,
            height_mm: 1200,
          },
        ],
      });

      // Verify offcut was created
      const { data: offcuts } = await userA.client
        .from('stock_items')
        .select('id, status')
        .eq('parent_id', sheet.id);
      expect(offcuts).toHaveLength(1);
      const offcutId = offcuts![0].id;

      // Update order with new dimensions
      const { error: updateErr } = await userA.client.rpc('update_order_with_items', {
        p_order_id: order.id,
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_payment_method: 'cash',
        p_notes: 'Edited order',
        p_items: [
          {
            product_id: productId,
            width_mm: 600,
            height_mm: 600,
            qty: 1,
            unit_price: 250,
            is_polished: false,
          },
        ],
      });
      expect(updateErr).toBeNull();

      // Consumed sheet restored to available
      const { data: restoredSheet } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet.id)
        .single();
      expect(restoredSheet?.status).toBe('available');

      // Generated offcut marked removed
      const { data: removedOffcut } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', offcutId)
        .single();
      expect(removedOffcut?.status).toBe('removed');

      // Order status reset to new
      const { data: updatedOrder } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(updatedOrder?.status).toBe('new');

      // Revert ledger entries exist
      const { data: revertMovements } = await userA.client
        .from('stock_movements')
        .select('id, type')
        .eq('ref_id', order.id)
        .eq('type', 'revert');
      expect(revertMovements!.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. BUG-05 / CONF-16 FIXED: confirm_batch_cut_plan rejects cancelled, delivered or cut orders
  // ─────────────────────────────────────────────────────────────────────────────
  describe('BUG-05 / CONF-16 Fixed: confirm_batch_cut_plan status guard', () => {
    it('rejects cut confirmation on a cancelled order without changing stock, cut plans, or status', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      // Cancel order
      await userA.client.rpc('cancel_order', { p_order_id: order.id });

      // Attempt to confirm cut plan on the cancelled order
      const { error: confErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      // Must be rejected by the new guard!
      expect(confErr).not.toBeNull();
      expect(confErr!.message).toContain('Cannot cut an order that is cancelled, delivered or already fully cut');

      // Assert NO stock was consumed
      const { data: sheetAfter } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet.id)
        .single();
      expect(sheetAfter?.status).toBe('available');

      // Assert NO cut plans created
      const { data: plans } = await userA.client
        .from('cut_plans')
        .select('id')
        .eq('order_id', order.id);
      expect(plans).toHaveLength(0);

      // Assert NO cut pieces created
      const { data: pieces } = await userA.client
        .from('cut_pieces')
        .select('id')
        .eq('order_item_id', orderItemId);
      expect(pieces).toHaveLength(0);

      // Assert order status remained cancelled
      const { data: orderAfter } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(orderAfter?.status).toBe('cancelled');
    });

    it('rejects cut confirmation on a delivered order without modifying stock or status', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      // Directly mark order delivered
      await userA.client.from('orders').update({ status: 'delivered' }).eq('id', order.id);

      const { error: confErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      expect(confErr).not.toBeNull();
      expect(confErr!.message).toContain('Cannot cut an order that is cancelled, delivered or already fully cut');

      // Assert NO stock was consumed
      const { data: sheetAfter } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet.id)
        .single();
      expect(sheetAfter?.status).toBe('available');

      // Assert NO cut plans created
      const { data: plans } = await userA.client
        .from('cut_plans')
        .select('id')
        .eq('order_id', order.id);
      expect(plans).toHaveLength(0);

      // Assert NO cut pieces created
      const { data: pieces } = await userA.client
        .from('cut_pieces')
        .select('id')
        .eq('order_item_id', orderItemId);
      expect(pieces).toHaveLength(0);

      // Assert order status remained delivered
      const { data: orderAfter } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(orderAfter?.status).toBe('delivered');
    });

    it('rejects cut confirmation on an already fully cut order without modifying stock or status', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      // 1. Cut the piece normally so order reaches 'cut'
      const { error: cutErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });
      expect(cutErr).toBeNull();

      const { data: orderStatusBefore } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(orderStatusBefore?.status).toBe('cut');

      // 2. Create another sheet
      const { data: sheet2 } = await userA.client
        .from('stock_items')
        .insert({
          product_id: productId,
          width_mm: 1200,
          height_mm: 1200,
          source: 'full',
        })
        .select('id, status')
        .single();

      // 3. Attempt second cut confirmation on the already fully cut order
      const { error: secondCutErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet2!.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      expect(secondCutErr).not.toBeNull();
      expect(secondCutErr!.message).toContain('Cannot cut an order that is cancelled, delivered or already fully cut');

      // Assert sheet2 was NOT consumed
      const { data: sheet2After } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet2!.id)
        .single();
      expect(sheet2After?.status).toBe('available');

      // Assert cut_plans count did not increase (still exactly 1 from the first cut)
      const { data: plans } = await userA.client
        .from('cut_plans')
        .select('id')
        .eq('order_id', order.id);
      expect(plans).toHaveLength(1);

      // Assert cut_pieces count did not increase (still exactly 1)
      const { data: pieces } = await userA.client
        .from('cut_pieces')
        .select('id')
        .eq('order_item_id', orderItemId);
      expect(pieces).toHaveLength(1);

      // Assert order status remained 'cut'
      const { data: orderAfter } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(orderAfter?.status).toBe('cut');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Regression Check: confirm on 'new' and 'cutting' orders still works
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Regression Check: Normal cut confirmations on new and cutting orders', () => {
    it('successfully cuts an order in new state and in cutting state across partial sessions', async () => {
      // Order with qty = 2
      const { order, sheet, orderItemId } = await setupOrderWithSheet(2);

      // Session 1: Cut 1 piece (partial cut on order in 'new' state)
      const { error: firstErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });
      expect(firstErr).toBeNull();

      // Verify order moved to 'cutting'
      const { data: orderStep1 } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(orderStep1?.status).toBe('cutting');

      // Create a second sheet for Session 2
      const { data: sheet2 } = await userA.client
        .from('stock_items')
        .insert({
          product_id: productId,
          width_mm: 1200,
          height_mm: 1200,
          source: 'full',
        })
        .select('id')
        .single();

      // Session 2: Cut second piece on order while in 'cutting' status
      const { error: secondErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet2!.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });
      expect(secondErr).toBeNull();

      // Verify order moved to 'cut'
      const { data: orderStep2 } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();
      expect(orderStep2?.status).toBe('cut');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Race Condition: cancel_order vs confirm_batch_cut_plan consistency
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Race Condition: cancel_order concurrent with confirm_batch_cut_plan', () => {
    it('always resolves to a consistent state with no stock consumed for a cancelled order', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      // Launch cancel_order and confirm_batch_cut_plan concurrently
      const cancelPromise = userA.client.rpc('cancel_order', { p_order_id: order.id });
      const confirmPromise = userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      const [cancelRes, confirmRes] = await Promise.all([cancelPromise, confirmPromise]);

      // Check final state
      const { data: finalOrder } = await userA.client
        .from('orders')
        .select('status')
        .eq('id', order.id)
        .single();

      const { data: finalSheet } = await userA.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet.id)
        .single();

      // Invariant: Because PostgreSQL serializes row locks on orders table,
      // either:
      // A) cancel ran first: confirm was rejected by the guard, order is cancelled, stock is available.
      // B) confirm ran first: cut succeeded, and then cancel ran and reverted the stock to available.
      // In NO scenario is stock consumed for a cancelled order!
      expect(finalOrder?.status).toBe('cancelled');
      expect(finalSheet?.status).toBe('available');

      if (confirmRes.error) {
        expect(confirmRes.error.message).toContain('Cannot cut an order that is cancelled, delivered or already fully cut');
      } else {
        expect(cancelRes.error).toBeNull();
        const { data: revertMovements } = await userA.client
          .from('stock_movements')
          .select('id, type')
          .eq('ref_id', order.id)
          .eq('type', 'revert');
        expect(revertMovements!.length).toBeGreaterThan(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CONF-17: Cumulative cut pieces quantity validation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('CONF-17: Cumulative cut piece count validation across multiple cut sessions', () => {
    it('rejects confirmation if cumulative cut pieces exceed ordered quantity', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      // First confirmation consumes 1 piece
      const { error: firstErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });
      expect(firstErr).toBeNull();

      const { data: sheet2 } = await userA.client
        .from('stock_items')
        .insert({
          product_id: productId,
          width_mm: 1200,
          height_mm: 1200,
          source: 'full',
        })
        .select('id')
        .single();

      // Second confirmation attempt trying to cut an additional piece
      const { error: secondErr } = await userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet2!.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      expect(secondErr).not.toBeNull();
      // Refused either by piece count exceeds ordered quantity OR cannot cut already fully cut order
      expect(secondErr!.message).toMatch(/(exceeds ordered quantity|cannot cut an order)/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Concurrency (CONF-15): Concurrent plan confirmation on same sheet
  // ─────────────────────────────────────────────────────────────────────────────
  describe('CONF-15: Concurrency race condition on same stock sheet', () => {
    it('allows exactly one session to succeed when two sessions confirm using the same sheet simultaneously', async () => {
      const setup1 = await setupOrderWithSheet(1);
      const setup2 = await setupOrderWithSheet(1);
      const sharedSheetId = setup1.sheet.id;

      const promise1 = userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [setup1.order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: setup1.order.id,
            order_item_id: setup1.orderItemId,
            stock_item_id: sharedSheetId,
            x_mm: 0,
            y_mm: 0,
            w_mm: 400,
            h_mm: 400,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      const promise2 = userA.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [setup2.order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: setup2.order.id,
            order_item_id: setup2.orderItemId,
            stock_item_id: sharedSheetId,
            x_mm: 0,
            y_mm: 0,
            w_mm: 400,
            h_mm: 400,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      const [res1, res2] = await Promise.all([promise1, promise2]);

      const successes = [res1, res2].filter((r) => r.error === null);
      const failures = [res1, res2].filter((r) => r.error !== null);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].error!.message).toContain('no longer available');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Multi-Tenant Security & Isolation (SEC-03, CONF-11)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Multi-Tenant RLS & Shop Isolation (SEC-03, CONF-11)', () => {
    it('isolates data between Shop A and Shop B (SEC-03)', async () => {
      const { data: ordersB } = await userB.client.from('orders').select('id');
      expect(ordersB).toHaveLength(0);

      const { data: ordersA } = await userA.client.from('orders').select('id');
      expect(ordersA!.length).toBeGreaterThan(0);
    });

    it('rejects confirm_batch_cut_plan when called by a user from another shop (CONF-11)', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      const { error } = await userB.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [order.id],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: order.id,
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 400,
            h_mm: 400,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/not found or do not belong to your shop/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Direct UPDATE Grants Known Risk (SEC-14)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SEC-14: Direct UPDATE on stock_items and orders (Known Risk Test)', () => {
    it('documents that authenticated role holds direct UPDATE privileges on stock_items and orders', async () => {
      const { order, sheet } = await setupOrderWithSheet(1);

      const { error: stockErr } = await userA.client
        .from('stock_items')
        .update({ status: 'consumed' })
        .eq('id', sheet.id);

      expect(stockErr).toBeNull();

      const { error: ordErr } = await userA.client
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', order.id);

      expect(ordErr).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. confirm_cut_plan backward-compatible wrapper
  // ─────────────────────────────────────────────────────────────────────────────
  describe('confirm_cut_plan backward-compatible wrapper', () => {
    it('executes confirm_cut_plan wrapper cleanly', async () => {
      const { order, sheet, orderItemId } = await setupOrderWithSheet(1);

      const { data: planId, error } = await userA.client.rpc('confirm_cut_plan', {
        p_order_id: order.id,
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_item_id: orderItemId,
            stock_item_id: sheet.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      expect(error).toBeNull();
      expect(planId).toBeDefined();
    });
  });
});
