export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit' },
  { value: 'other', label: 'Other' },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]['value'];

export const ORDER_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'cutting', label: 'Cutting' },
  { value: 'cut', label: 'Cut' },
  { value: 'delivered', label: 'Delivered' },
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number]['value'];
