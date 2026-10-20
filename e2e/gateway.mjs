// Stands in for Supabase's API gateway: /rest/v1 goes to PostgREST (the same layer Supabase uses, so the real
// row-level security and functions apply), /auth/v1 is a fake email-code sign-in where the code is always 123456.
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';

export const JWT_SECRET = 'quarti-e2e-only-secret-not-used-anywhere-else';
const ADMIN = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres';
const dbUrl = new URL(ADMIN); dbUrl.pathname = '/quarti_e2e';
const db = new pg.Pool({ connectionString: dbUrl.toString() });
const PGRST = Number(process.env.PGRST_PORT ?? 3001), PORT = Number(process.env.GATEWAY_PORT ?? 8098);

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const sign = (p) => { const h = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(p); return h + '.' + crypto.createHmac('sha256', JWT_SECRET).update(h).digest('base64url'); };
const claims = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url')); } catch { return null; } };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const send = (r, code, body) => { r.writeHead(code, { ...cors, 'content-type': 'application/json' }); r.end(body === undefined ? '' : JSON.stringify(body)); };

async function session(email) {
  let u = (await db.query('select id, email from auth.users where lower(email) = lower($1)', [email])).rows[0];
  u ??= (await db.query('insert into auth.users (email) values ($1) returning id, email', [email])).rows[0];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'rt:' + u.email, user };
}

const errors = [];   // API errors seen, read by the flow at the end
http.createServer(async (q, r) => {
  if (q.method === 'OPTIONS') return send(r, 200);
  const chunks = []; for await (const c of q) chunks.push(c);
  const raw = Buffer.concat(chunks), body = raw.length ? JSON.parse(raw.toString()) : {};
  const url = new URL(q.url, 'http://x');
  if (url.pathname === '/__errors') return send(r, 200, errors.splice(0));
  if (url.pathname.startsWith('/auth/v1/')) {
    const p = url.pathname.slice('/auth/v1/'.length);
    if (p === 'otp') return send(r, 200, {});
    if (p === 'verify') return body.token === '123456' ? send(r, 200, await session(body.email)) : send(r, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    if (p === 'token') return send(r, 200, await session(String(body.refresh_token ?? '').slice(3)));
    if (p === 'user') { const c = claims(String(q.headers.authorization ?? '').slice(7)); return c?.email ? send(r, 200, (await session(c.email)).user) : send(r, 401, {}); }
    if (p.startsWith('logout')) return send(r, 204);
    return send(r, 404, {});
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const headers = { ...q.headers }; delete headers.host; delete headers['content-length'];
    if (!String(headers.authorization ?? '').includes('.')) delete headers.authorization;   // the publishable key alone = anonymous
    const up = http.request({ host: '127.0.0.1', port: PGRST, path: url.pathname.slice('/rest/v1'.length) + url.search, method: q.method, headers }, (ur) => {
      const out = []; ur.on('data', (d) => out.push(d));
      ur.on('end', () => {
        const buf = Buffer.concat(out);
        if (ur.statusCode >= 400) errors.push({ status: ur.statusCode, path: url.pathname, body: buf.toString().slice(0, 300) });
        r.writeHead(ur.statusCode, { ...ur.headers, ...cors }); r.end(buf);
      });
    });
    up.on('error', (e) => send(r, 502, { message: e.message }));
    return up.end(raw);
  }
  send(r, 404, {});
}).listen(PORT, () => console.log('gateway on', PORT));
