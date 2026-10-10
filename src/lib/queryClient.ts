import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

let lastUserId: string | null = null;

/**
 * Handles auth user session transitions for the query client:
 * 1. Clears all cached query data when signing out (userId is null or empty).
 * 2. Clears all cached query data if a different user signs in (switching accounts on same device).
 */
export function handleAuthUserChange(userId: string | null | undefined): void {
  const normalizedId = userId ?? null;
  if (!normalizedId) {
    // User signed out
    queryClient.clear();
    lastUserId = null;
  } else if (lastUserId && lastUserId !== normalizedId) {
    // Different user signed in on the same device
    queryClient.clear();
    lastUserId = normalizedId;
  } else {
    // Same user or initial sign-in
    lastUserId = normalizedId;
  }
}

/** Reset last user ID tracking (used in unit tests) */
export function resetLastUserIdForTesting(id: string | null = null): void {
  lastUserId = id;
}
