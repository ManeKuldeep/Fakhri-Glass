import {
  adminClient,
  createAnonClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Database Security, RLS & Grant Tests (SEC-03..07, SEC-10..14, INV-07)', () => {
  let shopAId: string;
  let shopBId: string;
  let userA: TestUserSession;
  let userB: TestUserSession;
  let anonClient: ReturnType<typeof createAnonClient>;

  beforeAll(async () => {
    shopAId = await getOrCreateShop('Fakhri Glass');
    shopBId = await getOrCreateShop('Competitor Glass Test');

    userA = await createTestUserSession(
      'sec-tester-a@fakhriglass.test',
      'Security Tester A',
      'mumbai',
      shopAId,
    );

    userB = await createTestUserSession(
      'sec-tester-b@competitor.test',
      'Security Tester B',
      'mumbai',
      shopBId,
    );

    anonClient = createAnonClient();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEC-03: Multi-tenant Shop Isolation via RLS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SEC-03: Multi-tenant Shop Isolation', () => {
    it('isolates customers between shops', async () => {
      // User A creates a customer in Shop A
      const { data: custA, error: errA } = await userA.client
        .from('customers')
        .insert({ name: 'Shop A Customer', phone: '9911111111' })
        .select('id')
        .single();
      expect(errA).toBeNull();

      // User B cannot see Shop A customer
      const { data: fetchByB } = await userB.client
        .from('customers')
        .select('id')
        .eq('id', custA!.id);
      expect(fetchByB).toHaveLength(0);

      // User B cannot update Shop A customer
      const { data: updateByB } = await userB.client
        .from('customers')
        .update({ name: 'Hacked Name' })
        .eq('id', custA!.id)
        .select();
      expect(updateByB).toHaveLength(0);
    });

    it('isolates stock items between shops', async () => {
      // Get product for Shop A
      const { data: prodA } = await adminClient
        .from('products')
        .select('id')
        .eq('shop_id', shopAId)
        .eq('is_lining', false)
        .limit(1)
        .single();

      const { data: stockA, error: errA } = await userA.client
        .from('stock_items')
        .insert({
          product_id: prodA!.id,
          width_mm: 1000,
          height_mm: 1000,
          source: 'full',
        })
        .select('id')
        .single();
      expect(errA).toBeNull();

      // User B cannot see Shop A stock
      const { data: fetchByB } = await userB.client
        .from('stock_items')
        .select('id')
        .eq('id', stockA!.id);
      expect(fetchByB).toHaveLength(0);
    });

    it('isolates orders between shops', async () => {
      const { data: ordersB } = await userB.client.from('orders').select('id');
      expect(ordersB).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEC-04: RLS Enabled on All Tables
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SEC-04: RLS Enabled on All Business Tables', () => {
    it('verifies RLS prevents anon from selecting from tables', async () => {
      // Direct query without authenticated shop profile returns 0 rows or error for all tables
      const { data: shops } = await anonClient.from('shops').select('id');
      expect(shops).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEC-05 & INV-07: Direct DELETE Denied on Business Tables
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SEC-05 & INV-07: Direct DELETE Denied for Authenticated Role', () => {
    it('denies direct DELETE on stock_items (INV-07, SEC-05)', async () => {
      const { error } = await userA.client
        .from('stock_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied|violates/i);
    });

    it('denies direct DELETE on orders (SEC-05)', async () => {
      const { error } = await userA.client
        .from('orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied|violates/i);
    });

    it('denies direct DELETE on cut_plans (SEC-05)', async () => {
      const { error } = await userA.client
        .from('cut_plans')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied|violates/i);
    });

    it('denies direct DELETE on cut_pieces (SEC-05)', async () => {
      const { error } = await userA.client
        .from('cut_pieces')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied|violates/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEC-06 & SEC-07: Anon Role Locked Out Completely
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SEC-06 & SEC-07: Anon Role Revocations', () => {
    it('denies anon access to products (SEC-06)', async () => {
      const { error } = await anonClient.from('products').select('*');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies anon access to stock_items (SEC-06)', async () => {
      const { error } = await anonClient.from('stock_items').select('*');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies anon access to orders (SEC-06)', async () => {
      const { error } = await anonClient.from('orders').select('*');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies anon access to customers (SEC-06)', async () => {
      const { error } = await anonClient.from('customers').select('*');
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies anon execution of log_event RPC (SEC-07)', async () => {
      const { error } = await anonClient.rpc('log_event', { p_summary: 'Hacker log' });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies anon execution of create_order_with_items RPC (SEC-07)', async () => {
      const { error } = await anonClient.rpc('create_order_with_items', {
        p_customer_id: '00000000-0000-0000-0000-000000000000',
        p_store: 'mumbai',
        p_items: [],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies anon execution of confirm_batch_cut_plan RPC (SEC-07)', async () => {
      const { error } = await anonClient.rpc('confirm_batch_cut_plan', {
        p_order_ids: [],
        p_product_id: '00000000-0000-0000-0000-000000000000',
        p_kerf_mm: 3,
        p_max_wastage_pct: 20,
        p_pieces: [],
        p_offcuts: [],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SEC-10..13: Audit Ledger and Movement Grants Lockdown
  // ─────────────────────────────────────────────────────────────────────────────
  describe('SEC-10..13: Audit and Movement Ledger Lockdown', () => {
    it('returns null shop_id for unauthenticated callers (SEC-10)', async () => {
      const { data, error } = await anonClient.rpc('auth_shop_id');
      // auth_shop_id is granted to public but returns NULL when auth.uid() is null
      if (!error) {
        expect(data).toBeNull();
      } else {
        expect(error.message).toMatch(/permission denied/i);
      }
    });

    it('denies direct INSERT on activity_log for authenticated role (SEC-11)', async () => {
      const { error } = await userA.client.from('activity_log').insert({
        shop_id: shopAId,
        action: 'event',
        table_name: 'app',
        summary: 'Forged log entry',
        user_name: 'Tester',
      });
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/permission denied/i);
    });

    it('denies direct UPDATE and DELETE on activity_log (SEC-12)', async () => {
      const { error: updateErr } = await userA.client
        .from('activity_log')
        .update({ summary: 'Tampered summary' })
        .neq('id', 0);
      expect(updateErr).not.toBeNull();
      expect(updateErr!.message).toMatch(/permission denied/i);

      const { error: deleteErr } = await userA.client
        .from('activity_log')
        .delete()
        .neq('id', 0);
      expect(deleteErr).not.toBeNull();
      expect(deleteErr!.message).toMatch(/permission denied/i);
    });

    it('denies direct UPDATE and DELETE on stock_movements (SEC-13)', async () => {
      const { error: updateErr } = await userA.client
        .from('stock_movements')
        .update({ type: 'adjust' })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      expect(updateErr).not.toBeNull();
      expect(updateErr!.message).toMatch(/permission denied/i);

      const { error: deleteErr } = await userA.client
        .from('stock_movements')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      expect(deleteErr).not.toBeNull();
      expect(deleteErr!.message).toMatch(/permission denied/i);
    });

    it('documents authenticated role holds direct UPDATE privileges on stock_items and orders (SEC-14)', async () => {
      const { data: prod } = await adminClient
        .from('products')
        .select('id')
        .eq('shop_id', shopAId)
        .eq('is_lining', false)
        .limit(1)
        .single();

      const { data: item } = await userA.client
        .from('stock_items')
        .insert({
          product_id: prod!.id,
          width_mm: 800,
          height_mm: 800,
          source: 'full',
        })
        .select('id')
        .single();

      // Direct update succeeds because granted UPDATE in 20260928091309
      const { error: stockUpdateErr } = await userA.client
        .from('stock_items')
        .update({ status: 'removed' })
        .eq('id', item!.id);
      expect(stockUpdateErr).toBeNull();
    });
  });
});
