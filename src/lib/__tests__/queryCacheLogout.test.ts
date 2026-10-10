import {
  handleAuthUserChange,
  queryClient,
  resetLastUserIdForTesting,
} from '../queryClient';
import { orderKeys } from '../../features/orders/queries';
import { inventoryKeys } from '../../features/inventory/queries';
import { activityLogKeys } from '../../features/settings/queries';

jest.mock('../supabase', () => ({
  supabase: {},
}));

describe('FINDING-01 [SEC-15]: Query Cache Clear on Logout and User Switching', () => {
  beforeEach(() => {
    queryClient.clear();
    resetLastUserIdForTesting(null);
  });

  it('proves cached orders, stock and activity data are completely purged after logout', () => {
    // 1. User logs in
    handleAuthUserChange('user-mumbai-1');

    // 2. Populate TanStack Query cache with business data
    queryClient.setQueryData(orderKeys.all, [
      { id: 'order-1', order_no: 101, customer_name: 'Confidential Customer' },
    ]);
    queryClient.setQueryData(inventoryKeys.all, [
      { id: 'stock-1', width_mm: 1220, height_mm: 2440, source: 'full' },
    ]);
    queryClient.setQueryData(activityLogKeys.all, [
      { id: 'log-1', summary: 'Order #101 created', action: 'insert' },
    ]);

    // Verify cache holds the active session data
    expect(queryClient.getQueryData(orderKeys.all)).toBeDefined();
    expect(queryClient.getQueryData(inventoryKeys.all)).toBeDefined();
    expect(queryClient.getQueryData(activityLogKeys.all)).toBeDefined();
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    // 3. User logs out (session becomes null)
    handleAuthUserChange(null);

    // 4. Assert: ALL cached query data is completely purged
    expect(queryClient.getQueryData(orderKeys.all)).toBeUndefined();
    expect(queryClient.getQueryData(inventoryKeys.all)).toBeUndefined();
    expect(queryClient.getQueryData(activityLogKeys.all)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('purges cache when a different user signs in on the same device', () => {
    // User A signs in and loads orders
    handleAuthUserChange('user-a');
    queryClient.setQueryData(orderKeys.all, [{ id: 'order-a', secret: 'data-a' }]);
    expect(queryClient.getQueryData(orderKeys.all)).toBeDefined();

    // User B signs in (switching accounts on shared phone)
    handleAuthUserChange('user-b');

    // User A's cached orders must be cleared
    expect(queryClient.getQueryData(orderKeys.all)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('preserves cache when the same user token refreshes or remains signed in', () => {
    handleAuthUserChange('user-a');
    queryClient.setQueryData(orderKeys.all, [{ id: 'order-a' }]);

    // Same user session refresh
    handleAuthUserChange('user-a');
    expect(queryClient.getQueryData(orderKeys.all)).toBeDefined();
  });
});
