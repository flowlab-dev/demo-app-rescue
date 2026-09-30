# App rescue: reviewing an app built with an AI builder (demo)

A self-initiated demo by Flow Lab on made-up data, not client work. Walkwren, a dog-walk booking app on React and Supabase "built with an AI app builder", is invented, and so is its customer, Kettleby Dog Walks. The code was written to look like typical AI-builder output, then reviewed and fixed.

- Live report: https://flowlab-dev.github.io/demo/app-rescue/
- Case study: https://flowlab-dev.github.io/work/app-rescue/

## What was found

| | Finding | How it was checked |
|---|---|---|
| F1 | The customers table is readable by anyone (addresses, phone numbers) | attack on the database |
| F2 | A `service_role` key is referenced from browser code | reading the code |
| F3 | The browser sends the booking price, so a booking can cost £0 | attack on the database |
| F4 | "Admin" comes from `user_metadata`, which users can edit themselves | attack on the database |
| F5 | A customer can change the price of their booking or book under someone else's name; with F4, change other people's bookings | attack on the database |
| F6 | Double-booking a walker: same slot, +30 seconds, overlapping walks | attack on the database |
| F7 | Times stored as text: "10:00" sorts before "9:00", no time zone | check on the database |
| F8 | "Booked!" is shown even when saving fails | reading the code |
| F9 | One query per walk (N+1) | reading the code |
| F10 | Prices and walkers are unprotected: anyone can set a price of 1p | attack on the database |

About F2: `before/src/lib/supabase.ts` only reads the variable `VITE_SUPABASE_SERVICE_ROLE_KEY`. There is no real key anywhere in this repository. The finding is that a `VITE_` variable ends up in the browser bundle.

Result: 16 of 16 attacks work on "before" and none get through on "after". 20 of 20 normal actions still work on "after", including the migration over existing rows with broken data.

## Layout

- `before/` is the app as generated: `src/` (React) and `supabase/migrations/0001_init.sql`.
- `after/` is the fixed app: the same files plus `supabase/migrations/0002_security_fixes.sql`, applied on top of existing rows.
- `tests/` runs every finding as an attack on real PostgreSQL 18 (PGlite, in memory) with Supabase's roles and auth functions recreated. See `tests/README.md`.
- `report/` is the report page. The tests write `report/results.js`.

## Run it

You need Node.js 18 or newer.

    npm install
    npm test

Then open `report/index.html`.

## How it was built

Built by Flow Lab with Claude Code. Every problem was first reproduced with an attack on the database, then fixed and attacked again. The interface was checked by reading the code.

## The same check for your app

The first step is a review of data access, security and broken flows, with a before and after report: $350, 3 days. Fixes are then quoted from the report at a fixed price per fix. Write to trading.flowlab@gmail.com or @flowlabdev on Telegram.

## License

MIT
