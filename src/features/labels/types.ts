export interface PieceLabelData {
  orderNo: number;
  store: 'mumbai' | 'sanpada';
  storeLabel: string; // 'Mumbai' | 'Sanpada'
  customerName: string;
  customerPhone: string | null;
  productName: string;
  thicknessMm: number;
  color: string | null;
  widthMm: number;
  heightMm: number;
  formattedDimensions: string; // e.g. "400 × 500 mm (1' 4" × 1' 8")"
  pieceIndex: number; // 1-indexed
  totalQty: number; // total in this item
  isPolished?: boolean;
  cutWidthMm?: number;
  cutHeightMm?: number;
}

export interface OrderWithItemsForLabels {
  id: string;
  order_no: number;
  store: string;
  customer: {
    name: string;
    phone: string | null;
  };
  order_items: {
    id: string;
    width_mm: number;
    height_mm: number;
    qty: number;
    is_polished?: boolean;
    product: {
      name: string;
      thickness_mm: number;
      color: string | null;
    };
  }[];
}

