import { createClient } from '@supabase/supabase-js';

// Only the public key ever reaches the browser. What a user may see is decided by the
// database policies (supabase/migrations/0002_security_fixes.sql), not by this file.
// The service key lives only in server-side code (edge functions) and was rotated after the review.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
