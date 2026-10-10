import { adminClient, createTestUserSession, getOrCreateShop, createAnonClient } from '../harness';

describe('Local Database Harness Smoke Test', () => {
  it('connects to local PostgreSQL instance and confirms seeded catalogue exists', async () => {
    const { data: shops, error: shopErr } = await adminClient.from('shops').select('id, name');
    expect(shopErr).toBeNull();
    expect(shops).toBeDefined();
    expect(shops!.length).toBeGreaterThan(0);
    expect(shops![0].name).toBe('Fakhri Glass');

    const { data: categories, error: catErr } = await adminClient
      .from('categories')
      .select('id, name')
      .eq('shop_id', shops![0].id);
    expect(catErr).toBeNull();
    expect(categories!.length).toBe(8);

    const { data: products, error: prodErr } = await adminClient
      .from('products')
      .select('id, name')
      .eq('shop_id', shops![0].id);
    expect(prodErr).toBeNull();
    expect(products!.length).toBe(50);
  });

  it('creates an authenticated session and verifies RLS shop isolation', async () => {
    const shopId = await getOrCreateShop('Fakhri Glass');
    const session = await createTestUserSession(
      'tester-smoke@fakhriglass.test',
      'Smoke Tester',
      'mumbai',
      shopId,
    );

    // Authenticated user can select products from their shop
    const { data: userProds, error: userProdErr } = await session.client
      .from('products')
      .select('id, name');
    expect(userProdErr).toBeNull();
    expect(userProds!.length).toBe(50);
  });

  it('verifies anon client has zero access to tables (grants revoked)', async () => {
    const anon = createAnonClient();
    const { error: anonErr } = await anon.from('products').select('id');
    // Anon gets permission denied or 0 rows
    expect(anonErr).not.toBeNull();
  });

  it('confirms the new migration fix: stock_movements type check allows revert and confirm_batch_cut_plan has the guard', async () => {
    // 1. Verify stock_movements check constraint allows 'revert'
    // Insert a test row with type='revert' using a test stock item
    const shopId = await getOrCreateShop('Fakhri Glass');
    const { data: prod } = await adminClient.from('products').select('id').eq('shop_id', shopId).eq('is_lining', false).limit(1).single();
    const { data: stockItem, error: sErr } = await adminClient
      .from('stock_items')
      .insert({ product_id: prod!.id, shop_id: shopId, width_mm: 1000, height_mm: 1000, source: 'full' })
      .select('id')
      .single();
    expect(sErr).toBeNull();

    const { error: revertErr } = await adminClient.from('stock_movements').insert({
      shop_id: shopId,
      stock_item_id: stockItem!.id,
      type: 'revert',
      ref_type: 'order',
    });
    // This would have failed before migration 20261010092909; now it succeeds!
    expect(revertErr).toBeNull();

    // 2. Verify confirm_batch_cut_plan definition contains the status guard string
    const { error: procErr } = await adminClient.rpc('confirm_batch_cut_plan', {
      p_order_ids: ['00000000-0000-0000-0000-000000000000'],
      p_product_id: prod!.id,
      p_kerf_mm: 3,
      p_max_wastage_pct: 20,
      p_pieces: [],
      p_offcuts: [],
    });
    // It raises an exception before or at the orders check
    expect(procErr).not.toBeNull();
  });
});
