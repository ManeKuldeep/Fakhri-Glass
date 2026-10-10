import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  TEST_SUPABASE_URL,
  TEST_SUPABASE_ANON_KEY,
  TEST_SUPABASE_SERVICE_ROLE_KEY,
} from './guard';
import { Database } from '../../src/types/database';

/**
 * Superuser / Admin client using local service_role key.
 * Strictly forbidden in application code; used ONLY in test harness for:
 * 1. Creating test auth users via GoTrue admin API
 * 2. Seeding multi-tenant test shops and profiles
 * 3. Resetting / cleaning up test data between runs
 */
export const adminClient = createClient<Database>(
  TEST_SUPABASE_URL,
  TEST_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

export interface TestUserSession {
  user: { id: string; email: string };
  client: SupabaseClient<Database>;
  token: string;
  shopId: string;
}

/**
 * Creates or gets an auth user and returns an authenticated Supabase client
 * operating under that user's session with RLS and caller permissions.
 */
export async function createTestUserSession(
  email: string,
  fullName: string,
  assignment: 'mumbai' | 'sanpada' | 'cutter',
  shopId: string,
): Promise<TestUserSession> {
  const password = 'TestPassword123!';

  // 1. Check if user already exists in GoTrue
  const { data: listData } = await adminClient.auth.admin.listUsers();
  const existing = listData?.users.find((u) => u.email === email);

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !createData.user) {
      throw new Error(`Failed to create test user ${email}: ${createErr?.message}`);
    }
    userId = createData.user.id;
  }

  // 2. Ensure profile exists and is assigned to the target shop
  const { error: profileErr } = await adminClient.from('profiles').upsert({
    id: userId,
    shop_id: shopId,
    full_name: fullName,
    assignment,
  });

  if (profileErr) {
    throw new Error(`Failed to create/update profile for ${email}: ${profileErr.message}`);
  }

  // 3. Sign in to obtain user JWT
  const userAnonClient = createClient<Database>(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authErr } = await userAnonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authData.session) {
    throw new Error(`Failed to sign in test user ${email}: ${authErr?.message}`);
  }

  // 4. Create client with authenticated user token in headers
  const authenticatedClient = createClient<Database>(
    TEST_SUPABASE_URL,
    TEST_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`,
        },
      },
    },
  );

  return {
    user: { id: userId, email },
    client: authenticatedClient,
    token: authData.session.access_token,
    shopId,
  };
}

/**
 * Creates an unauthenticated (anon) client
 */
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Helper to fetch the primary seeded shop or create an additional shop
 */
export async function getOrCreateShop(name: string): Promise<string> {
  const { data: existing } = await adminClient
    .from('shops')
    .select('id')
    .eq('name', name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await adminClient
    .from('shops')
    .insert({ name })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Failed to create shop ${name}: ${error?.message}`);
  }

  return created.id;
}
