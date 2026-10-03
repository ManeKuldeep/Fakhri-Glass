import { OptimizerPiece, OptimizerSheet } from '../types';

export const SAMPLE_SHEETS: OptimizerSheet[] = [
  // Full sheets (standard Indian architectural glass sizes in mm)
  {
    id: 'sheet-full-1',
    width_mm: 2440,
    height_mm: 1830,
    source: 'full',
    is_lining: false,
  },
  {
    id: 'sheet-full-2',
    width_mm: 3048,
    height_mm: 2134,
    source: 'full',
    is_lining: false,
  },
  // Small and medium offcuts
  {
    id: 'sheet-offcut-small',
    width_mm: 600,
    height_mm: 800,
    source: 'offcut',
    is_lining: false,
  },
  {
    id: 'sheet-offcut-medium',
    width_mm: 1200,
    height_mm: 900,
    source: 'offcut',
    is_lining: false,
  },
  // Lining full sheet (e.g. 5mm Clear Moru)
  {
    id: 'sheet-lining-full',
    width_mm: 2134,
    height_mm: 1524,
    source: 'full',
    is_lining: true,
    vertical_line_height_mm: 1524,
  },
  // Lining offcut
  {
    id: 'sheet-lining-offcut',
    width_mm: 800,
    height_mm: 1524,
    source: 'offcut',
    is_lining: true,
    vertical_line_height_mm: 1524,
  },
];

export const SAMPLE_PIECES: OptimizerPiece[] = [
  {
    id: 'p-1',
    order_item_id: 'oi-1',
    width_mm: 400,
    height_mm: 500,
    is_lining: false,
  },
  {
    id: 'p-2',
    order_item_id: 'oi-1',
    width_mm: 400,
    height_mm: 500,
    is_lining: false,
  },
  {
    id: 'p-3',
    order_item_id: 'oi-2',
    width_mm: 700,
    height_mm: 350,
    is_lining: false,
  },
];

export const SAMPLE_LINING_PIECES: OptimizerPiece[] = [
  {
    id: 'lp-1',
    order_item_id: 'oi-lining-1',
    width_mm: 300,
    height_mm: 600,
    is_lining: true,
  },
  {
    id: 'lp-2',
    order_item_id: 'oi-lining-1',
    width_mm: 450,
    height_mm: 700,
    is_lining: true,
  },
];
