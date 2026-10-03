import { generatePieceLabelsFromOrder, generateLabelsHtml } from '../utils';
import { OrderWithItemsForLabels } from '../types';

describe('Piece Labels Generator & HTML Tests', () => {
  const sampleOrder: OrderWithItemsForLabels = {
    id: 'ord-123',
    order_no: 101,
    store: 'mumbai',
    customer: {
      name: 'Murtuza Merchant',
      phone: '9876543210',
    },
    order_items: [
      {
        id: 'oi-1',
        width_mm: 400,
        height_mm: 500,
        qty: 3,
        product: {
          name: 'Clear Glass',
          thickness_mm: 5,
          color: null,
        },
      },
      {
        id: 'oi-2',
        width_mm: 1200,
        height_mm: 600,
        qty: 1,
        product: {
          name: 'Clear Moru',
          thickness_mm: 5,
          color: 'Clear',
        },
      },
    ],
  };

  describe('generatePieceLabelsFromOrder', () => {
    it('generates one label per physical piece (qty 3 gives 1/3, 2/3, 3/3)', () => {
      const labels = generatePieceLabelsFromOrder(sampleOrder);

      // Total physical pieces = 3 + 1 = 4
      expect(labels).toHaveLength(4);

      // First item's pieces: 1/3, 2/3, 3/3
      expect(labels[0].pieceIndex).toBe(1);
      expect(labels[0].totalQty).toBe(3);
      expect(labels[1].pieceIndex).toBe(2);
      expect(labels[1].totalQty).toBe(3);
      expect(labels[2].pieceIndex).toBe(3);
      expect(labels[2].totalQty).toBe(3);

      // Second item's piece: 1/1
      expect(labels[3].pieceIndex).toBe(1);
      expect(labels[3].totalQty).toBe(1);
    });

    it('strictly maps store to "Mumbai" or "Sanpada" (never "cutter")', () => {
      const mumbaiLabels = generatePieceLabelsFromOrder(sampleOrder);
      expect(mumbaiLabels[0].store).toBe('mumbai');
      expect(mumbaiLabels[0].storeLabel).toBe('Mumbai');

      const sanpadaOrder = { ...sampleOrder, store: 'sanpada' };
      const sanpadaLabels = generatePieceLabelsFromOrder(sanpadaOrder);
      expect(sanpadaLabels[0].store).toBe('sanpada');
      expect(sanpadaLabels[0].storeLabel).toBe('Sanpada');

      // Even if invalid or 'cutter' was passed, defaults to 'mumbai'
      const cutterOrder = { ...sampleOrder, store: 'cutter' };
      const cutterLabels = generatePieceLabelsFromOrder(cutterOrder);
      expect(cutterLabels[0].store).toBe('mumbai');
      expect(cutterLabels[0].storeLabel).toBe('Mumbai');
    });

    it('formats dimensions with both mm and ft/in', () => {
      const labels = generatePieceLabelsFromOrder(sampleOrder);
      // 400 × 500 mm
      expect(labels[0].formattedDimensions).toContain('400 × 500 mm');
      expect(labels[0].formattedDimensions).toContain('1\'');
    });

    it('retains customer name, phone, and order number on every label', () => {
      const labels = generatePieceLabelsFromOrder(sampleOrder);
      for (const label of labels) {
        expect(label.orderNo).toBe(101);
        expect(label.customerName).toBe('Murtuza Merchant');
        expect(label.customerPhone).toBe('9876543210');
      }
    });
  });

  describe('generateLabelsHtml', () => {
    it('generates HTML with 100mm × 50mm thermal page size and page-breaks', () => {
      const labels = generatePieceLabelsFromOrder(sampleOrder);
      const html = generateLabelsHtml(labels);

      expect(html).toContain('size: 100mm 50mm');
      expect(html).toContain('page-break-after: always');
      expect(html).toContain('ORDER #101');
      expect(html).toContain('PIECE 1 OF 3');
      expect(html).toContain('PIECE 2 OF 3');
      expect(html).toContain('PIECE 3 OF 3');
      expect(html).toContain('Murtuza Merchant');
      expect(html).toContain('MUMBAI');
      expect(html).toContain('Clear Glass (5 mm)');
    });

    it('escapes dangerous HTML characters', () => {
      const dangerousOrder: OrderWithItemsForLabels = {
        ...sampleOrder,
        customer: {
          name: '<script>alert("xss")</script> & Co.',
          phone: null,
        },
      };

      const labels = generatePieceLabelsFromOrder(dangerousOrder);
      const html = generateLabelsHtml(labels);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp; Co.');
    });

    it('renders POLISHED badge and adds +3mm to cut dimensions when is_polished is true', () => {
      const polishedOrder: OrderWithItemsForLabels = {
        id: 'ord-polished',
        order_no: 202,
        store: 'mumbai',
        customer: {
          name: 'Ibrahim Glassworks',
          phone: '9820098200',
        },
        order_items: [
          {
            id: 'oi-pol-1',
            width_mm: 600,
            height_mm: 900,
            qty: 2,
            is_polished: true,
            product: {
              name: 'Toughened Glass',
              thickness_mm: 8,
              color: 'Clear',
            },
          },
        ],
      };

      const labels = generatePieceLabelsFromOrder(polishedOrder);
      expect(labels).toHaveLength(2);
      expect(labels[0].isPolished).toBe(true);
      expect(labels[0].widthMm).toBe(600);
      expect(labels[0].heightMm).toBe(900);
      expect(labels[0].cutWidthMm).toBe(603);
      expect(labels[0].cutHeightMm).toBe(903);
      expect(labels[0].formattedDimensions).toContain('600 × 900 mm');
      expect(labels[0].formattedDimensions).toContain('Cut: 603 × 903 mm [POLISHED]');

      const html = generateLabelsHtml(labels);
      expect(html).toContain('<span class="polished-badge">POLISHED</span>');
      expect(html).toContain('Cut: 603 × 903 mm [POLISHED]');
    });
  });
});
