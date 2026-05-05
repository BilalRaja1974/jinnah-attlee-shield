import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET(req: Request) {
  try {
    await initDB();
    const year = new URL(req.url).searchParams.get('year');
    if (!year) return NextResponse.json([]);
    const { rows } = await sql`SELECT match_id as "matchId", day, result FROM match_overrides WHERE year=${parseInt(year)}`;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    await initDB();
    const { password, year, matchId, day, result } = await req.json();
    if (password !== 'Z@rminae2009') return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    if (result === null) {
      await sql`DELETE FROM match_overrides WHERE year=${year} AND match_id=${matchId}`;
    } else {
      await sql`INSERT INTO match_overrides (year, match_id, day, result) VALUES (${year}, ${matchId}, ${day}, ${result})
        ON CONFLICT (year, match_id) DO UPDATE SET result=${result}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
