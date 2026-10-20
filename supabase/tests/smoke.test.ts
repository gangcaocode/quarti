import { afterAll, expect, test } from 'vitest';
import { closePool, makeShop, tx, U } from './helpers';

afterAll(closePool);

test('migrations apply and a shop can be built through the app functions', async () => {
  await tx(async (t) => {
    const s = await makeShop(t);
    const shops = await t.q(`select * from public.my_shops()`);
    expect(shops).toHaveLength(1);
    expect(shops[0].manages).toBe(true);
    const staff = await t.q(`select full_name, user_id is not null as joined from public.staff where shop_id = $1 order by full_name`, [s.shop]);
    expect(staff.map((x) => x.full_name)).toEqual(['Kevin Blais', 'Rémi Lapointe', 'Sophie Lavoie']);
    expect(staff.every((x) => x.joined)).toBe(true);
    // a new profile has no language yet: the app fills it with the one the person is using
    await t.as(U.nadia);
    expect(await t.one(`select lang from public.profiles`)).toEqual({ lang: null });
    await t.q(`update public.profiles set lang = 'en'`);
    expect(await t.one(`select lang from public.profiles`)).toEqual({ lang: 'en' });
    await t.fails(`update public.profiles set lang = 'es'`, [], 'profiles_lang_check');
  });
});

test('setup_shop creates a restaurant in one step, and invite codes are short and typeable', async () => {
  await tx(async (t) => {
    const s = await makeShop(t);
    const id = (await t.one(`select public.setup_shop('Chez Lina', '', array['Server','Cook'], $1::jsonb) as id`, [JSON.stringify([{ name: 'Lunch', start_min: 660, end_min: 900 }, { name: 'Dinner', start_min: 1020, end_min: 1320 }])])).id;
    expect((await t.one(`select count(*)::int as n from public.period_staffing ps join public.periods p on p.id = ps.period_id where p.shop_id = $1`, [id])).n).toBe(4);
    await t.fails(`select public.setup_shop('X', '', array['A'], $1::jsonb)`, [JSON.stringify([{ name: 'A', start_min: 420, end_min: 600 }, { name: 'B', start_min: 600, end_min: 800 }, { name: 'C', start_min: 900, end_min: 1000 }])], 'pro_needed');
    expect(await t.q(`select * from public.shops where name = 'X'`)).toHaveLength(0);          // nothing half-made
    const r = (await t.one(`select public.create_staff($1, 'Léa Gagnon', null, $2::jsonb) as r`, [s.shop, JSON.stringify([{ position_id: s.cashier, rate_cents: 2000 }])])).r;
    expect(r.token).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    await t.as(U.zoe);
    const typed = r.token.slice(0, 4).toLowerCase() + '-' + r.token.slice(4);                    // lower case and a dash still work
    expect((await t.one(`select public.join_shop($1) as shop`, [typed])).shop).toBe(s.shop);
  });
});
