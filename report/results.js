// Written by tests/attacks.mjs. Do not edit by hand.
window.RESULTS = {
 "engine": "PostgreSQL 18.3 (PGlite 0.5.8)",
 "results": [
  {
   "id": "F1",
   "who": "anyone with the public key",
   "what": "read every customer’s name, phone and address",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "read 2 customers, e.g. Alice Carter, 07700 900101"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table customers"
   }
  },
  {
   "id": "F1",
   "who": "anyone with the public key",
   "what": "change a customer’s phone number",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "phone number changed"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table customers"
   }
  },
  {
   "id": "F2",
   "who": "anyone who opens the site",
   "what": "take the service key out of the page and bypass every rule",
   "kind": "code",
   "before": {
    "through": true,
    "detail": "VITE_SUPABASE_SERVICE_ROLE_KEY is built into the public JavaScript"
   },
   "after": {
    "through": false,
    "detail": "only the public key reaches the browser"
   }
  },
  {
   "id": "F3",
   "who": "a signed-in customer",
   "what": "book a walk for £0",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "a 60-minute walk booked at £0.00"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table bookings"
   }
  },
  {
   "id": "F4",
   "who": "a customer who sets role: admin in their own profile",
   "what": "see every booking",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "saw 2 bookings (their own: 1)"
   },
   "after": {
    "through": false,
    "detail": "saw 1 bookings (their own: 1)"
   }
  },
  {
   "id": "F5",
   "who": "a signed-in customer",
   "what": "lower the price of their own booking",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "their walk now costs 1p"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table bookings"
   }
  },
  {
   "id": "F5",
   "who": "a signed-in customer",
   "what": "put a booking on someone else’s customer record",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "a walk booked under Alice’s name and address"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table bookings"
   }
  },
  {
   "id": "F5",
   "who": "a customer who sets role: admin in their own profile",
   "what": "cancel someone else’s booking or change its price",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "status: Alice’s booking cancelled by Ben; price: price of Alice’s walk set to 1p"
   },
   "after": {
    "through": false,
    "detail": "status: no row changed; price: refused by the database: permission denied for table bookings"
   }
  },
  {
   "id": "F6",
   "who": "two customers at the same moment",
   "what": "book the same walker for the same slot",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "both saved: Priya booked twice at 11:00"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: that slot has just been taken"
   }
  },
  {
   "id": "F6",
   "who": "a customer who books 30 seconds later",
   "what": "slip past the same-slot check",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "both saved, 30 seconds apart"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: pick a future slot on the quarter hour"
   }
  },
  {
   "id": "F6",
   "who": "a customer",
   "what": "book a walk that overlaps another one with the same walker",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "both saved: a 60-minute walk at 12:00 and a 30-minute one at 12:15"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: that slot has just been taken"
   }
  },
  {
   "id": "F7",
   "who": "the owner",
   "what": "gets the day’s walks in the wrong order",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "10:00 is listed before 9:00 (text order: 2026-10-03 10:00, 2026-10-03 9:00)"
   },
   "after": {
    "through": false,
    "detail": "9:00 first: 09:00 UK time, stored as 08:00 UTC"
   }
  },
  {
   "id": "F8",
   "who": "a customer whose booking fails",
   "what": "is still told “Booked!”",
   "kind": "code",
   "before": {
    "through": true,
    "detail": "the insert result is never checked"
   },
   "after": {
    "through": false,
    "detail": "errors are shown; a taken slot gets its own message"
   }
  },
  {
   "id": "F9",
   "who": "a customer with many walks",
   "what": "waits for one request per walk",
   "kind": "code",
   "before": {
    "through": true,
    "detail": "1 + N requests (walker name fetched inside the loop)"
   },
   "after": {
    "through": false,
    "detail": "one request, walker name joined in"
   }
  },
  {
   "id": "F10",
   "who": "anyone with the public key",
   "what": "change the price list",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "a 60-minute walk now costs 1p for everyone"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table walk_types"
   }
  },
  {
   "id": "F10",
   "who": "anyone with the public key",
   "what": "switch every walker off",
   "kind": "database",
   "before": {
    "through": true,
    "detail": "2 walkers switched off: no one can book"
   },
   "after": {
    "through": false,
    "detail": "refused by the database: permission denied for table walkers"
   }
  }
 ],
 "works": [
  {
   "name": "Alice reads her own details",
   "ok": true
  },
  {
   "name": "Alice books a walk; the price comes from the price list",
   "ok": true
  },
  {
   "name": "Two dogs join the same group walk",
   "ok": true
  },
  {
   "name": "A dog is turned away when the group walk is full",
   "ok": true
  },
  {
   "name": "Alice cancels her own booking",
   "ok": true
  },
  {
   "name": "The owner (admin set on the server) sees every booking",
   "ok": true
  },
  {
   "name": "The owner cancels a customer’s booking",
   "ok": true
  },
  {
   "name": "Everyone can still read the price list and the walkers",
   "ok": true
  },
  {
   "name": "A booking for “infinity” or years ahead is refused",
   "ok": true
  },
  {
   "name": "An 11th open booking by one customer is refused",
   "ok": true
  },
  {
   "name": "The owner can’t set a made-up status",
   "ok": true
  },
  {
   "name": "A booking in the past is refused",
   "ok": true
  },
  {
   "name": "Old bookings survive the migration, 9:00 UK time stored as 08:00 UTC",
   "ok": true
  },
  {
   "name": "The fix stops safely on a slot typed as text (“tomorrow 10am”): nothing changed, the rows are named",
   "ok": true
  },
  {
   "name": "The fix stops safely on a date that does not exist (“2026-02-30 10:00”): nothing changed, the rows are named",
   "ok": true
  },
  {
   "name": "The fix stops safely on the same time written two ways (“09:00” and “9:00”): nothing changed, the rows are named",
   "ok": true
  },
  {
   "name": "The fix stops safely on overlapping walks (10:00 for an hour, then 10:30): nothing changed, the rows are named",
   "ok": true
  },
  {
   "name": "The fix stops safely on a booking with no status: nothing changed, the rows are named",
   "ok": true
  },
  {
   "name": "The fix stops safely on a walker already booked twice: nothing changed, the rows are named",
   "ok": true
  },
  {
   "name": "Past abuse is listed for the owner: a £0 booking and one filed under someone else’s name",
   "ok": true
  }
 ]
};
