export const STORES = [
  { value: 'turbhe', label: 'Turbhe' },
  { value: 'sanpada', label: 'Sanpada' },
] as const;

export type StoreValue = (typeof STORES)[number]['value'];