// Every finding of the review as a test that tries the attack, on two databases:
//   before — 0001_init.sql as the app builder generated it
//   after  — the same, plus 0002_security_fixes.sql applied on top of existing rows
// Real PostgreSQL 18 (PGlite, in memory) with Supabase's roles and auth functions recreated
// (tests/supabase-shim.sql). Frontend findings are checked by reading the code.
//
//   npm install && npm test          (or PGLITE_DIR=/path/with/node_modules node tests/attacks.mjs)
// Writes report/results.js for the report page. Exit code 1 if «after» still lets any attack through
// or blocks something a legitimate user needs.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.PGLITE_DIR || ROOT; // default: this repo after `npm install`
const { PGlite } = await import(createRequire(join(dir, 'x.js')).resolve('@electric-sql/pglite'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const USERS = {
  anon: { role: 'anon', claims: {} },
  alice: { role: 'authenticated', claims: { sub: '11111111-1111-1111-1111-111111111111', role: 'authenticated' } },
  ben: { role: 'authenticated', claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated' } },
  benAsAdmin: { role: 'authenticated', claims: { sub: '22222222-2222-2222-2222-222222222222', role: 'authenticated', user_metadata: { role: 'admin' } } },
  owner: { role: 'authenticated', claims: { sub: '99999999-9999-9999-9999-999999999999', role: 'authenticated', app_metadata: { role: 'admin' } } },
  server: { role: 'service_role', claims: { role: 'service_role' } },
};
const PRIYA = 'a0000000-0000-0000-0000-00000000000a';
const ALICE = USERS.alice.claims.sub;

async function database(version) {
  const db = new PGlite();
  await db.exec("set timezone to 'UTC'"); // as on Supabase
  await db.exec(read('tests/supabase-shim.sql'));
  await db.exec(read('before/supabase/migrations/0001_init.sql'));
  await db.exec(read('tests/seed.sql'));
  if (version === 'after') await db.exec(read('after/supabase/migrations/0002_security_fixes.sql'));
  return db;
}

async function as(db, who) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(USERS[who].claims)]);
  await db.exec(`set role ${USERS[who].role}`);
}

// Runs one attempt; returns { through, detail }. «through» — the attack (or the action) succeeded.
async function attempt(fn) {
  try { return await fn(); } catch (e) { return { through: false, detail: 'refused by the database: ' + e.message }; }
}

const TOM = 'b0000000-0000-0000-0000-00000000000b';
const ALICE_C = 'c1000000-0000-0000-0000-000000000001';
const BEN_C = 'c2000000-0000-0000-0000-000000000002';

// Dates counted from today, so the tests never go stale. `at(7, '11:00')` → a UK time a week ahead,
// `raw(...)` → the same as the old form saved it (text).
function ymd(days) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + days * 86400e3));
}
const at = (days, hm) => `${ymd(days)} ${hm} Europe/London`;
const raw = (days, hm) => `${ymd(days)} ${hm}`;

// «before»: the old form inserts straight into the table; «after»: the only way in is book_walk().
async function book(db, version, who, walker, type, days, hm) {
  await as(db, who);
  if (version === 'before') {
    const cid = who === 'alice' ? ALICE_C : BEN_C;
    const price = { 'solo-30': 1400, 'solo-60': 2200, 'group-60': 1500 }[type];
    await db.query(`insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence)
      values ($1, $2, $3, $4, $5, $6)`, [cid, USERS[who].claims.sub, walker, type, raw(days, hm), price]);
  } else {
    await db.query('select public.book_walk($1, $2, $3)', [walker, type, at(days, hm)]);
  }
}
const clash = (first, second, story) => async (db, version) => {
  await book(db, version, 'alice', ...first);
  return attempt(async () => { await book(db, version, 'ben', ...second); return { through: true, detail: story }; });
};

