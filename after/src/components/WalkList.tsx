import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// One request instead of one per walk: the walker's name comes in the same query.
export default function WalkList({ userId }) {
  const [walks, setWalks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('bookings').select('id, slot, status, walkers(name)').eq('user_id', userId).order('slot')
      .then(({ data, error }) => (error ? setError(error.message) : setWalks(data)));
  }, [userId]);

  if (error) return <p role="alert">Could not load your walks: {error}</p>;
  const fmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
  return <ul>{walks.map((w) => <li key={w.id}>{fmt.format(new Date(w.slot))} · {w.walkers?.name}</li>)}</ul>;
}
