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
  orderNo: number;
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
  orderItems: {
    orderItemId: string;
    widthMm: number;
    heightMm: number;
    qty: number;
    isPolished?: boolean;
    finishedWidthMm?: number;
    finishedHeightMm?: number;
  }[];
}