const DB_CHECKS = [
  { id: 'F1', who: 'anyone with the public key', what: 'read every customer’s name, phone and address', run: async (db) => {
    await as(db, 'anon');
    const r = await db.query('select full_name, phone, address from public.customers');
    return { through: r.rows.length > 0, detail: r.rows.length ? `read ${r.rows.length} customers, e.g. ${r.rows[0].full_name}, ${r.rows[0].phone}` : 'saw no rows' };
  } },
  { id: 'F1', who: 'anyone with the public key', what: 'change a customer’s phone number', run: async (db) => {
    await as(db, 'anon');
    const r = await db.query("update public.customers set phone = '000' where full_name = 'Alice Carter'");
    return { through: r.affectedRows > 0, detail: r.affectedRows ? 'phone number changed' : 'no row changed' };
  } },
  { id: 'F3', who: 'a signed-in customer', what: 'book a walk for £0', run: async (db) => {
    await as(db, 'alice');
    const r = await db.query(`insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence)
      values ($1, $2, $3, 'solo-60', $4, 0) returning price_pence`, [ALICE_C, ALICE, PRIYA, raw(9, '12:00')]);
    return { through: r.rows[0]?.price_pence === 0, detail: 'a 60-minute walk booked at £0.00' };
  } },
  { id: 'F4', who: 'a customer who sets role: admin in their own profile', what: 'see every booking', run: async (db) => {
    await as(db, 'benAsAdmin');
    const r = await db.query('select count(*)::int n from public.bookings');
    return { through: r.rows[0].n > 1, detail: `saw ${r.rows[0].n} bookings (their own: 1)` };
  } },
  { id: 'F5', who: 'a signed-in customer', what: 'lower the price of their own booking', run: async (db) => {
    await as(db, 'ben');
    const r = await db.query('update public.bookings set price_pence = 1 where user_id = $1', [USERS.ben.claims.sub]);
    return { through: r.affectedRows > 0, detail: r.affectedRows ? 'their walk now costs 1p' : 'no row changed' };
  } },
  { id: 'F5', who: 'a signed-in customer', what: 'put a booking on someone else’s customer record', run: async (db) => {
    await as(db, 'ben');
    const r = await db.query(`insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence)
      values ($1, $2, $3, 'solo-30', $4, 1400)`, [ALICE_C, USERS.ben.claims.sub, TOM, raw(9, '15:00')]);
    return { through: r.affectedRows > 0, detail: 'a walk booked under Alice’s name and address' };
  } },
  { id: 'F5', who: 'a customer who sets role: admin in their own profile', what: 'cancel someone else’s booking or change its price', run: async (db) => {
    // F4 lets them see other people's bookings; «customers update bookings … using (true)» then lets them change them.
    await as(db, 'benAsAdmin');
    const a = await attempt(async () => {
      const r = await db.query("update public.bookings set status = 'cancelled' where user_id = $1", [ALICE]);
      return { through: r.affectedRows > 0, detail: r.affectedRows ? 'Alice’s booking cancelled by Ben' : 'no row changed' };
    });
    const b = await attempt(async () => {
      const r = await db.query('update public.bookings set price_pence = 1 where user_id = $1', [ALICE]);
      return { through: r.affectedRows > 0, detail: r.affectedRows ? 'price of Alice’s walk set to 1p' : 'no row changed' };
    });
    return { through: a.through || b.through, detail: `status: ${a.detail}; price: ${b.detail}` };
  } },
  { id: 'F6', who: 'two customers at the same moment', what: 'book the same walker for the same slot',
    run: clash(['a0000000-0000-0000-0000-00000000000a', 'solo-30', 8, '11:00'], ['a0000000-0000-0000-0000-00000000000a', 'solo-30', 8, '11:00'], 'both saved: Priya booked twice at 11:00') },
  { id: 'F6', who: 'a customer who books 30 seconds later', what: 'slip past the same-slot check', run: async (db, version) => {
    if (version === 'before') return clash([PRIYA, 'solo-30', 8, '11:00'], [PRIYA, 'solo-30', 8, '11:00:30'], 'both saved, 30 seconds apart')(db, version);
    await book(db, version, 'alice', PRIYA, 'solo-30', 8, '11:00');
    return attempt(async () => { await as(db, 'ben'); await db.query('select public.book_walk($1, $2, $3)', [PRIYA, 'solo-30', at(8, '11:00:30')]); return { through: true, detail: 'both saved, 30 seconds apart' }; });
  } },
  { id: 'F6', who: 'a customer', what: 'book a walk that overlaps another one with the same walker',
    run: clash(['a0000000-0000-0000-0000-00000000000a', 'solo-60', 8, '12:00'], ['a0000000-0000-0000-0000-00000000000a', 'solo-30', 8, '12:15'], 'both saved: a 60-minute walk at 12:00 and a 30-minute one at 12:15') },
  { id: 'F7', who: 'the owner', what: 'gets the day’s walks in the wrong order', run: async (db, version) => {
    await as(db, 'server');
    const uk = version === 'before' ? 'slot::text' : "(slot at time zone 'Europe/London')::text";
    const r = await db.query(`select slot::text s, ${uk} uk from public.bookings where slot::text like '2026-10-03%' order by slot`);
    const first = r.rows[0];
    const wrong = /10:00/.test(first.s);
    return { through: wrong, detail: wrong ? `10:00 is listed before 9:00 (text order: ${r.rows.map((x) => x.s).join(', ')})` : `9:00 first: ${first.uk.slice(11, 16)} UK time, stored as ${first.s.slice(11, 16)} UTC` };
  } },
  { id: 'F10', who: 'anyone with the public key', what: 'change the price list', run: async (db) => {
    await as(db, 'anon');
    const r = await db.query("update public.walk_types set price_pence = 1 where id = 'solo-60'");
    return { through: r.affectedRows > 0, detail: r.affectedRows ? 'a 60-minute walk now costs 1p for everyone' : 'no row changed' };
  } },
  { id: 'F10', who: 'anyone with the public key', what: 'switch every walker off', run: async (db) => {
    await as(db, 'anon');
    const r = await db.query('update public.walkers set active = false');
    return { through: r.affectedRows > 0, detail: r.affectedRows ? `${r.affectedRows} walkers switched off: no one can book` : 'no row changed' };
  } },
];

