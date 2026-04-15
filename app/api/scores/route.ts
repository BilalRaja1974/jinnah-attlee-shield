import { NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET() {
  await initDB();
  const { rows } = await sql`SELECT score_key as "scoreKey", holes FROM scores`;
  const result: Record<string, (number | null)[]> = {};
  for (const r of rows) result[r.scoreKey] = r.holes;
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  await initDB();
  const { key, holes } = await req.json();
  await sql`
    INSERT INTO scores (score_key, holes) VALUES (${key}, ${JSON.stringify(holes)}::jsonb)
    ON CONFLICT (score_key) DO UPDATE SET holes = ${JSON.stringify(holes)}::jsonb
  `;
  return NextResponse.json({ ok: true });
}
