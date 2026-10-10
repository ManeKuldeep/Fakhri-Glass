import * as dotenv from 'dotenv';
import * as path from 'path';

// Force loading .env.test ONLY — never .env
const testEnvPath = path.resolve(process.cwd(), '.env.test');
dotenv.config({ path: testEnvPath, override: true, quiet: true });

/**
 * Ensures database tests run ONLY against a local Supabase / PostgreSQL instance.
 * Refuses execution if SUPABASE_URL is undefined or points to any non-localhost host.
 */
export function assertLocalStackUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      'SUPABASE_URL is not configured. Please ensure .env.test exists and defines SUPABASE_URL=http://127.0.0.1:54321',
    );
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error(
        `FATAL SECURITY VIOLATION: Refusing to run tests against host "${parsed.hostname}". Database tests must ONLY run against localhost or 127.0.0.1.`,
      );
    }
    return url;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('FATAL SECURITY VIOLATION')) {
      throw err;
    }
    throw new Error(`Invalid SUPABASE_URL: "${url}"`);
  }
}

export const TEST_SUPABASE_URL = assertLocalStackUrl(process.env.SUPABASE_URL);
export const TEST_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
export const TEST_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
