import { generateInvoiceHtml, escapeHtml } from '../invoiceUtils';
import { OrderDetailData } from '../queries';

describe('Invoice HTML Generation Tests', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("test & foo")</script>')).toBe(
      '&lt;script&gt;alert(&quot;test &amp; foo&quot;)&lt;/script&gt;',
    );
  });

  it('generates complete invoice HTML for order with items', () => {
    const mockOrder: OrderDetailData = {
      id: 'order-123',
      order_no: 1042,
      store: 'mumbai',
      status: 'delivered',
      total: 4500,
      paid: 2000,
      payment_method: 'upi',
      notes: 'Handle with care. Mirror edge polished.',
      created_at: '2026-10-05T10:00:00Z',
      created_by: 'user-1',
      customer: {
        id: 'cust-1',
        name: 'Ali Asgar',
        phone: '9876543210',
        address: 'Bhendi Bazaar, Mumbai',
      },
      order_items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          width_mm: 600,
          height_mm: 900,
          qty: 2,
          unit_price: 1500,
          line_total: 3000,
          is_polished: true,
          product: {
            id: 'prod-1',
            name: 'Clear Mirror',
            thickness_mm: 5,
            color: 'Silver',
            is_lining: false,
            category: {
              id: 'cat-1',
              name: 'Mirror Glass',
            },
          },
        },
        {
          id: 'item-2',
          product_id: 'prod-2',
          width_mm: 800,
          height_mm: 1200,
          qty: 1,
          unit_price: 1500,
          line_total: 1500,
          is_polished: false,
          product: {
            id: 'prod-2',
            name: 'Tinted Grey',
            thickness_mm: 6,
            color: 'Grey',
            is_lining: false,
            category: {
              id: 'cat-2',
              name: 'Tinted Glass',
            },
          },
        },
      ],
    };

    const html = generateInvoiceHtml(mockOrder);

    // Basic structure
    expect(html).toContain('FAKHRI GLASS');
    expect(html).toContain('Mumbai Store');
    expect(html).toContain('#1042');
    expect(html).toContain('Ali Asgar');
    expect(html).toContain('9876543210');
    expect(html).toContain('Bhendi Bazaar, Mumbai');
    expect(html).toContain('DELIVERED');

    // Items
    expect(html).toContain('Clear Mirror');
    expect(html).toContain('POLISHED (+3mm)');
    expect(html).toContain('Tinted Grey');
    expect(html).toContain('600 × 900 mm');

    // Totals & Balance
    expect(html).toContain('₹4,500');
    expect(html).toContain('₹2,000'); // Paid
    expect(html).toContain('₹2,500'); // Balance (4500 - 2000)
    expect(html).toContain('Upi');
    expect(html).toContain('Handle with care');
  });
});
