import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// The page is still hidden from customers, but that is only for tidiness:
// the database returns all bookings only to users whose app_metadata.role is 'admin'.
export default function Admin({ user }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const isOwner = user?.app_metadata?.role === 'admin';

  useEffect(() => {
    if (!isOwner) return;
    supabase.from('bookings').select('*, customers(full_name, phone, address)').order('slot')
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data)));
  }, [isOwner]);

  if (!isOwner) return <p>Not allowed</p>;
  if (error) return <p role="alert">Could not load bookings: {error}</p>;
  return <table>{/* bookings with customer name, phone, address, price */}</table>;
}
