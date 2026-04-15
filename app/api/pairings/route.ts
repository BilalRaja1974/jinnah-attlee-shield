import { NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET() {
  await initDB();
  const { rows } = await sql`SELECT id, day, match_index as "matchIndex", team_a as "teamA", team_b as "teamB", player_a as "playerA", player_b as "playerB" FROM pairings ORDER BY day, match_index`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  await initDB();
  const pairings = await req.json();
  for (const p of pairings) {
    if (p.day < 3) {
      await sql`
        UPDATE pairings SET team_a = ${p.teamA as string[]}, team_b = ${p.teamB as string[]}
        WHERE id = ${p.id}
      `;
    } else {
      await sql`
        UPDATE pairings SET player_a = ${p.playerA}, player_b = ${p.playerB}
        WHERE id = ${p.id}
      `;
    }
  }
  return NextResponse.json({ ok: true });
}
