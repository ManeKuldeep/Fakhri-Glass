import {
  adminClient,
  createTestUserSession,
  getOrCreateShop,
  TestUserSession,
} from '../harness';

describe('Low Stock Database View Tests (LOW-01..04)', () => {
  let shopAId: string;
  let shopBId: string;
  let userA: TestUserSession;
  let userB: TestUserSession;
  let productId: string;

  beforeAll(async () => {
    shopAId = await getOrCreateShop('Fakhri Glass');
    shopBId = await getOrCreateShop('Competitor Glass Test');

    userA = await createTestUserSession(
      'low-tester-a@fakhriglass.test',
      'Low Stock Tester A',
      'mumbai',
      shopAId,
    );

    userB = await createTestUserSession(
      'low-tester-b@competitor.test',
      'Low Stock Tester B',
      'sanpada',
      shopBId,
    );

    // Find an active product with 0 existing stock items
    const { data: allProds } = await adminClient
      .from('products')
      .select('id, name')
      .eq('shop_id', shopAId)
      .eq('is_lining', false);

    const { data: stockItems } = await adminClient
      .from('stock_items')
      .select('product_id')
      .eq('shop_id', shopAId);

    const usedIds = new Set((stockItems || []).map((s) => s.product_id));
    const targetProd = (allProds || []).find((p) => !usedIds.has(p.id));
    if (!targetProd) throw new Error('No unused product found for low stock test');
    productId = targetProd.id;

    await adminClient
      .from('products')
      .update({ min_stock_sheets: 3 })
      .eq('id', productId);
  });

  afterAll(async () => {
    // Reset min_stock_sheets
    if (productId) {
      await adminClient
        .from('products')
        .update({ min_stock_sheets: 0 })
        .eq('id', productId);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOW-01: Low stock view identifies products below threshold
  // ─────────────────────────────────────────────────────────────────────────────
  it('LOW-01: Identifies products when available full sheets < min_stock_sheets', async () => {
    // When 0 full sheets exist, product must appear in low_stock
    const { data: lowStock } = await userA.client
      .from('low_stock')
      .select('*')
      .eq('product_id', productId);

    expect(lowStock).toBeDefined();
    expect(lowStock!.length).toBeGreaterThan(0);
    expect(lowStock![0].sheets).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOW-02: Offcuts are excluded from sheet count
  // ─────────────────────────────────────────────────────────────────────────────
  it('LOW-02: Excludes offcuts from full sheets count', async () => {
    // Add 5 offcuts for this product
    const offcutRows = Array.from({ length: 5 }).map(() => ({
      product_id: productId,
      width_mm: 500,
      height_mm: 500,
      source: 'offcut' as const,
      status: 'available' as const,
    }));

    await userA.client.from('stock_items').insert(offcutRows);

    // Even with 5 offcuts, sheets count in low_stock must remain 0
    const { data: lowStock } = await userA.client
      .from('low_stock')
      .select('sheets')
      .eq('product_id', productId)
      .single();

    expect(lowStock?.sheets).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOW-03: Consumed and removed sheets are excluded
  // ─────────────────────────────────────────────────────────────────────────────
  it('LOW-03: Excludes consumed and removed full sheets from low_stock count', async () => {
    // Insert 1 consumed sheet and 1 removed sheet
    await userA.client.from('stock_items').insert([
      {
        product_id: productId,
        width_mm: 1200,
        height_mm: 1200,
        source: 'full',
        status: 'consumed',
      },
      {
        product_id: productId,
        width_mm: 1200,
        height_mm: 1200,
        source: 'full',
        status: 'removed',
      },
    ]);

    const { data: lowStock } = await userA.client
      .from('low_stock')
      .select('sheets')
      .eq('product_id', productId)
      .single();

    expect(lowStock?.sheets).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOW-04: Low stock query isolated by shop (security_invoker = true)
  // ─────────────────────────────────────────────────────────────────────────────
  it('LOW-04: Isolates low stock items by shop', async () => {
    // User B querying low_stock should only see products belonging to Shop B
    const { data: lowStockB } = await userB.client
      .from('low_stock')
      .select('*')
      .eq('product_id', productId);

    // Product belongs to Shop A -> User B cannot see it in low_stock!
    expect(lowStockB).toHaveLength(0);
  });
});
