import { NextResponse } from 'next/server';
import { sql, initDB, seedYear } from '../_db';

export async function GET() {
  try {
    await initDB();
    // Return list of all tournament years and the active year
    const { rows: years } = await sql`SELECT year FROM tournaments ORDER BY year DESC`;
    const { rows: active } = await sql`SELECT value FROM app_state WHERE key='active_year'`;
    const activeYear = active.length > 0 ? parseInt(active[0].value) : null;
    return NextResponse.json({ years: years.map(r => r.year), activeYear });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initDB();
    const { year } = await req.json();
    await seedYear(year);
    await sql`INSERT INTO app_state (key,value) VALUES ('active_year',${String(year)}) ON CONFLICT (key) DO UPDATE SET value=${String(year)}`;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
