import { createClient } from '@supabase/supabase-js';

// Admin page needs to see everything, so we use the service key when the owner is logged in.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(url, anonKey);
export const supabaseAdmin = createClient(url, serviceKey);
