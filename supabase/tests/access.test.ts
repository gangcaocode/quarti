// Who can see and do what. Spec: docs/rules.md, "Plan and access" and "Every tap re-checks access".
import { afterAll, describe, expect, test } from 'vitest';
import { closePool, makeShop, slot, tx, U } from './helpers';

afterAll(closePool);
const DAY = '2026-10-02';

describe('a stranger', () => {
  test('sees nothing and can do nothing', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.as(U.zoe);
      for (const table of ['shops', 'positions', 'periods', 'staff', 'staff_positions', 'shifts', 'shop_access', 'shop_plans', 'invites', 'updates'])
        expect(await t.q(`select * from public.${table}`), table).toHaveLength(0);
      expect(await t.q(`select * from public.crew_shifts($1, $2)`, [s.shop, DAY])).toHaveLength(0);
      expect(await t.q(`select * from public.coworkers($1)`, [s.shop])).toHaveLength(0);
      await t.fails(`select public.plan_day($1, $2)`, [s.shop, DAY], 'no_access');
      await t.fails(`select public.create_staff($1, 'X', null, '[]'::jsonb)`, [s.shop], 'no_access');
      await t.fails(`insert into public.positions (shop_id, name) values ($1, 'Host')`, [s.shop], 'row-level security');
    });
  });
});

describe('a worker', () => {
  test('sees the shop and its setup, but only their own staff row and pay', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.as(U.sophie);
      expect(await t.q(`select name from public.shops`)).toEqual([{ name: 'Café Olympico' }]);
      expect(await t.q(`select * from public.positions`)).toHaveLength(3);
      const staff = await t.q(`select full_name, email from public.staff`);
      expect(staff).toEqual([{ full_name: 'Sophie Lavoie', email: 'sophie@example.com' }]);
      expect((await t.q(`select * from public.staff_positions`)).map((x) => x.rate_cents)).toEqual([2100]);
      const co = await t.q(`select * from public.coworkers($1)`, [s.shop]);
      expect(co.map((x) => x.full_name)).toEqual(['Kevin Blais', 'Rémi Lapointe', 'Sophie Lavoie']);
      expect(Object.keys(co[0])).not.toContain('email');
      expect((await t.one(`select * from public.my_shops()`)).manages).toBe(false);
    });
  });

  test("can't see drafts, sees what was sent to them, and sees coworkers' confirmed shifts without pay", async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cashier, s.morning), b = await slot(t, s, DAY, s.cook, s.morning);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.sophie]);
      await t.q(`select public.assign_shift($1, $2)`, [b, s.staff.kevin]);
      await t.as(U.sophie);
      expect(await t.q(`select * from public.shifts`)).toHaveLength(0);              // drafts are the manager's work in progress
      await t.as(U.nadia);
      await t.q(`select public.send_shifts($1, $2, $2)`, [s.shop, DAY]);
      await t.as(U.kevin);
      await t.q(`select public.reply_shift($1, true)`, [b]);
      await t.as(U.sophie);
      const mine = await t.q(`select id, confirm, rate_cents from public.shifts`);
      expect(mine).toEqual([{ id: a, confirm: 'pending', rate_cents: 2100 }]);      // never Kevin's shift or rate
      const crew = await t.q(`select * from public.crew_shifts($1, $2)`, [s.shop, DAY]);
      expect(crew.map((x) => x.full_name)).toEqual(['Kevin Blais']);                 // Kevin accepted; Sophie's own is still pending
      expect(Object.keys(crew[0])).not.toContain('rate_cents');
    });
  });

  test("can't run manager functions or write to the schedule directly", async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const a = await slot(t, s, DAY, s.cashier, s.morning);
      await t.as(U.sophie);
      await t.fails(`select public.assign_shift($1, $2)`, [a, s.staff.sophie], 'no_access');
      await t.fails(`select public.send_shifts($1, $2, $2)`, [s.shop, DAY], 'no_access');
      await t.fails(`select public.set_staff_status($1, false)`, [s.staff.kevin], 'no_access');
      await t.fails(`update public.shifts set staff_id = $1 where id = $2`, [s.staff.sophie, a], 'permission denied');
      await t.fails(`update public.staff set status = 'inactive' where id = $1`, [s.staff.kevin], 'permission denied');
      await t.fails(`insert into public.shop_access (shop_id, user_id) values ($1, $2)`, [s.shop, U.sophie], 'permission denied');
      await t.fails(`select private.tell($1, $2, 'x', 'x', 'x')`, [s.shop, s.staff.kevin], 'permission denied');
    });
  });

  test('once removed, loses the shop but keeps the message telling them', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.q(`select public.remove_staff($1)`, [s.staff.sophie]);
      await t.as(U.sophie);
      expect(await t.q(`select * from public.shops`)).toHaveLength(0);
      expect(await t.q(`select * from public.coworkers($1)`, [s.shop])).toHaveLength(0);
      expect((await t.q(`select title from public.updates order by id desc limit 1`))[0].title).toBe('Removed from the roster');
    });
  });
});

