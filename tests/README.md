# Attack tests

```
npm install
npm test
```
- `supabase-shim.sql` — Supabase roles and auth functions for plain PostgreSQL.
- `seed.sql` — 2 customers, 2 walkers, 3 walk types, 2 bookings (times stored as text, the way the old form saved them).
- `attacks.mjs` — every finding against the "before" and "after" databases, normal actions on "after", the migration on dirty data, and a list of abuse that has already happened; writes `report/results.js`.

Exit code 1 if "after" still lets something through or breaks a normal action.
