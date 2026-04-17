import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with the Service Role key.
 * ONLY USE THIS IN SERVER-SIDE CODE (API Routes, Server Actions).
 * This client bypasses RLS and can be used for system operations like broadcasting.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
