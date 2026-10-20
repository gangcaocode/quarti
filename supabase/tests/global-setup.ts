// Creates a fresh test database, adds the Supabase pieces the schema needs, and applies every migration in order.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export const ADMIN_URL = process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/postgres';
export const TEST_DB = 'quarti_test';

export function testUrl() {
  const u = new URL(ADMIN_URL);
  u.pathname = '/' + TEST_DB;
  return u.toString();
}

export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const db = new pg.Client({ connectionString: testUrl() });
  await db.connect();
  const here = join(__dirname);
  await db.query(readFileSync(join(here, 'bootstrap.sql'), 'utf8'));
  const dir = join(here, '..', 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.query(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  await db.end();
}
