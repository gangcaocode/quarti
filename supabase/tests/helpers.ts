// Test helpers: every test runs in one transaction that is rolled back, so tests never see each other's data.
// t.as(user) switches to that signed-in user (row-level security applies); t.as(null) is the database owner.
import pg from 'pg';
import { testUrl } from './global-setup';

export type Tx = {
  q: <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;
  one: <T = any>(sql: string, params?: unknown[]) => Promise<T>;
  as: (user: string | null) => Promise<void>;
  /** read as the database owner (no row-level security), then go back to the current user */
  admin: <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;
  at: (iso: string) => Promise<void>;
  /** expect a call to fail with one of our error codes (or a Postgres message fragment) */
  fails: (sql: string, params: unknown[], code: string) => Promise<void>;
};

let pool: pg.Pool | null = null;
function getPool() {
  pool ??= new pg.Pool({ connectionString: testUrl(), max: 4 });
  return pool;
}
export async function closePool() { await pool?.end(); pool = null; }

export async function tx(fn: (t: Tx) => Promise<void>) {
  const c = await getPool().connect();
  let user: string | null = null;
  try {
    await c.query('begin');
    const t: Tx = {
      q: async (sql, params) => (await c.query(sql, params as any[])).rows,
      one: async (sql, params) => (await c.query(sql, params as any[])).rows[0],
      as: async (u) => {
        user = u;
        await c.query('reset role');
        if (u) {
          await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: u, role: 'authenticated' })]);
          await c.query('set local role authenticated');
        } else {
          await c.query(`select set_config('request.jwt.claims', '', true)`);
        }
      },
      admin: async (sql, params) => {
        await c.query('reset role');
        try { return (await c.query(sql, params as any[])).rows; }
        finally { if (user) await c.query('set local role authenticated'); }
      },
      at: async (iso) => { await c.query(`select set_config('app.now', $1, true)`, [iso]); },
      fails: async (sql, params, code) => {
        await c.query('savepoint f');
        let msg = '';
        try { await c.query(sql, params as any[]); } catch (e) { msg = (e as Error).message; }
        await c.query('rollback to savepoint f');
        if (user) { await c.query('set local role authenticated'); }
        if (!msg) throw new Error(`expected "${code}" but the call succeeded: ${sql}`);
        if (!msg.includes(code)) throw new Error(`expected "${code}" but got "${msg}": ${sql}`);
      },
    };
    await fn(t);
  } finally {
    await c.query('rollback').catch(() => {});
    c.release();
  }
}

// ── a small shop to test against: Café Olympico, Montréal ──
export const U = {
  nadia: '00000000-0000-4000-8000-000000000001',   // manager
  lucie: '00000000-0000-4000-8000-000000000002',   // owner (pays)
  remi:  '00000000-0000-4000-8000-000000000003',   // worker, sometimes a stand-in
  sophie:'00000000-0000-4000-8000-000000000004',   // worker
  kevin: '00000000-0000-4000-8000-000000000005',   // worker
  zoe:   '00000000-0000-4000-8000-000000000006',   // stranger
};

export type Shop = {
  shop: string; cashier: string; cook: string; barista: string;
  morning: string; lunch: string; dinner?: string;
  staff: { remi: string; sophie: string; kevin: string };
};

/** Builds the shop as Nadia would, through the same functions the app calls. Leaves the session as Nadia. */
export async function makeShop(t: Tx, now = '2026-09-25T09:41:00-04:00'): Promise<Shop> {
  await t.as(null);
  await t.at(now);
  for (const [k, id] of Object.entries(U)) await t.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${k}@example.com`, { full_name: k[0].toUpperCase() + k.slice(1) }]);
  await t.as(U.nadia);
  const { create_shop: shop } = await t.one(`select public.create_shop('Café Olympico', '124 Av. Laurier O, Montréal') as create_shop`);
  const pos = async (name: string, sort: number) => (await t.one(`insert into public.positions (shop_id, name, sort) values ($1, $2, $3) returning id`, [shop, name, sort])).id;
  const cashier = await pos('Cashier', 1), cook = await pos('Cook', 2), barista = await pos('Barista', 3);
  const per = async (name: string, s: number, e: number, sort: number) => (await t.one(`insert into public.periods (shop_id, name, start_min, end_min, sort) values ($1, $2, $3, $4, $5) returning id`, [shop, name, s, e, sort])).id;
  const morning = await per('Morning', 7 * 60, 12 * 60, 1), lunch = await per('Lunch', 12 * 60, 17 * 60, 2);
  for (const [p, q, n] of [[morning, cashier, 1], [morning, cook, 1], [lunch, cashier, 1], [lunch, cook, 1], [lunch, barista, 1]] as const)
    await t.q(`insert into public.period_staffing (period_id, position_id, n) values ($1, $2, $3)`, [p, q, n]);
  const hire = async (name: string, user: string, rates: [string, number][]) => {
    const r = await t.one(`select public.create_staff($1, $2, $3, $4::jsonb) as r`, [shop, name, `${name.split(' ')[0].toLowerCase()}@example.com`, JSON.stringify(rates.map(([position_id, rate_cents]) => ({ position_id, rate_cents })))]);
    await t.as(user);
    await t.q(`select public.join_shop($1)`, [r.r.token]);
    await t.as(U.nadia);
    return r.r.staff_id as string;
  };
  const remi = await hire('Rémi Lapointe', U.remi, [[barista, 2100], [cook, 2300]]);
  const sophie = await hire('Sophie Lavoie', U.sophie, [[cashier, 2100]]);
  const kevin = await hire('Kevin Blais', U.kevin, [[cook, 2200]]);
  return { shop, cashier, cook, barista, morning, lunch, staff: { remi, sophie, kevin } };
}

/** an open slot on a day (plans the day first) */
export async function slot(t: Tx, s: Shop, day: string, position: string, period: string) {
  await t.q(`select public.plan_day($1, $2)`, [s.shop, day]);
  return (await t.one(`select id from public.shifts where shop_id = $1 and day = $2 and position_id = $3 and period_id = $4 and staff_id is null order by created_at limit 1`, [s.shop, day, position, period])).id as string;
}
