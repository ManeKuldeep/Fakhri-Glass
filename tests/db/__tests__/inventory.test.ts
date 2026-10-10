import {
  adminClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Inventory & Triggers Database Tests (INV-01..06, INV-22..23, INV-28..29)', () => {
  let shopId: string;
  let user: TestUserSession;
  let nonLiningProductId: string;
  let liningProductId: string;

  beforeAll(async () => {
    shopId = await getOrCreateShop('Fakhri Glass');
    user = await createTestUserSession(
      'inv-tester@fakhriglass.test',
      'Inventory Tester',
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
    nonLiningProductId = nonLining.id;

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

  // ─────────────────────────────────────────────────────────────────────────────
  // INV-01: Add stock inserts N rows for qty N
  // ─────────────────────────────────────────────────────────────────────────────
  it('INV-01: Inserts N rows for qty N as separate stock sheets', async () => {
    const qty = 3;
    const rowsToInsert = Array.from({ length: qty }).map(() => ({
      product_id: nonLiningProductId,
      width_mm: 1220,
      height_mm: 2440,
      source: 'full' as const,
      status: 'available' as const,
    }));

    const { data: inserted, error } = await user.client
      .from('stock_items')
      .insert(rowsToInsert)
      .select('id, status, source');

    expect(error).toBeNull();
    expect(inserted).toHaveLength(3);
    inserted?.forEach((item) => {
      expect(item.status).toBe('available');
      expect(item.source).toBe('full');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INV-02..04: Figured Glass Lining Trigger (check_lining_stock)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('INV-02..04: check_lining_stock Trigger', () => {
    it('INV-02: Rejects lining glass stock insert without vertical_line_height_mm', async () => {
      const { error } = await user.client.from('stock_items').insert({
        product_id: liningProductId,
        width_mm: 1220,
        height_mm: 2440,
        source: 'full',
        vertical_line_height_mm: null,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/vertical_line_height_mm is required for lining glass/i);
    });

    it('INV-03: Accepts lining glass stock with vertical_line_height_mm provided', async () => {
      const { data, error } = await user.client
        .from('stock_items')
        .insert({
          product_id: liningProductId,
          width_mm: 1220,
          height_mm: 2440,
          source: 'full',
          vertical_line_height_mm: 2440,
        })
        .select('id, vertical_line_height_mm')
        .single();

      expect(error).toBeNull();
      expect(data?.vertical_line_height_mm).toBe(2440);
    });

    it('INV-04: Non-lining glass stock allows null vertical_line_height_mm', async () => {
      const { data, error } = await user.client
        .from('stock_items')
        .insert({
          product_id: nonLiningProductId,
          width_mm: 1000,
          height_mm: 1000,
          source: 'full',
          vertical_line_height_mm: null,
        })
        .select('id, vertical_line_height_mm')
        .single();

      expect(error).toBeNull();
      expect(data?.vertical_line_height_mm).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INV-05 & INV-06: Edit Stock and Soft Removal
  // ─────────────────────────────────────────────────────────────────────────────
  describe('INV-05 & INV-06: Edit and Soft Remove Stock', () => {
    it('INV-05: Updates stock sheet dimensions', async () => {
      const { data: item } = await user.client
        .from('stock_items')
        .insert({
          product_id: nonLiningProductId,
          width_mm: 1000,
          height_mm: 1000,
          source: 'full',
        })
        .select('id')
        .single();

      const { data: updated, error } = await user.client
        .from('stock_items')
        .update({ width_mm: 1100, height_mm: 1150 })
        .eq('id', item!.id)
        .select('width_mm, height_mm')
        .single();

      expect(error).toBeNull();
      expect(updated?.width_mm).toBe(1100);
      expect(updated?.height_mm).toBe(1150);
    });

    it('INV-06: Soft removes stock item by setting status to removed', async () => {
      const { data: item } = await user.client
        .from('stock_items')
        .insert({
          product_id: nonLiningProductId,
          width_mm: 1000,
          height_mm: 1000,
          source: 'full',
        })
        .select('id')
        .single();

      const { data: removed, error } = await user.client
        .from('stock_items')
        .update({ status: 'removed' })
        .eq('id', item!.id)
        .select('status')
        .single();

      expect(error).toBeNull();
      expect(removed?.status).toBe('removed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INV-22 & INV-23: Dimension Constraints (> 0)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('INV-22 & INV-23: Dimension Check Constraints', () => {
    it('INV-22: Rejects stock item with width_mm <= 0', async () => {
      const { error } = await user.client.from('stock_items').insert({
        product_id: nonLiningProductId,
        width_mm: 0,
        height_mm: 1000,
        source: 'full',
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });

    it('INV-22: Rejects stock item with negative height_mm', async () => {
      const { error } = await user.client.from('stock_items').insert({
        product_id: nonLiningProductId,
        width_mm: 1000,
        height_mm: -50,
        source: 'full',
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });

    it('INV-23: Rejects lining stock with negative vertical_line_height_mm', async () => {
      const { error } = await user.client.from('stock_items').insert({
        product_id: liningProductId,
        width_mm: 1000,
        height_mm: 1000,
        source: 'full',
        vertical_line_height_mm: -10,
      });

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/violates check constraint/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INV-28 & INV-29: Audit Activity Logging on Stock Changes
  // ─────────────────────────────────────────────────────────────────────────────
  describe('INV-28 & INV-29: Activity Log on Stock Modifications', () => {
    it('INV-28: Creates activity_log row on stock insert', async () => {
      const { data: item } = await user.client
        .from('stock_items')
        .insert({
          product_id: nonLiningProductId,
          width_mm: 1200,
          height_mm: 1200,
          source: 'full',
        })
        .select('id')
        .single();

      const { data: logEntry } = await user.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'stock_items')
        .eq('record_id', item!.id)
        .eq('action', 'insert')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(logEntry).toBeDefined();
      expect(logEntry?.action).toBe('insert');
    });

    it('INV-29: Creates activity_log row on stock update', async () => {
      const { data: item } = await user.client
        .from('stock_items')
        .insert({
          product_id: nonLiningProductId,
          width_mm: 1200,
          height_mm: 1200,
          source: 'full',
        })
        .select('id')
        .single();

      await user.client
        .from('stock_items')
        .update({ width_mm: 1250 })
        .eq('id', item!.id);

      const { data: logEntry } = await user.client
        .from('activity_log')
        .select('*')
        .eq('table_name', 'stock_items')
        .eq('record_id', item!.id)
        .eq('action', 'update')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(logEntry).toBeDefined();
      expect(logEntry?.action).toBe('update');
    });
  });
});
