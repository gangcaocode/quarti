// The schedule: planning a day, assigning, sending, answering, and the rules that protect people.
import { afterAll, describe, expect, test } from 'vitest';
import { closePool, makeShop, slot, tx, U } from './helpers';

afterAll(closePool);
const DAY = '2026-10-02';
const updates = (t: any, staff: string) => t.admin(`select kind, title, body from public.updates where staff_id = $1 order by id`, [staff]);

describe('planning a day', () => {
  test('creates one open slot per person the usual staffing needs, once', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      expect((await t.one(`select public.plan_day($1, $2) as n`, [s.shop, DAY])).n).toBe(5);
      expect((await t.one(`select public.plan_day($1, $2) as n`, [s.shop, DAY])).n).toBe(0);
      const rows = await t.q(`select start_min, end_min, staff_id, confirm from public.shifts where shop_id = $1 and day = $2`, [s.shop, DAY]);
      expect(rows).toHaveLength(5);
      expect(rows.every((r: any) => r.staff_id === null && r.confirm === 'ok')).toBe(true);
      await t.fails(`select public.plan_day($1, '2026-09-24')`, [s.shop], 'past');
    });
  });

  test('times are real instants in Montréal time, across midnight and the daylight-saving change', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const id = (await t.one(`select public.add_slot($1, '2026-10-31', $2, 1320, 1800) as id`, [s.shop, s.cook])).id;   // Sat 22:00 → Sun 06:00
      const r = await t.one(`select starts_at, ends_at, extract(epoch from ends_at - starts_at) / 3600 as hours from public.shifts where id = $1`, [id]);
      expect(r.starts_at.toISOString()).toBe('2026-11-01T02:00:00.000Z');              // 22:00 EDT
      expect(r.ends_at.toISOString()).toBe('2026-11-01T11:00:00.000Z');                // 06:00 EST: clocks went back an hour
      expect(Number(r.hours)).toBe(9);
    });
  });

  test("an extra slot can't start in the past, and only open slots that haven't started can be removed", async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.fails(`select public.add_slot($1, '2026-09-25', $2, 480, 720)`, [s.shop, s.cook], 'started');   // 08:00 today, it's 09:41
      const ok = (await t.one(`select public.add_slot($1, '2026-09-25', $2, 600, 900, 'Busy lunch') as id`, [s.shop, s.cook])).id;
      expect((await t.one(`select extra, reason, period_id is not null as in_period from public.shifts where id = $1`, [ok]))).toEqual({ extra: true, reason: 'Busy lunch', in_period: true });
      const a = await slot(t, s, DAY, s.cashier, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.sophie]);
      await t.fails(`select public.remove_slot($1)`, [a], 'not_open');
      await t.q(`select public.remove_slot($1)`, [ok]);
      expect(await t.q(`select * from public.shifts where id = $1`, [ok])).toHaveLength(0);
    });
  });
});

