import { NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET() {
  await initDB();
  const { rows } = await sql`SELECT value FROM setup WHERE key = 'done'`;
  return NextResponse.json({ done: rows.length > 0 && rows[0].value === 'true' });
}

export async function POST() {
  await initDB();
  await sql`INSERT INTO setup (key, value) VALUES ('done', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`;
  return NextResponse.json({ ok: true });
}
