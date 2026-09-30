import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function WalkList({ userId }) {
  const [walks, setWalks] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('bookings').select('*').eq('user_id', userId).order('slot');
      const withWalker = [];
      for (const b of data) {
        const { data: w } = await supabase.from('walkers').select('name').eq('id', b.walker_id).single();
        withWalker.push({ ...b, walkerName: w.name });
      }
      setWalks(withWalker);
    })();
  }, [userId]);

  return <ul>{walks.map((w) => <li key={w.id}>{w.slot} · {w.walkerName}</li>)}</ul>;
}