// What legitimate users must still be able to do after the fixes.
const STILL_WORKS = [
  ['Alice reads her own details', async (db) => { await as(db, 'alice'); const r = await db.query('select full_name from public.customers'); return r.rows.length === 1 && r.rows[0].full_name === 'Alice Carter'; }],
  ['Alice books a walk; the price comes from the price list', async (db) => { await as(db, 'alice'); const r = await db.query('select (public.book_walk($1, $2, $3)).price_pence p', [PRIYA, 'solo-30', at(10, '09:15')]); return r.rows[0].p === 1400; }],
  ['Two dogs join the same group walk', async (db) => { await book(db, 'after', 'alice', TOM, 'group-60', 11, '10:00'); await book(db, 'after', 'ben', TOM, 'group-60', 11, '10:00'); return true; }],
  ['A dog is turned away when the group walk is full', async (db) => { await as(db, 'server'); await db.query("update public.walk_types set max_dogs = 2 where id = 'group-60'"); try { await book(db, 'after', 'alice', TOM, 'group-60', 11, '10:00'); return false; } catch (e) { return /taken/.test(e.message); } finally { await as(db, 'server'); await db.query("update public.walk_types set max_dogs = 4 where id = 'group-60'"); } }],
  ['Alice cancels her own booking', async (db) => { await as(db, 'alice'); const r = await db.query("update public.bookings set status = 'cancelled' where user_id = $1 and slot = '2026-10-03 10:00 Europe/London'", [ALICE]); return r.affectedRows === 1; }],
  ['The owner (admin set on the server) sees every booking', async (db) => { await as(db, 'owner'); const r = await db.query('select count(*)::int n from public.bookings'); return r.rows[0].n >= 4; }],
  ['The owner cancels a customer’s booking', async (db) => { await as(db, 'owner'); const r = await db.query("update public.bookings set status = 'cancelled' where user_id = $1", [USERS.ben.claims.sub]); return r.affectedRows >= 1; }],
  ['Everyone can still read the price list and the walkers', async (db) => { await as(db, 'anon'); const a = await db.query('select count(*)::int n from public.walk_types'); const b = await db.query('select count(*)::int n from public.walkers'); return a.rows[0].n === 3 && b.rows[0].n === 2; }],
  ['A booking for “infinity” or years ahead is refused', async (db) => { await as(db, 'alice'); for (const t of ['infinity', at(900, '10:00')]) { try { await db.query('select public.book_walk($1, $2, $3)', [PRIYA, 'solo-30', t]); return false; } catch (e) { if (!/future slot/.test(e.message)) return false; } } return true; }],
  ['An 11th open booking by one customer is refused', async (db) => {
    await as(db, 'ben');
    const open = async () => (await db.query("select count(*)::int n from public.bookings where status = 'booked' and slot > now()")).rows[0].n;
    for (let d = 20; d < 40; d++) {
      try { await db.query('select public.book_walk($1, $2, $3)', [TOM, 'solo-30', at(d, '14:00')]); }
      catch (e) { return (await open()) === 10 && /10 walks booked/.test(e.message); }
    }
    return false;
  }],
  ['The owner can’t set a made-up status', async (db) => { await as(db, 'owner'); try { await db.query("update public.bookings set status = 'whatever' where user_id = $1", [ALICE]); return false; } catch (e) { return /bookings_status_ok/.test(e.message); } }],
  ['A booking in the past is refused', async (db) => { await as(db, 'alice'); try { await db.query('select public.book_walk($1, $2, $3)', [PRIYA, 'solo-30', at(-3, '10:00')]); return false; } catch (e) { return /future slot/.test(e.message); } }],
  ['Old bookings survive the migration, 9:00 UK time stored as 08:00 UTC', async (db) => { await as(db, 'server'); const r = await db.query("select count(*)::int n, min(slot) at time zone 'UTC' m from public.bookings where slot < '2026-10-04'"); return r.rows[0].n === 2 && String(r.rows[0].m).includes('08:00'); }],
];

