import { OptimizerPiece, OptimizerSheet } from '../../optimizer/types';

export interface CuttingPiece extends OptimizerPiece {
  order_id: string;
  order_no: number;
  customer_name: string;
  piece_index: number;
  total_qty: number;
}

export interface PlacedPiece extends CuttingPiece {
  stock_item_id: string;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  rotated: boolean;
  hasCollision?: boolean;
}

export interface CuttingSheet extends OptimizerSheet {
  isNewBlankSheet?: boolean;
}

export interface CuttingQueueTask {
  orderId: string;
  orderIds: string[];
  orderNo: number;
  orderNos: number[];
  store: string;
  customerName: string;
  customerPhone: string | null;
  productId: string;
  productName: string;
  categoryName: string;
  thicknessMm: number;
  color: string | null;
  isLining: boolean;
  totalPiecesCount: number;
  isPartiallyCut?: boolean;
  orderItems: {
    orderItemId: string;
    orderId: string;
    orderNo: number;
    customerName: string;
    widthMm: number;
    heightMm: number;
    qty: number;
    originalQty?: number;
    cutQty?: number;
    isPolished?: boolean;
    finishedWidthMm?: number;
    finishedHeightMm?: number;
  }[];
  ordersSummary?: {
    orderId: string;
    orderNo: number;
    customerName: string;
    store: string;
    piecesCount: number;
  }[];
}

