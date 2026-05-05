import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET(req: Request) {
  try {
    await initDB();
    const year = new URL(req.url).searchParams.get('year');
    if (!year) return NextResponse.json({ lockedDays: [] });
    const { rows } = await sql`SELECT day FROM locked_days WHERE year=${parseInt(year)}`;
    return NextResponse.json({ lockedDays: rows.map((r: {day: number}) => r.day) });
  } catch {
    return NextResponse.json({ lockedDays: [] });
  }
}

export async function POST(req: Request) {
  try {
    await initDB();
    const { password, year, day, lock } = await req.json();
    if (password !== 'Z@rminae2009') return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    if (lock) {
      await sql`INSERT INTO locked_days (year, day) VALUES (${year}, ${day}) ON CONFLICT DO NOTHING`;
    } else {
      await sql`DELETE FROM locked_days WHERE year=${year} AND day=${day}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