// The migration on data the old app could have produced: it must stop, name the rows, and change nothing.
async function dirtyMigration() {
  const out = [];
  for (const [label, sql] of [
    ['a slot typed as text (“tomorrow 10am”)', `insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values ('${ALICE_C}', '${ALICE}', '${TOM}', 'solo-30', 'tomorrow 10am', 1400)`],
    ['a date that does not exist (“2026-02-30 10:00”)', `insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values ('${ALICE_C}', '${ALICE}', '${TOM}', 'solo-30', '2026-02-30 10:00', 1400)`],
    ['the same time written two ways (“09:00” and “9:00”)', `insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values ('${BEN_C}', '22222222-2222-2222-2222-222222222222', '${PRIYA}', 'solo-30', '2026-10-03 09:00', 1400)`],
    ['overlapping walks (10:00 for an hour, then 10:30)', `insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values ('${BEN_C}', '22222222-2222-2222-2222-222222222222', '${PRIYA}', 'solo-30', '2026-10-03 10:30', 1400)`],
    ['a booking with no status', `insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence, status) values ('${BEN_C}', '22222222-2222-2222-2222-222222222222', '${TOM}', 'solo-30', '2026-10-05 10:00', 1400, null)`],
    ['a walker already booked twice', `insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values ('${BEN_C}', '22222222-2222-2222-2222-222222222222', '${PRIYA}', 'solo-30', '2026-10-03 10:00', 1400)`],
  ]) {
    const db = new PGlite();
    await db.exec("set timezone to 'UTC'");
    await db.exec(read('tests/supabase-shim.sql'));
    await db.exec(read('before/supabase/migrations/0001_init.sql'));
    await db.exec(read('tests/seed.sql'));
    await db.exec(sql);
    let msg = '';
    try { await db.exec(read('after/supabase/migrations/0002_security_fixes.sql')); } catch (e) { msg = e.message; await db.exec('rollback'); }
    const n = (await db.query('select count(*)::int n from public.bookings')).rows[0].n;
    const type = (await db.query("select data_type t from information_schema.columns where table_name = 'bookings' and column_name = 'slot'")).rows[0].t;
    out.push({ name: `The fix stops safely on ${label}: nothing changed, the rows are named`, ok: /Migration stopped/.test(msg) && n === 3 && type === 'text', detail: msg });
    await db.close();
  }
  // Abuse that may already have happened (F3, F5) shows up in a list only the owner can read.
  {
    const db = new PGlite();
    await db.exec("set timezone to 'UTC'");
    await db.exec(read('tests/supabase-shim.sql'));
    await db.exec(read('before/supabase/migrations/0001_init.sql'));
    await db.exec(read('tests/seed.sql'));
    await db.exec(`insert into public.bookings (customer_id, user_id, walker_id, walk_type, slot, price_pence) values
      ('${ALICE_C}', '${ALICE}', '${TOM}', 'solo-60', '2026-10-05 12:00', 0),
      ('${ALICE_C}', '22222222-2222-2222-2222-222222222222', '${TOM}', 'solo-30', '2026-10-05 15:00', 1400)`);
    await db.exec(read('after/supabase/migrations/0002_security_fixes.sql'));
    await as(db, 'server');
    const r = await db.query('select reason from public.bookings_to_review order by reason');
    let hidden = false;
    try { await as(db, 'owner'); await db.query('select 1 from public.bookings_to_review'); } catch { hidden = true; }
    out.push({ name: 'Past abuse is listed for the owner: a £0 booking and one filed under someone else’s name', ok: r.rows.length === 2 && hidden });
    await db.close();
  }
  return out;
}

