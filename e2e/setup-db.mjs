// A fresh quarti_e2e database: the Supabase pieces the schema needs, every migration, and the role PostgREST logs in as.
import fs from 'node:fs';
import pg from 'pg';
const ADMIN = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres';
const url = (db) => { const u = new URL(ADMIN); u.pathname = '/' + db; return u.toString(); };
const root = new URL('../supabase/', import.meta.url).pathname;

const admin = new pg.Client({ connectionString: ADMIN });
await admin.connect();
await admin.query('drop database if exists quarti_e2e with (force)');
await admin.query('create database quarti_e2e');
await admin.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'e2e'; end if; end $$`);
await admin.end();

const db = new pg.Client({ connectionString: url('quarti_e2e') });
await db.connect();
await db.query(fs.readFileSync(root + 'tests/bootstrap.sql', 'utf8'));
for (const f of fs.readdirSync(root + 'migrations').filter((x) => x.endsWith('.sql')).sort()) await db.query(fs.readFileSync(root + 'migrations/' + f, 'utf8'));
await db.query('grant anon, authenticated to authenticator');
await db.end();
console.log('e2e database ready');
