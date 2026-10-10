import { friendlyDatabaseError } from '../friendlyDatabaseError';

describe('FINDING-05 [ERR-01]: Central friendlyDatabaseError Helper', () => {
  it('translates network connectivity failures', () => {
    expect(friendlyDatabaseError('TypeError: Failed to fetch')).toBe(
      'Unable to connect to the server. Please check your internet connection.',
    );
    expect(friendlyDatabaseError(new Error('Network request failed'))).toBe(
      'Unable to connect to the server. Please check your internet connection.',
    );
  });

  it('translates auth and RLS permission failures', () => {
    expect(
      friendlyDatabaseError('Invalid login credentials'),
    ).toBe('Invalid email or password. Please try again.');
    expect(
      friendlyDatabaseError('Email not confirmed'),
    ).toBe('Your email has not been confirmed. Contact the admin.');
    expect(
      friendlyDatabaseError('Too many requests. Rate limit exceeded.'),
    ).toBe('Too many attempts. Please wait a minute and try again.');
    expect(
      friendlyDatabaseError('new row violates row-level security policy for table "orders"'),
    ).toBe('You do not have permission to perform this action.');
    expect(friendlyDatabaseError('permission denied for table stock_items')).toBe(
      'You do not have permission to perform this action.',
    );
  });

  it('preserves intentional RPC business messages with friendly phrasing', () => {
    expect(
      friendlyDatabaseError('Cannot cut an order that is cancelled, delivered or already fully cut'),
    ).toBe('This order was cancelled or already completed. Please refresh the cutting queue.');

    expect(
      friendlyDatabaseError('One or more stock sheets are no longer available'),
    ).toBe('One or more stock sheets are no longer available. Please refresh your available stock.');

    expect(
      friendlyDatabaseError('An order must have at least one item'),
    ).toBe('An order must have at least one item.');

    expect(
      friendlyDatabaseError('Order not found'),
    ).toBe('The requested order could not be found.');
  });

  it('translates lining glass trigger exceptions', () => {
    expect(
      friendlyDatabaseError('error: check_lining_stock failed: vertical_line_height_mm is null'),
    ).toBe('Figured glass (lining) requires a vertical line height. Please enter it before saving.');
  });

  it('translates dimension and check constraint errors', () => {
    expect(
      friendlyDatabaseError('new row for relation "stock_items" violates check constraint "stock_items_width_mm_check"'),
    ).toBe('Width must be greater than zero.');

    expect(
      friendlyDatabaseError('new row for relation "orders" violates check constraint "orders_store_check"'),
    ).toBe('Please select a valid store (Mumbai or Sanpada).');
  });

  it('suppresses raw Postgres SQL leaks and falls back to safe generic message', () => {
    const rawSqlLeak =
      'ERROR: 42601: syntax error at or near "SELECT" psql state 42601 in relation "public.orders"';
    expect(friendlyDatabaseError(rawSqlLeak)).toBe(
      'An unexpected error occurred. Please try again.',
    );

    const fKeyLeak =
      'insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey" DETAIL: Key (customer_id)=(...) is not present in table "customers".';
    expect(friendlyDatabaseError(fKeyLeak)).toBe(
      'An unexpected error occurred. Please try again.',
    );
  });

  it('handles null, undefined and empty inputs with default fallback', () => {
    expect(friendlyDatabaseError(null)).toBe('An unexpected error occurred. Please try again.');
    expect(friendlyDatabaseError(undefined)).toBe('An unexpected error occurred. Please try again.');
    expect(friendlyDatabaseError('')).toBe('An unexpected error occurred. Please try again.');
  });
});
