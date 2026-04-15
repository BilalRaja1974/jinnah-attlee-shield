import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET() {
  try {
    await initDB();
    const { rows } = await sql`SELECT day, name, active_tee as "activeTee", tee_options as "teeOptions" FROM courses ORDER BY day`;
    return NextResponse.json(rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initDB();
    const courses = await req.json();
    for (const c of courses) {
      await sql`
        UPDATE courses SET name=${c.name}, active_tee=${c.activeTee||''}, tee_options=${JSON.stringify(c.teeOptions||[])}::jsonb
        WHERE day=${c.day}
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
