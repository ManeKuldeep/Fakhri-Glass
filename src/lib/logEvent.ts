import { supabase } from './supabase';

/**
 * Calls the `log_event` RPC to write an event row to the activity log.
 * Used for login, logout, label printing, and backup export.
 * Errors are swallowed — logging should never block the user.
 */
export async function logEvent(summary: string): Promise<void> {
  const { error } = await supabase.rpc('log_event', { p_summary: summary });
  if (error) {
    console.warn('log_event failed:', error.message);
  }
}
