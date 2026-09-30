export const STORES = [
  { value: 'mumbai', label: 'Mumbai' },
  { value: 'sanpada', label: 'Sanpada' },
] as const;

export type StoreValue = (typeof STORES)[number]['value'];