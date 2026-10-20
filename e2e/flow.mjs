// The whole manager ↔ worker loop in a real browser, against the real database rules.
// Run with `npm run test:e2e` (see e2e/README.md). Screenshots land in e2e/.shots/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(new URL(import.meta.url).pathname);
const web = path.join(here, '.web'), shots = path.join(here, '.shots');
const APP = 'http://localhost:8099', GATEWAY = `http://localhost:${process.env.GATEWAY_PORT ?? 8098}`;
fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true });

// serve the exported web app (single-page: unknown paths get index.html)
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  let p = path.join(web, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(web, 'index.html');
  r.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(8099);

// next week's Wednesday and Thursday, as the schedule's day buttons name them
const label = (d) => d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }));
const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7));
const WED = label(new Date(monday.getTime() + 2 * 864e5)), THU = label(new Date(monday.getTime() + 3 * 864e5));

const browser = await chromium.launch();
const people = [], problems = [];
async function signIn(name) {
  const ctx = await browser.newContext({ locale: 'en-CA', viewport: { width: 390, height: 844 }, timezoneId: 'America/Toronto' });
  const pg = await ctx.newPage(); let n = 0;
  pg.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('status of 400')) problems.push(`${name}: ${m.text().slice(0, 200)}`); });
  const u = {
    name, pg,
    tap: async (l, o = {}) => { await pg.getByRole('button', { name: l, exact: !!o.exact }).first().click(); await pg.waitForTimeout(o.wait ?? 700); },
    tab: async (l) => { await pg.getByRole('tab', { name: l }).click(); await pg.waitForTimeout(900); },
    fill: (l, v) => pg.getByLabel(l, { exact: true }).first().fill(v),
    see: (s, ms = 8000) => pg.getByText(s).first().waitFor({ timeout: ms }),
    text: async () => (await pg.innerText('body')).replace(/\n+/g, ' | '),
    shot: (s) => pg.screenshot({ path: `${shots}/${name}-${String(++n).padStart(2, '0')}-${s}.png`, fullPage: true }),
    fresh: async () => { await pg.reload(); await pg.waitForTimeout(2500); },
  };
  await pg.goto(APP); await pg.waitForTimeout(1500);
  await u.fill('Email', `${name}@test.ca`); await u.tap('Send me a code');
  await u.fill('Code', '123456'); await u.tap('Sign in', { exact: true, wait: 1800 });
  people.push(u); return u;
}
let failed = false;
async function step(title, fn) {
  try { await fn(); console.log('  ok  ', title); }
  catch (e) {
    failed = true; console.log('  FAIL', title, '—', e.message.split('\n')[0]);
    for (const u of people) { console.log(`        ${u.name} at ${u.pg.url()}: ${(await u.text()).slice(0, 500)}`); await u.shot('FAIL'); }
    throw e;
  }
}