describe('assigning and sending', () => {
  test('assign makes a draft at the worker\'s rate for that position; covering pays their main rate', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cook, s.lunch), b = await slot(t, s, DAY, s.cashier, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.remi]);
      await t.q(`select public.assign_shift($1, $2)`, [b, s.staff.kevin]);
      expect(await t.one(`select confirm, rate_cents, cover from public.shifts where id = $1`, [a])).toEqual({ confirm: 'draft', rate_cents: 2300, cover: false });
      expect(await t.one(`select confirm, rate_cents, cover from public.shifts where id = $1`, [b])).toEqual({ confirm: 'draft', rate_cents: 2200, cover: true });
      expect(await updates(t, s.staff.remi)).toEqual([{ kind: 'joined', title: 'You joined the team', body: '' }]);   // drafts tell nobody
    });
  });

  test('nobody is ever booked twice at the same time', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cook, s.morning), b = await slot(t, s, DAY, s.barista, s.lunch), c = await slot(t, s, DAY, s.cook, s.lunch);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.remi]);              // 07:00–12:00
      await t.q(`select public.assign_shift($1, $2)`, [b, s.staff.remi]);              // 12:00–17:00 touches, doesn't overlap
      await t.fails(`select public.assign_shift($1, $2)`, [c, s.staff.remi], 'double_booked');
      const x = (await t.one(`select public.add_slot($1, $2, $3, 660, 780) as id`, [s.shop, DAY, s.cook])).id;    // 11:00–13:00
      await t.fails(`select public.assign_shift($1, $2)`, [x, s.staff.remi], 'double_booked');
    });
  });

  test('send asks each worker; they accept or decline, and declining reopens the slot', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cashier, s.morning), b = await slot(t, s, DAY, s.cook, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.sophie]);
      await t.q(`select public.assign_shift($1, $2)`, [b, s.staff.kevin]);
      expect((await t.one(`select public.send_shifts($1, $2, $2) as n`, [s.shop, DAY])).n).toBe(2);
      expect((await t.one(`select public.send_shifts($1, $2, $2) as n`, [s.shop, DAY])).n).toBe(0);
      expect((await updates(t, s.staff.sophie)).at(-1)).toEqual({ kind: 'asked', title: 'New shift to confirm', body: 'Fri Oct 2 · 07:00–12:00' });
      await t.as(U.sophie);
      await t.q(`select public.reply_shift($1, true)`, [a]);
      await t.fails(`select public.reply_shift($1, true)`, [a], 'not_pending');
      await t.fails(`select public.reply_shift($1, false)`, [b], 'not_yours');
      await t.as(U.kevin);
      await t.q(`select public.reply_shift($1, false)`, [b]);
      await t.as(U.nadia);
      expect(await t.one(`select confirm from public.shifts where id = $1`, [a])).toEqual({ confirm: 'ok' });
      expect(await t.one(`select staff_id, declined_by = $2 as by_kevin, rate_cents from public.shifts where id = $1`, [b, s.staff.kevin])).toEqual({ staff_id: null, by_kevin: true, rate_cents: 0 });
      // answering doesn't send the worker an update about their own tap
      expect((await updates(t, s.staff.sophie)).at(-1).kind).toBe('asked');
      expect((await updates(t, s.staff.kevin)).at(-1).kind).toBe('asked');
    });
  });

  test('taking someone off tells them only if they were asked or had accepted', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cashier, s.morning), b = await slot(t, s, DAY, s.cook, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.sophie]);
      await t.q(`select public.assign_shift($1, $2)`, [b, s.staff.kevin]);
      await t.q(`select public.send_shifts($1, $2, $2)`, [s.shop, DAY]);
      const c = (await t.one(`select public.add_slot($1, $2, $3, 1020, 1200) as id`, [s.shop, DAY, s.cook])).id;
      await t.q(`select public.assign_shift($1, $2)`, [c, s.staff.sophie]);               // a draft
      expect((await t.one(`select public.unassign_shift($1) as told`, [c])).told).toBe(false);
      expect((await t.one(`select public.unassign_shift($1) as told`, [a])).told).toBe(true);
      expect((await updates(t, s.staff.sophie)).at(-1)).toEqual({ kind: 'cancelled', title: 'Shift cancelled', body: 'Fri Oct 2 · 07:00–12:00 · removed from the schedule' });
      await t.q(`select public.assign_shift($1, $2)`, [b, s.staff.remi]);                 // reassigning tells the person it was taken from
      expect((await updates(t, s.staff.kevin)).at(-1).body).toBe('Fri Oct 2 · 07:00–12:00 · given to someone else');
    });
  });

  test('started shifts are never touched', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cashier, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.sophie]);
      await t.q(`select public.send_shifts($1, $2, $2)`, [s.shop, DAY]);
      await t.at('2026-10-02T07:30:00-04:00');
      await t.fails(`select public.unassign_shift($1)`, [a], 'started');
      await t.fails(`select public.assign_shift($1, $2)`, [a, s.staff.kevin], 'started');
      await t.as(U.sophie);
      await t.fails(`select public.reply_shift($1, true)`, [a], 'started');
      await t.as(U.nadia);
      expect((await t.one(`select public.set_staff_status($1, false, 'Exams', null, true) as n`, [s.staff.sophie])).n).toBe(0);
      expect((await t.one(`select staff_id = $2 as still from public.shifts where id = $1`, [a, s.staff.sophie])).still).toBe(true);
    });
  });
});

