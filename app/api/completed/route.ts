import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET() {
  try {
    await initDB();
    const { rows } = await sql`SELECT year, winner, tied, score_a as "scoreA", score_b as "scoreB", venue, matches FROM completed_tournaments ORDER BY year DESC`;
    return NextResponse.json(rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