try {
  const m = await signIn('nadia');
  let code = '';
  await step('a new manager sets up a shop', async () => {
    await m.see('Set up my shop'); await m.tap('Set up my shop');
    await m.fill('Shop name', 'Café Test'); await m.fill('Address', '1 rue Test');
    await m.tap('Create my shop', { wait: 2000 }); await m.see('Today is not planned'); await m.shot('today');
  });
  await step('adds Rémi (cook, $21) and gets an invite code', async () => {
    await m.tab(/Staff/); await m.tap('Add someone');
    await m.fill('Name', 'Rémi Tremblay'); await m.fill('Email', 'remi@test.ca');
    await m.pg.getByRole('switch', { name: 'Cook' }).click(); await m.fill('$/h', '21');
    await m.tap('Add to the team', { wait: 1500 });
    code = (await m.text()).match(/\b[A-Z0-9]{4}-[A-Z0-9]{6}\b/)?.[0] ?? '';
    if (!code) throw new Error('no invite code shown');
    await m.shot('invite'); await m.tap('Done');
  });
  await step('adds Sophie (cashier, no email)', async () => {
    await m.tap('Add someone'); await m.fill('Name', 'Sophie Roy');
    await m.pg.getByRole('switch', { name: 'Cashier' }).click(); await m.fill('$/h', '20');
    await m.tap('Add to the team', { wait: 1500 }); await m.tap('Done'); await m.see('Sophie Roy');
  });
  await step('plans next Wednesday and gives the lunch cook shift to Rémi', async () => {
    await m.tab(/Schedule/); await m.pg.getByLabel('Next week').click(); await m.pg.waitForTimeout(600);
    await m.pg.getByLabel(WED).click(); await m.pg.waitForTimeout(500);
    await m.tap('Start this day', { wait: 1500 }); await m.see('Cashier');
    await m.pg.getByRole('button', { name: /Cook.*11:00–15:00/ }).first().click(); await m.pg.waitForTimeout(700);
    await m.see('Would cover'); await m.shot('pick');   // Sophie isn't a cook: offered as cover at her main rate
    await m.pg.getByRole('button', { name: /Rémi Tremblay/ }).last().click(); await m.pg.waitForTimeout(1200);
    await m.pg.keyboard.press('Escape'); await m.pg.waitForTimeout(400);
  });
  await step('sends the week', async () => { await m.tap(/Send 1 shift/, { wait: 1500 }); await m.see('1 shift sent'); });

  const w = await signIn('remi');
  await step('Rémi joins with the code', async () => {
    await w.tap('Join my team'); await w.fill('Invite code', code); await w.tap('Join', { exact: true, wait: 2000 });
    await w.see('1 shift to answer'); await w.shot('home');
  });
  await step('Rémi accepts; it shows in My shifts with who else works', async () => {
    await w.tap('Accept', { exact: true, wait: 1500 }); await w.see('Accepted');
    await w.tab(/My shifts/); await w.see('Confirmed');
    await w.pg.getByRole('button', { name: /Cook/ }).first().click(); await w.pg.waitForTimeout(800); await w.see('Working with you');
    await w.pg.keyboard.press('Escape'); await w.tab(/Me/); await w.see('remi@test.ca');
  });
  await step('Nadia sees Rémi joined and the shift confirmed (also after a reload)', async () => {
    await m.fresh(); if (await m.pg.getByText('Set up my shop').count()) throw new Error('a reload landed on Welcome');
    await m.tab(/Staff/); await m.see('New');
    await m.tab(/Schedule/); await m.pg.getByLabel('Next week').click(); await m.pg.waitForTimeout(600);
    await m.pg.getByLabel(WED).click(); await m.pg.waitForTimeout(800); await m.see('Confirmed');
  });
  await step('an overlapping extra cook shift: Rémi is blocked', async () => {
    await m.tap('Add a shift'); await m.pg.getByRole('button', { name: 'Cook', exact: true }).last().click();
    await m.fill('From', '12:00'); await m.fill('To', '14:00'); await m.tap('Add shift', { exact: true, wait: 1500 }); await m.see('Shift added');
    await m.pg.getByRole('button', { name: /Cook.*12:00–14:00/ }).first().click(); await m.pg.waitForTimeout(800);
    await m.see('Already works 11:00–15:00'); await m.shot('double-booked');
    if (!(await m.pg.getByRole('button', { name: /Rémi Tremblay/ }).last().isDisabled())) throw new Error('Rémi can still be picked');
    await m.pg.keyboard.press('Escape'); await m.pg.waitForTimeout(400);
  });
  await step('Thursday dinner goes to Rémi; he declines; Nadia sees it reopened', async () => {
    await m.pg.getByLabel(THU).click(); await m.pg.waitForTimeout(500); await m.tap('Start this day', { wait: 1500 });
    await m.pg.getByRole('button', { name: /Cook.*17:00–22:00/ }).first().click(); await m.pg.waitForTimeout(700);
    await m.pg.getByRole('button', { name: /Rémi Tremblay/ }).last().click(); await m.pg.waitForTimeout(1200);
    await m.pg.keyboard.press('Escape'); await m.pg.waitForTimeout(400); await m.tap(/Send 1 shift/, { wait: 1500 });
    await w.tab(/Home/); await w.fresh(); await w.see('1 shift to answer');
    await w.tap('Decline', { exact: true, wait: 1500 }); await w.see('Declined');
    await m.fresh(); await m.tab(/Schedule/); await m.pg.getByLabel('Next week').click(); await m.pg.waitForTimeout(600);
    await m.pg.getByLabel(THU).click(); await m.pg.waitForTimeout(800); await m.see('Declined by Rémi Tremblay'); await m.shot('declined');
    await m.tab(/Today/); await m.see('1 shift declined');
  });
  await step('a third service period needs Pro', async () => {
    await m.tab(/Shop/); await m.tap('Add a period', { wait: 1200 }); await m.see('free plan');
  });
  await step('Rémi set inactive: taken off his shift and told, without the private reason', async () => {
    await m.tab(/Staff/); await m.pg.getByRole('button', { name: /^RT\s*Rémi Tremblay/ }).first().click(); await m.pg.waitForTimeout(1200);
    await m.fill('Reason', 'Exams');
    if (!(await m.pg.getByRole('switch', { name: 'Also take them off their upcoming shifts' }).isChecked())) throw new Error('should default on');
    await m.tap('Set as inactive', { exact: true, wait: 1500 }); await m.see('is set as inactive'); await m.shot('person');
    await w.fresh(); await w.see('Shift cancelled'); await w.see('Set as inactive');
    if ((await w.text()).includes('Exams')) throw new Error('the worker can see the reason');
    await m.pg.getByRole('button', { name: 'Staff', exact: true }).click(); await m.pg.waitForTimeout(800); await m.see('Add someone');
  });
  await step('switching to French', async () => { await m.tab(/Shop/); await m.tap('Français', { wait: 800 }); await m.see('Périodes de service'); await m.shot('fr'); });
} catch { /* reported by step() */ }

const apiErrors = (await (await fetch(`${GATEWAY}/__errors`)).json()).filter((e) => !e.body.includes('pro_needed'));
if (apiErrors.length) { failed = true; console.log('\nunexpected API errors:', JSON.stringify(apiErrors, null, 1)); }
if (problems.length) { failed = true; console.log('\nbrowser errors:\n  ' + [...new Set(problems)].join('\n  ')); }
console.log(failed ? '\ne2e FAILED (screenshots in e2e/.shots)' : '\ne2e passed');
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