describe('staff', () => {
  test('inactive: not assignable; unassigning frees upcoming shifts and tells them', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cook, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.kevin]);
      await t.q(`select public.send_shifts($1, $2, $2)`, [s.shop, DAY]);
      expect((await t.one(`select public.set_staff_status($1, false, 'Exams', null, true) as n`, [s.staff.kevin])).n).toBe(1);
      expect((await t.one(`select staff_id from public.shifts where id = $1`, [a])).staff_id).toBeNull();
      expect((await updates(t, s.staff.kevin)).slice(-2).map((x: any) => x.title)).toEqual(['Shift cancelled', 'Set as inactive']);
      expect((await updates(t, s.staff.kevin)).at(-1).body).toBe('');   // the reason ('Exams') stays with the manager
      expect((await t.admin(`select inactive_reason from public.staff where id = $1`, [s.staff.kevin]))[0].inactive_reason).toBe('Exams');
      await t.fails(`select public.assign_shift($1, $2)`, [a, s.staff.kevin], 'inactive');
    });
  });

  test('coming back on a date: assignable from that day, and told', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.fails(`select public.set_staff_status($1, false, null, '2026-09-25', false)`, [s.staff.kevin], 'bad_input');
      await t.q(`select public.set_staff_status($1, false, 'Trip', '2026-10-01', false)`, [s.staff.kevin]);
      const a = await slot(t, s, DAY, s.cook, s.morning);
      await t.fails(`select public.assign_shift($1, $2)`, [a, s.staff.kevin], 'inactive');
      await t.at('2026-10-01T08:00:00-04:00');
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.kevin]);
      expect(await t.one(`select status, back_on from public.staff where id = $1`, [s.staff.kevin])).toEqual({ status: 'active', back_on: null });
      expect((await updates(t, s.staff.kevin)).at(-1).title).toBe('Back from time away');
    });
  });

  test('taking a position away keeps booked shifts (now covering) at their booked rate', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cook, s.lunch);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.remi]);
      await t.q(`select public.set_staff_positions($1, $2::jsonb)`, [s.staff.remi, JSON.stringify([{ position_id: s.barista, rate_cents: 2400 }])]);
      expect(await t.one(`select staff_id = $2 as his, cover, rate_cents from public.shifts where id = $1`, [a, s.staff.remi])).toEqual({ his: true, cover: true, rate_cents: 2300 });
      await t.fails(`select public.set_staff_positions($1, '[]'::jsonb)`, [s.staff.remi], 'no_position');
    });
  });

  test('invites: one use, one person per staff row, no duplicate emails, rates in range', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const r = (await t.one(`select public.create_staff($1, 'Paula Diaz', 'paula@example.com', $2::jsonb) as r`, [s.shop, JSON.stringify([{ position_id: s.cashier, rate_cents: 2000 }])])).r;
      await t.fails(`select public.create_staff($1, 'Paula D', 'PAULA@example.com', $2::jsonb)`, [s.shop, JSON.stringify([{ position_id: s.cashier, rate_cents: 2000 }])], 'duplicate');
      await t.fails(`select public.create_staff($1, 'Low Pay', null, $2::jsonb)`, [s.shop, JSON.stringify([{ position_id: s.cashier, rate_cents: 900 }])], 'staff_positions_rate_cents_check');
      await t.fails(`select public.create_staff($1, 'No Job', null, '[]'::jsonb)`, [s.shop], 'no_position');
      await t.as(U.sophie);
      await t.fails(`select public.join_shop($1)`, [r.token], 'already_joined');      // Sophie already works here
      await t.as(U.zoe);
      expect((await t.one(`select public.join_shop($1) as shop`, [r.token])).shop).toBe(s.shop);
      await t.as(U.lucie);
      await t.fails(`select public.join_shop($1)`, [r.token], 'invite_used');
      await t.as(U.zoe);
      expect((await t.one(`select full_name from public.staff`)).full_name).toBe('Paula Diaz');
    });
  });
});
