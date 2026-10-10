/**
 * Central database and system error sanitizer.
 * Converts raw PostgreSQL, PostgREST, and Supabase error messages into clean,
 * user-friendly descriptions.
 * - Retains intentional plain-language business exceptions from custom RPCs.
 * - Maps known constraint, trigger, network, and permission patterns.
 * - Suppresses internal database schema details (table, column, constraint names).
 */
export function friendlyDatabaseError(
  error: unknown,
  fallback: string = 'An unexpected error occurred. Please try again.',
): string {
  if (!error) return fallback;

  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? String(error);

  const trimmed = rawMessage.trim();
  if (!trimmed) return fallback;

  const lower = trimmed.toLowerCase();

  // 1. Network & Connectivity
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('connection refused') ||
    lower.includes('fetch failed')
  ) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  // 2. Auth & Session
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Invalid email or password. Please try again.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email has not been confirmed. Contact the admin.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (
    lower.includes('jwt expired') ||
    lower.includes('token expired') ||
    lower.includes('session expired')
  ) {
    return 'Your session has expired. Please log in again.';
  }

  // 3. Permissions & RLS
  if (
    lower.includes('permission denied') ||
    lower.includes('violates row-level security policy') ||
    lower.includes('not authenticated')
  ) {
    return 'You do not have permission to perform this action.';
  }

  // 4. Cutting & Cut Plans (Intentional RPC exceptions & constraints)
  if (lower.includes('already confirmed')) {
    return 'This cut plan has already been confirmed for this order and product. The queue will refresh.';
  }
  if (
    lower.includes('no longer available') ||
    lower.includes('consumed or removed by another user')
  ) {
    return 'One or more stock sheets are no longer available. Please refresh your available stock.';
  }
  if (
    lower.includes('cancelled, delivered or already fully cut') ||
    lower.includes('cannot cut an order that is cancelled')
  ) {
    return 'This order was cancelled or already completed. Please refresh the cutting queue.';
  }
  if (
    lower.includes('does not match ordered quantity') ||
    lower.includes('piece count does not match')
  ) {
    return 'Piece count does not match the ordered quantity. Please ensure all ordered pieces are placed.';
  }
  if (lower.includes('exceed ordered quantity') || lower.includes('exceeded ordered quantity')) {
    return 'Total cut pieces would exceed the ordered quantity for one or more items.';
  }
  if (
    lower.includes('do not belong to this order') ||
    lower.includes('do not belong to the selected orders')
  ) {
    return 'One or more pieces do not belong to this order and product.';
  }
  if (lower.includes('offcut parent sheet is not one of the consumed sheets')) {
    return 'Validation failed: Offcut parent sheet was not one of the consumed sheets.';
  }
  if (lower.includes('no pieces placed on this sheet') || lower.includes('no orders specified')) {
    return 'Please place ordered pieces on a sheet before confirming.';
  }

  // 5. Stock & Lining Triggers
  if (
    lower.includes('vertical_line_height') ||
    lower.includes('lining') ||
    lower.includes('check_lining_stock')
  ) {
    return 'Figured glass (lining) requires a vertical line height. Please enter it before saving.';
  }

  // 6. Orders Lifecycle & Items
  if (lower.includes('order must have at least one item')) {
    return 'An order must have at least one item.';
  }
  if (lower.includes('order not found')) {
    return 'The requested order could not be found.';
  }
  if (lower.includes('order is already cancelled')) {
    return 'This order is already cancelled.';
  }
  if (lower.includes('orders_store_check') || (lower.includes('store') && lower.includes('check'))) {
    return 'Please select a valid store (Mumbai or Sanpada).';
  }

  // 7. Dimension & Quantity Constraints
  if (lower.includes('width') && (lower.includes('> 0') || lower.includes('check'))) {
    return 'Width must be greater than zero.';
  }
  if (lower.includes('height') && (lower.includes('> 0') || lower.includes('check'))) {
    return 'Height must be greater than zero.';
  }
  if (lower.includes('qty') && (lower.includes('> 0') || lower.includes('check'))) {
    return 'Quantity must be at least 1.';
  }

  // 8. Raw SQL / Schema leak detection: suppress technical leaks
  const hasRawSqlKeywords =
    lower.includes('syntax error') ||
    lower.includes('violates foreign key constraint') ||
    lower.includes('violates check constraint') ||
    lower.includes('violates unique constraint') ||
    lower.includes('duplicate key value') ||
    lower.includes('relation "') ||
    lower.includes('column "') ||
    lower.includes('null value in column') ||
    lower.includes('psql') ||
    lower.includes('sqlstate') ||
    lower.includes('pg_') ||
    (lower.includes('function ') && lower.includes(' does not exist'));

  if (hasRawSqlKeywords) {
    return fallback;
  }

  // Preserve intentional plain English messages
  return trimmed;
}
