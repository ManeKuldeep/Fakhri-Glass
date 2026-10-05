import { OrderDetailData } from './queries';
import { formatFtIn } from '../inventory/utils';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateInvoiceHtml(order: OrderDetailData): string {
  const storeLabel = order.store === 'mumbai' ? 'Mumbai Store' : 'Sanpada Store';
  const customerName = escapeHtml(order.customer.name);
  const customerPhone = order.customer.phone ? escapeHtml(order.customer.phone) : '—';
  const customerAddress = order.customer.address ? escapeHtml(order.customer.address) : '—';
  const paymentMethodLabel = order.payment_method
    ? escapeHtml(order.payment_method.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    : 'Not Specified';

  const orderDate = new Date(order.created_at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const balance = Math.max(0, order.total - order.paid);

  const rows = order.order_items
    .map((item, index) => {
      const prodName = escapeHtml(item.product.name);
      const catName = escapeHtml(item.product.category.name);
      const thickness = item.product.thickness_mm;
      const color = item.product.color ? ` · ${escapeHtml(item.product.color)}` : '';
      const wFtIn = formatFtIn(item.width_mm);
      const hFtIn = formatFtIn(item.height_mm);
      const polishedBadge = item.is_polished
        ? '<span class="badge badge-polish">POLISHED (+3mm)</span>'
        : '';

      const lineTotal = Number(item.unit_price) * item.qty;

      return `
        <tr>
          <td class="col-num">${index + 1}</td>
          <td class="col-desc">
            <div class="prod-title">${prodName} ${polishedBadge}</div>
            <div class="prod-sub">${catName} · ${thickness}mm${color}</div>
          </td>
          <td class="col-size">
            <div>${item.width_mm} × ${item.height_mm} mm</div>
            <div class="prod-sub">${wFtIn} × ${hFtIn}</div>
          </td>
          <td class="col-qty">${item.qty}</td>
          <td class="col-rate">₹${Number(item.unit_price).toLocaleString('en-IN')}</td>
          <td class="col-total">₹${lineTotal.toLocaleString('en-IN')}</td>
        </tr>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #${order.order_no} - Fakhri Glass</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body {
      color: #0F172A;
      font-size: 13px;
      line-height: 1.5;
      padding: 10px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #E2E8F0;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #0F172A;
    }
    .store-tag {
      font-size: 14px;
      font-weight: 600;
      color: #1A73E8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-title {
      font-size: 22px;
      font-weight: 700;
      color: #1E293B;
    }
    .invoice-num {
      font-size: 14px;
      color: #64748B;
      margin-top: 2px;
    }
    .invoice-date {
      font-size: 12px;
      color: #64748B;
    }
    .status-pill {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      background: #E0E7FF;
      color: #3730A3;
    }
    .status-delivered {
      background: #D1FAE5;
      color: #065F46;
    }
    .customer-section {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
    }
    .cust-title {
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .cust-name {
      font-size: 16px;
      font-weight: 700;
      color: #0F172A;
    }
    .cust-detail {
      font-size: 13px;
      color: #334155;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th {
      background: #F1F5F9;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      border-bottom: 2px solid #CBD5E1;
      text-align: left;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #E2E8F0;
      vertical-align: middle;
    }
    .col-num {
      width: 30px;
      color: #94A3B8;
      font-weight: 600;
    }
    .col-desc {
      width: 36%;
    }
    .prod-title {
      font-weight: 700;
      color: #0F172A;
      font-size: 13px;
    }
    .prod-sub {
      font-size: 11px;
      color: #64748B;
    }
    .badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 6px;
      vertical-align: middle;
    }
    .badge-polish {
      background: #FEF3C7;
      color: #92400E;
      border: 1px solid #FCD34D;
    }
    .col-size {
      width: 22%;
      font-size: 12px;
    }
    .col-qty {
      width: 8%;
      text-align: center;
      font-weight: 600;
    }
    .col-rate {
      width: 15%;
      text-align: right;
    }
    .col-total {
      width: 15%;
      text-align: right;
      font-weight: 700;
      color: #0F172A;
    }
    .bottom-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
    }
    .notes-box {
      width: 50%;
      background: #F8FAFC;
      border: 1px dashed #CBD5E1;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .notes-title {
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .notes-text {
      font-size: 12px;
      color: #334155;
    }
    .totals-box {
      width: 42%;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 14px;
      border-bottom: 1px solid #F1F5F9;
      font-size: 13px;
    }
    .total-row-grand {
      background: #F8FAFC;
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
      border-top: 1px solid #CBD5E1;
      border-bottom: 1px solid #CBD5E1;
    }
    .total-row-bal {
      font-weight: 700;
      color: ${balance > 0 ? '#B91C1C' : '#059669'};
    }
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 16px;
      text-align: center;
      color: #94A3B8;
      font-size: 11px;
    }
    .footer-msg {
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">FAKHRI GLASS</div>
      <div class="store-tag">${storeLabel}</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-num">#${order.order_no}</div>
      <div class="invoice-date">${orderDate}</div>
      <div class="status-pill ${order.status === 'delivered' ? 'status-delivered' : ''}">
        ${order.status.toUpperCase()}
      </div>
    </div>
  </div>

  <div class="customer-section">
    <div>
      <div class="cust-title">Billed To</div>
      <div class="cust-name">${customerName}</div>
      <div class="cust-detail">Phone: ${customerPhone}</div>
      <div class="cust-detail">Address: ${customerAddress}</div>
    </div>
    <div style="text-align: right;">
      <div class="cust-title">Payment Method</div>
      <div class="cust-name" style="font-size: 14px;">${paymentMethodLabel}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-desc">Product & Specification</th>
        <th class="col-size">Dimensions</th>
        <th class="col-qty">Qty</th>
        <th class="col-rate">Unit Price</th>
        <th class="col-total">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="bottom-section">
    <div class="notes-box">
      <div class="notes-title">Notes / Instructions</div>
      <div class="notes-text">${order.notes ? escapeHtml(order.notes) : 'No special instructions recorded.'}</div>
    </div>

    <div class="totals-box">
      <div class="total-row total-row-grand">
        <span>Grand Total</span>
        <span>₹${order.total.toLocaleString('en-IN')}</span>
      </div>
      <div class="total-row">
        <span>Amount Paid</span>
        <span>₹${order.paid.toLocaleString('en-IN')}</span>
      </div>
      <div class="total-row total-row-bal">
        <span>Balance Due</span>
        <span>₹${balance.toLocaleString('en-IN')}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-msg">Thank you for choosing Fakhri Glass!</div>
    <div>This is an official computer-generated invoice.</div>
  </div>
</body>
</html>
  `.trim();
}
