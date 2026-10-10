import {
  adminClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Activity Log & Audit Trigger Tests (LOG-01..12, AUTH-12..13)', () => {
  let shopAId: string;
  let shopBId: string;
  let userA: TestUserSession;
  let userB: TestUserSession;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    shopAId = await getOrCreateShop('Fakhri Glass');
    shopBId = await getOrCreateShop('Competitor Glass Test');

    userA = await createTestUserSession(
      'log-tester-a@fakhriglass.test',
      'Audit Tester A',
      'mumbai',
      shopAId,
    );

    userB = await createTestUserSession(
      'log-tester-b@competitor.test',
      'Audit Tester B',
      'sanpada',
      shopBId,
    );

    const { data: prod } = await adminClient
      .from('products')
      .select('id')
      .eq('shop_id', shopAId)
      .eq('is_lining', false)
      .limit(1)
      .single();
    if (!prod) throw new Error('No product found');
    productId = prod.id;

    const { data: cust } = await userA.client
      .from('customers')
      .insert({ name: 'Audit Customer', phone: `9811${Date.now().toString().slice(-6)}` })
      .select('id')
      .single();
    customerId = cust!.id;
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH-12 & AUTH-13 & LOG-11: log_event RPC
  // ─────────────────────────────────────────────────────────────────────────────
  describe('AUTH-12 & AUTH-13 & LOG-11: log_event RPC Audit Trail', () => {
    it('AUTH-12 & LOG-11: Calls log_event for Login and verifies activity_log record', async () => {
      const { error } = await userA.client.rpc('log_event', { p_summary: 'Login' });
      expect(error).toBeNull();

      const { data: logEntry } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('action', 'event')
        .eq('table_name', 'app')
        .eq('summary', 'Login')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      expect(logEntry).toBeDefined();
      expect(logEntry?.user_name).toBe('Audit Tester A');
      expect(logEntry?.user_assignment).toBe('mumbai');
      expect(logEntry?.shop_id).toBe(shopAId);
    });

    it('AUTH-13: Calls log_event for Logout and verifies activity_log record', async () => {
      const { error } = await userA.client.rpc('log_event', { p_summary: 'Logout' });
      expect(error).toBeNull();

      const { data: logEntry } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('action', 'event')
        .eq('table_name', 'app')
        .eq('summary', 'Logout')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      expect(logEntry).toBeDefined();
      expect(logEntry?.user_name).toBe('Audit Tester A');
      expect(logEntry?.user_assignment).toBe('mumbai');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOG-01..09: Table Triggers (log_activity)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('LOG-01..09: Table Insert/Update Audit Triggers', () => {
    it('LOG-01: Creates activity_log row on categories insert', async () => {
      const { data: cat } = await userB.client
        .from('categories')
        .insert({ name: `Audit Category ${Date.now()}` })
        .select('id')
        .single();

      const { data: logEntry } = await userB.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'categories')
        .eq('record_id', cat!.id)
        .eq('action', 'insert')
        .single();

      expect(logEntry).toBeDefined();
      expect(logEntry?.user_name).toBe('Audit Tester B');
    });

    it('LOG-02: Creates activity_log row on products insert', async () => {
      // Create a category in Shop B
      const { data: cat } = await userB.client
        .from('categories')
        .insert({ name: `Shop B Category ${Date.now()}` })
        .select('id')
        .single();

      const { data: prod } = await userB.client
        .from('products')
        .insert({
          category_id: cat!.id,
          name: `Audit Glass ${Date.now()}`,
          thickness_mm: 6,
          is_lining: false,
        })
        .select('id')
        .single();

      const { data: logEntry } = await userB.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'products')
        .eq('record_id', prod!.id)
        .eq('action', 'insert')
        .single();

      expect(logEntry).toBeDefined();
      expect(logEntry?.summary).toContain('Audit Glass');
    });

    it('LOG-03 & LOG-04: Creates activity_log rows on stock_items insert and update', async () => {
      const { data: item } = await userA.client
        .from('stock_items')
        .insert({
          product_id: productId,
          width_mm: 1000,
          height_mm: 1000,
          source: 'full',
        })
        .select('id')
        .single();

      const { data: insertLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'stock_items')
        .eq('record_id', item!.id)
        .eq('action', 'insert')
        .single();
      expect(insertLog).toBeDefined();

      await userA.client
        .from('stock_items')
        .update({ width_mm: 1050 })
        .eq('id', item!.id);

      const { data: updateLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'stock_items')
        .eq('record_id', item!.id)
        .eq('action', 'update')
        .single();
      expect(updateLog).toBeDefined();
    });

    it('LOG-05: Creates activity_log row on customers insert', async () => {
      const phone = `9711${Date.now().toString().slice(-6)}`;
      const { data: cust } = await userA.client
        .from('customers')
        .insert({ name: 'Unique Log Cust', phone })
        .select('id')
        .single();

      const { data: logEntry } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'customers')
        .eq('record_id', cust!.id)
        .eq('action', 'insert')
        .single();

      expect(logEntry).toBeDefined();
      expect(logEntry?.summary).toBe('Unique Log Cust');
    });

    it('LOG-06 & LOG-07: Creates activity_log rows on orders insert and update', async () => {
      const { data: order } = await userA.client
        .from('orders')
        .insert({
          customer_id: customerId,
          store: 'mumbai',
          total: 200,
        })
        .select('id')
        .single();

      const { data: insertLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'orders')
        .eq('record_id', order!.id)
        .eq('action', 'insert')
        .single();
      expect(insertLog).toBeDefined();

      await userA.client
        .from('orders')
        .update({ notes: 'Updated notes for log test' })
        .eq('id', order!.id);

      const { data: updateLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'orders')
        .eq('record_id', order!.id)
        .eq('action', 'update')
        .single();
      expect(updateLog).toBeDefined();
    });

    it('LOG-08 & LOG-10: Creates activity_log rows on order_items insert and delete', async () => {
      const { data: order } = await userA.client
        .from('orders')
        .insert({
          customer_id: customerId,
          store: 'mumbai',
          total: 200,
        })
        .select('id')
        .single();

      const { data: item } = await userA.client
        .from('order_items')
        .insert({
          order_id: order!.id,
          product_id: productId,
          width_mm: 400,
          height_mm: 400,
          qty: 1,
          unit_price: 200,
        })
        .select('id')
        .single();

      const { data: insertLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'order_items')
        .eq('record_id', item!.id)
        .eq('action', 'insert')
        .single();
      expect(insertLog).toBeDefined();

      // Delete order item (LOG-10)
      await userA.client.from('order_items').delete().eq('id', item!.id);

      const { data: deleteLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'order_items')
        .eq('record_id', item!.id)
        .eq('action', 'delete')
        .single();
      expect(deleteLog).toBeDefined();
    });

    it('LOG-09: Creates activity_log row on cut_plans insert', async () => {
      const { data: order } = await userA.client
        .from('orders')
        .insert({
          customer_id: customerId,
          store: 'mumbai',
          total: 200,
        })
        .select('id')
        .single();

      const { data: plan } = await userA.client
        .from('cut_plans')
        .insert({
          order_id: order!.id,
          product_id: productId,
          kerf_mm: 3,
          max_wastage_pct: 20,
        })
        .select('id')
        .single();

      const { data: planLog } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'cut_plans')
        .eq('record_id', plan!.id)
        .eq('action', 'insert')
        .single();

      expect(planLog).toBeDefined();
      expect(planLog?.summary).toContain('Cut plan');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOG-12: Activity Log Shop Isolation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('LOG-12: Activity Log Shop Isolation', () => {
    it('isolates activity_log entries between Shop A and Shop B', async () => {
      // User B logs an event in Shop B
      await userB.client.rpc('log_event', { p_summary: 'Shop B Secret Event' });

      // User A queries activity log
      const { data: logsA } = await userA.client
        .from('activity_log')
        .select('*')
        .eq('summary', 'Shop B Secret Event');

      // User A cannot see Shop B log entry!
      expect(logsA).toHaveLength(0);

      // User B can see their own log entry
      const { data: logsB } = await userB.client
        .from('activity_log')
        .select('*')
        .eq('summary', 'Shop B Secret Event');

      expect(logsB!.length).toBeGreaterThan(0);
      expect(logsB![0].shop_id).toBe(shopBId);
    });
  });
});
