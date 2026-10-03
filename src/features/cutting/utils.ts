/**
 * Pure helper utilities for cutting feature.
 * Zero external framework dependencies.
 */

export function friendlyConfirmCutError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already confirmed')) {
    return 'This cut plan has already been confirmed for this order and product. The screen will refresh.';
  }
  if (lower.includes('no longer available')) {
    return 'One or more stock sheets are no longer available (they may have been consumed or removed by another user). Please refresh your available stock and re-run the layout.';
  }
  if (lower.includes('does not match ordered quantity')) {
    return 'Piece count does not match the ordered quantity. Please ensure all ordered pieces are placed.';
  }
  if (lower.includes('do not belong to this order')) {
    return 'One or more pieces do not belong to this order and product.';
  }
  if (lower.includes('offcut parent sheet is not one of the consumed sheets')) {
    return 'Validation failed: Offcut parent sheet was not one of the consumed sheets.';
  }
  return message;
}