function codeChecks() {
  const src = (v, f) => read(`${v}/src/${f}`);
  const env = (v) => read(`${v}/.env.example`);
  const checks = [
    { id: 'F2', who: 'anyone who opens the site', what: 'take the service key out of the page and bypass every rule',
      test: (v) => /SERVICE_ROLE/.test(src(v, 'lib/supabase.ts')) || /^VITE_SUPABASE_SERVICE_ROLE_KEY=/m.test(env(v)),
      yes: 'VITE_SUPABASE_SERVICE_ROLE_KEY is built into the public JavaScript', no: 'only the public key reaches the browser' },
    { id: 'F8', who: 'a customer whose booking fails', what: 'is still told “Booked!”',
      test: (v) => /toast\('Booked/.test(src(v, 'pages/Book.tsx')) && !/if \(error\)/.test(src(v, 'pages/Book.tsx')),
      yes: 'the insert result is never checked', no: 'errors are shown; a taken slot gets its own message' },
    { id: 'F9', who: 'a customer with many walks', what: 'waits for one request per walk',
      test: (v) => /for \((const|let) \w+ of [^)]*\)\s*\{\s*\n[^\n]*await supabase/.test(src(v, 'components/WalkList.tsx')),
      yes: '1 + N requests (walker name fetched inside the loop)', no: 'one request, walker name joined in' },
  ];
  return checks.map((c) => ({ id: c.id, who: c.who, what: c.what, kind: 'code',
    before: { through: c.test('before'), detail: c.test('before') ? c.yes : c.no },
    after: { through: c.test('after'), detail: c.test('after') ? c.yes : c.no } }));
}

const results = [];
for (const c of DB_CHECKS) {
  const row = { id: c.id, who: c.who, what: c.what, kind: 'database' };
  for (const v of ['before', 'after']) {
    const db = await database(v);
    row[v] = await attempt(() => c.run(db, v));
    await db.close();
  }
  results.push(row);
}
results.push(...codeChecks());
results.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

const works = [];
{
  const db = await database('after');
  for (const [name, fn] of STILL_WORKS) works.push({ name, ok: await fn(db).catch((e) => (console.error(name, e.message), false)) });
  await db.close();
  works.push(...(await dirtyMigration()).map(({ name, ok }) => ({ name, ok })));
}

for (const r of results) {
  console.log(`${r.id} ${r.who} → ${r.what}\n   before: ${r.before.through ? 'GOT THROUGH' : 'blocked'} — ${r.before.detail}\n   after:  ${r.after.through ? 'GOT THROUGH' : 'blocked'} — ${r.after.detail}`);
}
for (const w of works) console.log(`${w.ok ? '✓' : '✗'} ${w.name}`);
const broken = results.filter((r) => r.after.through).length + works.filter((w) => !w.ok).length;
const reproduced = results.filter((r) => r.before.through).length;
console.log(`\nattacks reproduced before: ${reproduced}/${results.length} · still through after: ${results.filter((r) => r.after.through).length} · legitimate actions working after: ${works.filter((w) => w.ok).length}/${works.length}`);

const version = (await (async () => { const db = new PGlite(); const v = (await db.query('select version() v')).rows[0].v; await db.close(); return v; })()).split(' on ')[0];
writeFileSync(join(ROOT, 'report/results.js'), '// Written by tests/attacks.mjs. Do not edit by hand.\nwindow.RESULTS = ' +
  JSON.stringify({ engine: version, results, works }, null, 1) + ';\n');
process.exit(broken ? 1 : 0);
