import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from '../components/toast';

// The price is not sent from here any more: book_walk() takes it from walk_types.
export default function Book({ walkers }) {
  const [walker, setWalker] = useState(walkers[0]?.id);
  const [type, setType] = useState('solo-30');
  const [day, setDay] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()));
  const [time, setTime] = useState('09:00');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    // The time picked is UK time wherever the customer's phone is set; the database turns it
    // into an exact moment (timestamptz), so BST and GMT both come out right.
    const slot = `${day} ${time}:00 Europe/London`;
    const { error } = await supabase.rpc('book_walk', { p_walker: walker, p_walk_type: type, p_slot: slot });
    setBusy(false);
    if (error) {
      toast(error.code === '23505' ? 'Sorry, that slot has just been taken. Please pick another.' : error.message, 'error');
      return;
    }
    toast('Booked! See you then 🐾');
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {/* walker, type, day and time pickers */}
      <button disabled={busy}>{busy ? 'Booking…' : 'Book walk'}</button>
    </form>
  );
}
