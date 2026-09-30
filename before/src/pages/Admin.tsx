import { useEffect, useState } from 'react';
import { supabase, supabaseAdmin } from '../lib/supabase';

export default function Admin({ user }) {
  const [rows, setRows] = useState([]);
  const isOwner = user?.user_metadata?.role === 'admin';

  useEffect(() => {
    if (!isOwner) return;
    supabaseAdmin.from('bookings').select('*, customers(full_name, phone, address)').then(({ data }) => setRows(data));
  }, [isOwner]);

  if (!isOwner) return <p>Not allowed</p>;
  return <table>{/* bookings with customer name, phone, address, price */}</table>;
}
