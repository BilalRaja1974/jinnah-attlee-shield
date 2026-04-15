import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET(req: Request) {
  try {
    await initDB();
    const year = new URL(req.url).searchParams.get('year');
    if (!year) return NextResponse.json({ error: 'year required' }, { status: 400 });
    const { rows } = await sql`SELECT day, name, active_tee as "activeTee", tee_options as "teeOptions" FROM courses WHERE year=${parseInt(year)} ORDER BY day`;
    return NextResponse.json(rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initDB();
    const { year, courses } = await req.json();
    for (const c of courses) {
      await sql`UPDATE courses SET name=${c.name}, active_tee=${c.activeTee||''}, tee_options=${JSON.stringify(c.teeOptions||[])}::jsonb WHERE year=${year} AND day=${c.day}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
