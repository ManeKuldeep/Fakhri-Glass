import {
  adminClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Orders, Atomicity & Mutations Database Tests (ORD-01..11, ORD-18..21, ORD-24..29, ORD-31, ATOM-02..04)', () => {
  let shopId: string;
  let user: TestUserSession;
  let productId: string;
  let customerId: string;
  let customerPhone: string;

  beforeAll(async () => {
    shopId = await getOrCreateShop('Fakhri Glass');
    user = await createTestUserSession(
      'ord-tester@fakhriglass.test',
      'Orders Tester',
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

    customerPhone = `9988${Date.now().toString().slice(-6)}`;
    const { data: cust, error: custErr } = await user.client
      .from('customers')
      .insert({ name: 'Order Test Customer', phone: customerPhone })
      .select('id')
      .single();
    if (custErr || !cust) throw new Error(`Customer create failed: ${custErr?.message}`);
    customerId = cust.id;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-01 & ORD-02: Store NOT NULL and Check Constraint ('mumbai' | 'sanpada')
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-01 & ORD-02: Store Validations', () => {
    it('ORD-01: Rejects order creation with NULL store', async () => {
      const { error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: null as unknown as string,
        p_items: [
          {
            product_id: productId,
            width_mm: 500,
            height_mm: 500,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/store|null/i);
    });

    it('ORD-02: Rejects order creation with store="cutter" (check constraint)', async () => {
      const { error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'cutter',
        p_items: [
          {
            product_id: productId,
            width_mm: 500,
            height_mm: 500,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-04..06 & ATOM-03: Order Creation Atomicity and Total Calculation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-04..06 & ATOM-03: Order Creation & Total Calculation', () => {
    it('ORD-05: Rejects order creation with empty items array', async () => {
      const { error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toContain('at least one item');
    });

    it('ORD-04 & ORD-06 & ATOM-03: Creates order and items atomically and calculates total correctly', async () => {
      // 2 items: (qty=2, price=150 = 300) + (qty=3, price=200 = 600) -> total = 900
      const { data: created, error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_payment_method: 'upi',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 500,
            qty: 2,
            unit_price: 150,
            is_polished: false,
          },
          {
            product_id: productId,
            width_mm: 600,
            height_mm: 700,
            qty: 3,
            unit_price: 200,
            is_polished: true,
          },
        ],
      });

      expect(error).toBeNull();
      expect(created).toBeDefined();
      const orderId = created![0].id;

      const { data: order } = await user.client
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      expect(order).toBeDefined();
      expect(order?.store).toBe('mumbai');
      expect(order?.payment_method).toBe('upi');
      expect(order?.status).toBe('new');
      expect(order?.total).toBe(900); // 150*2 + 200*3
      expect(order?.order_items).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-07..09: Payment Method Validation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-07..09: Payment Method Validation', () => {
    it('ORD-07: Rejects invalid payment method via check constraint', async () => {
      const { error } = await user.client.from('orders').insert({
        customer_id: customerId,
        store: 'mumbai',
        total: 500,
        paid: 0,
        payment_method: 'bitcoin' as unknown as 'cash',
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });

    it('ORD-08: Accepts all valid payment methods', async () => {
      const validMethods = ['cash', 'upi', 'card', 'bank_transfer', 'credit', 'other'] as const;

      for (const method of validMethods) {
        const { data: created, error } = await user.client.rpc('create_order_with_items', {
          p_customer_id: customerId,
          p_store: 'mumbai',
          p_payment_method: method,
          p_items: [
            {
              product_id: productId,
              width_mm: 300,
              height_mm: 300,
              qty: 1,
              unit_price: 100,
              is_polished: false,
            },
          ],
        });
        expect(error).toBeNull();
        expect(created).toBeDefined();
      }
    });

    it('ORD-09: Allows NULL payment method', async () => {
      const { data: created, error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'sanpada',
        p_payment_method: undefined,
        p_items: [
          {
            product_id: productId,
            width_mm: 300,
            height_mm: 300,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      expect(error).toBeNull();
      expect(created).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-10 & ORD-11: Customer Phone Search
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-10 & ORD-11: Customer Phone Lookup', () => {
    it('ORD-10: Finds customer by exact phone number', async () => {
      const { data: cust, error } = await user.client
        .from('customers')
        .select('id, name, phone')
        .eq('phone', customerPhone)
        .maybeSingle();

      expect(error).toBeNull();
      expect(cust).toBeDefined();
      expect(cust?.name).toBe('Order Test Customer');
    });

    it('ORD-11: Returns null when phone does not match', async () => {
      const { data: cust, error } = await user.client
        .from('customers')
        .select('id')
        .eq('phone', '0000000000')
        .maybeSingle();

      expect(error).toBeNull();
      expect(cust).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-18..20: Order Edit & Cancel RPCs
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-18..20: Order Edit & Cancel RPCs', () => {
    it('ORD-18: Edits order and replaces items via update_order_with_items', async () => {
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 400,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      const { error: editErr } = await user.client.rpc('update_order_with_items', {
        p_order_id: orderId,
        p_customer_id: customerId,
        p_store: 'sanpada',
        p_payment_method: 'card',
        p_notes: 'Edited order notes',
        p_items: [
          {
            product_id: productId,
            width_mm: 600,
            height_mm: 600,
            qty: 2,
            unit_price: 150,
            is_polished: true,
          },
        ],
      });
      expect(editErr).toBeNull();

      const { data: updated } = await user.client
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single();

      expect(updated?.store).toBe('sanpada');
      expect(updated?.notes).toBe('Edited order notes');
      expect(updated?.total).toBe(300); // 150*2
      expect(updated?.order_items).toHaveLength(1);
      expect(updated?.order_items[0].is_polished).toBe(true);
    });

    it('ORD-19: Cancels order via cancel_order RPC', async () => {
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 400,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      const { error: cancelErr } = await user.client.rpc('cancel_order', {
        p_order_id: orderId,
      });
      expect(cancelErr).toBeNull();

      const { data: cancelledOrder } = await user.client
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      expect(cancelledOrder?.status).toBe('cancelled');
    });

    it('ORD-20: Calling cancel_order on already cancelled order returns success message', async () => {
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 400,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      await user.client.rpc('cancel_order', { p_order_id: orderId });

      // Second cancel call
      const { data: secondCancel, error } = await user.client.rpc('cancel_order', {
        p_order_id: orderId,
      });
      expect(error).toBeNull();
      // Returns { success: true, message: 'Order is already cancelled' }
      expect(secondCancel).toMatchObject({
        success: true,
        message: 'Order is already cancelled',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-21 & ORD-28 & ORD-29 & ORD-31: State Transitions & Known Behaviors
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-21 & ORD-28 & ORD-29 & ORD-31: State Transition Behaviors', () => {
    it('ORD-21: Marks order delivered via direct UPDATE', async () => {
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 400,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      const { error: updateErr } = await user.client
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', orderId);

      expect(updateErr).toBeNull();

      const { data: order } = await user.client
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      expect(order?.status).toBe('delivered');
    });

    it('ORD-28: Documents cancelling a delivered order is currently permitted by cancel_order RPC', async () => {
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 400,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      // Mark delivered
      await user.client.from('orders').update({ status: 'delivered' }).eq('id', orderId);

      // cancel_order RPC currently does not guard against delivered orders (only checks status = 'cancelled')
      const { error: cancelErr } = await user.client.rpc('cancel_order', {
        p_order_id: orderId,
      });
      expect(cancelErr).toBeNull();

      const { data: order } = await user.client
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      expect(order?.status).toBe('cancelled');
    });

    it('ORD-29: Documents absence of status transition guard on direct update to delivered', async () => {
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 400,
            height_mm: 400,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      // Cancel it
      await user.client.rpc('cancel_order', { p_order_id: orderId });

      // Direct update to delivered succeeds due to table-level UPDATE grant
      const { error: directUpdateErr } = await user.client
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', orderId);

      expect(directUpdateErr).toBeNull();
    });

    it('ORD-31: Documents cancel_order restores physically cut sheets back to available', async () => {
      // Create order and stock sheet
      const { data: created } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 500,
            height_mm: 500,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      const orderId = created![0].id;

      const { data: sheet } = await user.client
        .from('stock_items')
        .insert({
          product_id: productId,
          width_mm: 1200,
          height_mm: 1200,
          source: 'full',
        })
        .select('id')
        .single();

      const { data: order } = await user.client
        .from('orders')
        .select('order_items(id)')
        .eq('id', orderId)
        .single();

      // Cut sheet
      await user.client.rpc('confirm_batch_cut_plan', {
        p_order_ids: [orderId],
        p_product_id: productId,
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [
          {
            order_id: orderId,
            order_item_id: order!.order_items[0].id,
            stock_item_id: sheet!.id,
            x_mm: 0,
            y_mm: 0,
            w_mm: 500,
            h_mm: 500,
            rotated: false,
          },
        ],
        p_offcuts: [],
      });

      // Cancel order
      await user.client.rpc('cancel_order', { p_order_id: orderId });

      // Sheet is marked 'available' even though physically cut
      const { data: sheetAfter } = await user.client
        .from('stock_items')
        .select('status')
        .eq('id', sheet!.id)
        .single();
      expect(sheetAfter?.status).toBe('available');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ORD-24..26: Order Items Constraints
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ORD-24..26: Order Item Constraints', () => {
    it('ORD-24: Rejects order item with width <= 0', async () => {
      const { error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 0,
            height_mm: 500,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });

    it('ORD-25: Rejects order item with qty <= 0', async () => {
      const { error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: productId,
            width_mm: 500,
            height_mm: 500,
            qty: 0,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });

    it('ORD-26: is_polished defaults to false when omitted', async () => {
      const { data: order } = await user.client
        .from('orders')
        .insert({
          customer_id: customerId,
          store: 'mumbai',
          total: 100,
        })
        .select('id')
        .single();

      const { data: item, error } = await user.client
        .from('order_items')
        .insert({
          order_id: order!.id,
          product_id: productId,
          width_mm: 400,
          height_mm: 400,
          qty: 1,
          unit_price: 100,
        })
        .select('is_polished')
        .single();

      expect(error).toBeNull();
      expect(item?.is_polished).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ATOM-02 & ATOM-04: Atomicity Rollbacks & Non-Atomic Client Flow
  // ─────────────────────────────────────────────────────────────────────────────
  describe('ATOM-02 & ATOM-04: Atomicity Verification', () => {
    it('ATOM-02: Rolls back entire transaction if an item insert fails (no orphaned order)', async () => {
      const initialOrders = await user.client.from('orders').select('id');
      const initialCount = initialOrders.data?.length || 0;

      // Pass an item with invalid product_id
      const { error } = await user.client.rpc('create_order_with_items', {
        p_customer_id: customerId,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: '00000000-0000-0000-0000-000000000000',
            width_mm: 500,
            height_mm: 500,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });

      expect(error).not.toBeNull();

      // Verify no order was inserted
      const afterOrders = await user.client.from('orders').select('id');
      expect(afterOrders.data?.length).toBe(initialCount);
    });

    it('ATOM-04: Documents orphan customer created when client customer insert succeeds but order creation fails', async () => {
      // 1. Client creates customer
      const { data: newCust } = await user.client
        .from('customers')
        .insert({ name: 'Orphan Candidate', phone: '9111223344' })
        .select('id')
        .single();

      // 2. Client then calls create_order_with_items with invalid item
      await user.client.rpc('create_order_with_items', {
        p_customer_id: newCust!.id,
        p_store: 'mumbai',
        p_items: [
          {
            product_id: '00000000-0000-0000-0000-000000000000',
            width_mm: 500,
            height_mm: 500,
            qty: 1,
            unit_price: 100,
            is_polished: false,
          },
        ],
      });

      // Customer remains created (orphan customer documentation)
      const { data: custAfter } = await user.client
        .from('customers')
        .select('id')
        .eq('id', newCust!.id)
        .single();
      expect(custAfter).toBeDefined();
    });
  });
});