describe('the public API', () => {
  test('signed-out people can call nothing; helper checks and views are not in the API schema', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      const exposed = await t.admin(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('is_manager', 'is_staff', 'my_staff_id', 'shop_today', 'need_manager', 'tell', 'staff_is_active', 'release_upcoming')`);
      expect(exposed).toEqual([]);
      expect(await t.admin(`select table_name from information_schema.views where table_schema = 'public'`)).toEqual([]);
      await t.as(null);
      await t.q(`set local role anon`);
      await t.fails(`select * from public.crew_shifts($1, $2)`, [s.shop, DAY], 'permission denied');
      await t.fails(`select * from public.coworkers($1)`, [s.shop], 'permission denied');
      expect(await t.q(`select * from public.positions`)).toHaveLength(0);   // policies still work for anon (private schema is usable)
    });
  });
});

describe('managers', () => {
  test('a co-manager has the same rights; a stand-in loses them the day after the end date', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.as(null);
      await t.q(`update public.shop_plans set tier = 'pro', payer = $2 where shop_id = $1`, [s.shop, U.lucie]);
      await t.q(`insert into public.shop_access (shop_id, user_id, until) values ($1, $2, null), ($1, $3, '2026-09-30')`, [s.shop, U.lucie, U.remi]);
      await t.as(U.nadia);
      const a = await slot(t, s, DAY, s.cashier, s.morning);
      await t.as(U.lucie);
      await t.q(`select public.assign_shift($1, $2)`, [a, s.staff.sophie]);
      expect(await t.q(`select * from public.staff`)).toHaveLength(3);
      await t.as(U.remi);
      await t.at('2026-09-30T22:00:00-04:00');                                         // last evening of his stand-in
      await t.q(`select public.unassign_shift($1)`, [a]);
      expect((await t.one(`select * from public.my_shops()`)).until).toEqual(new Date('2026-09-30T00:00:00'));
      await t.at('2026-10-01T00:30:00-04:00');                                         // just after midnight, shop time
      await t.fails(`select public.assign_shift($1, $2)`, [a, s.staff.sophie], 'no_access');
      expect(await t.q(`select * from public.staff`)).toEqual(expect.arrayContaining([expect.objectContaining({ full_name: 'Rémi Lapointe' })]));
      expect(await t.q(`select * from public.staff`)).toHaveLength(1);                // back to his own row only
      expect((await t.one(`select * from public.my_shops()`)).manages).toBe(false);
    });
  });

  test('the free plan has two periods; a third needs Pro', async () => {
    await tx(async (t) => {
      const s = await makeShop(t);
      await t.fails(`insert into public.periods (shop_id, name, start_min, end_min) values ($1, 'Dinner', 1020, 1380)`, [s.shop], 'pro_needed');
      await t.as(null);
      await t.q(`update public.shop_plans set tier = 'pro' where shop_id = $1`, [s.shop]);
      await t.as(U.nadia);
      await t.q(`insert into public.periods (shop_id, name, start_min, end_min) values ($1, 'Dinner', 1020, 1380)`, [s.shop]);
    });
  });

  test('anonymous requests get nothing', async () => {
    await tx(async (t) => {
      await makeShop(t);
      await t.as(null);
      await t.q(`set local role anon`);
      expect(await t.q(`select * from public.shops`)).toHaveLength(0);
      await t.fails(`select public.my_shops()`, [], 'permission denied');
    });
  });
});
