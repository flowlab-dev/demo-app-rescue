import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/toast';

const PRICES: Record<string, number> = { 'solo-30': 1400, 'solo-60': 2200, 'group-60': 1500 };

export default function Book({ customer, walkers }) {
  const [walker, setWalker] = useState(walkers[0]?.id);
  const [type, setType] = useState('solo-30');
  const [day, setDay] = useState('2026-10-03');
  const [time, setTime] = useState('9:00');

  async function submit() {
    await supabase.from('bookings').insert({
      customer_id: customer.id,
      user_id: customer.user_id,
      walker_id: walker,
      walk_type: type,
      slot: `${day} ${time}`,
      price_pence: PRICES[type],
    });
    toast('Booked! See you then 🐾');
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {/* walker, type, day and time pickers */}
      <button>Book walk</button>
    </form>
  );
}
