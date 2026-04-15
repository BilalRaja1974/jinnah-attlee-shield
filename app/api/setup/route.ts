import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET() {
  try {
    await initDB();
    const { rows } = await sql`SELECT value FROM setup WHERE key = 'done'`;
    return NextResponse.json({ done: rows.length > 0 && rows[0].value === 'true' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST() {
  try {
    await initDB();
    await sql`INSERT INTO setup (key, value) VALUES ('done', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
