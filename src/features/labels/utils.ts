import { formatFtIn } from '../inventory/utils';
import { OrderWithItemsForLabels, PieceLabelData } from './types';

/**
 * Expand an order and its order_items into individual physical piece labels.
 * E.g. Quantity 3 produces 3 separate labels: 1/3, 2/3, 3/3.
 * Store is strictly 'mumbai' or 'sanpada' (never 'cutter', per SPEC.md section 2).
 */
export function generatePieceLabelsFromOrder(
  order: OrderWithItemsForLabels,
): PieceLabelData[] {
  const labels: PieceLabelData[] = [];

  const storeKey: 'mumbai' | 'sanpada' =
    order.store === 'sanpada' ? 'sanpada' : 'mumbai';
  const storeLabel = storeKey === 'sanpada' ? 'Sanpada' : 'Mumbai';

  for (const item of order.order_items) {
    const wFtIn = formatFtIn(item.width_mm);
    const hFtIn = formatFtIn(item.height_mm);
    const formattedDimensions = `${item.width_mm} × ${item.height_mm} mm (${wFtIn} × ${hFtIn})`;

    for (let i = 1; i <= item.qty; i++) {
      labels.push({
        orderNo: order.order_no,
        store: storeKey,
        storeLabel,
        customerName: order.customer.name,
        customerPhone: order.customer.phone,
        productName: item.product.name,
        thicknessMm: item.product.thickness_mm,
        color: item.product.color,
        widthMm: item.width_mm,
        heightMm: item.height_mm,
        formattedDimensions,
        pieceIndex: i,
        totalQty: item.qty,
      });
    }
  }

  return labels;
}

/**
 * Generate thermal print-ready HTML for labels.
 * Formatted for standard 100mm × 50mm direct thermal label rolls (one label per page).
 */
export function generateLabelsHtml(labels: PieceLabelData[]): string {
  const labelPages = labels
    .map((l) => {
      return `
      <div class="label-page">
        <div class="header-row">
          <div class="shop-title">FAKHRI GLASS</div>
          <div class="store-badge">${escapeHtml(l.storeLabel.toUpperCase())}</div>
        </div>

        <div class="meta-row">
          <div class="order-box">
            <span class="order-no">ORDER #${l.orderNo}</span>
          </div>
          <div class="piece-box">
            <span class="piece-tag">PIECE ${l.pieceIndex} OF ${l.totalQty}</span>
          </div>
        </div>

        <div class="customer-row">
          <span class="customer-name">${escapeHtml(l.customerName)}</span>
          ${
            l.customerPhone
              ? `<span class="customer-phone">${escapeHtml(l.customerPhone)}</span>`
              : ''
          }
        </div>

        <div class="divider"></div>

        <div class="product-info">
          <div class="product-name">${escapeHtml(l.productName)} (${l.thicknessMm} mm${
            l.color ? ` · ${escapeHtml(l.color)}` : ''
          })</div>
          <div class="dimension-line">${escapeHtml(l.formattedDimensions)}</div>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Piece Labels</title>
        <style>
          @page {
            size: 100mm 50mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            background: #ffffff;
            color: #000000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label-page {
            width: 100mm;
            height: 50mm;
            padding: 3.5mm 4mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            page-break-after: always;
            border: 1px dashed #cccccc;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px solid #000000;
            padding-bottom: 1.5mm;
          }
          .shop-title {
            font-size: 11pt;
            font-weight: 900;
            letter-spacing: 0.5px;
          }
          .store-badge {
            font-size: 9pt;
            font-weight: 800;
            border: 1.5px solid #000000;
            padding: 1px 4px;
            border-radius: 2px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 1.5mm;
          }
          .order-no {
            font-size: 12pt;
            font-weight: 800;
          }
          .piece-tag {
            font-size: 11pt;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            padding: 1.5px 5px;
            border-radius: 3px;
          }
          .customer-row {
            display: flex;
            justify-content: space-between;
            font-size: 9pt;
            font-weight: 600;
            margin-top: 1mm;
          }
          .customer-phone {
            color: #333333;
          }
          .divider {
            height: 1px;
            background: #000000;
            margin: 1.5mm 0;
          }
          .product-info {
            display: flex;
            flex-direction: column;
            gap: 1mm;
          }
          .product-name {
            font-size: 10pt;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .dimension-line {
            font-size: 11pt;
            font-weight: 900;
          }
        </style>
      </head>
      <body>
        ${labelPages}
      </body>
    </html>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
