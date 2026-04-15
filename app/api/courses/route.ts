import { NextResponse } from 'next/server';
import { sql, initDB } from '../_db';

export async function GET() {
  await initDB();
  const { rows } = await sql`SELECT day, name, tees, slope, cr, par, holes FROM courses ORDER BY day`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  await initDB();
  const courses = await req.json();
  for (const c of courses) {
    await sql`
      UPDATE courses SET name=${c.name}, tees=${c.tees}, slope=${c.slope},
        cr=${c.cr===''?null:c.cr}, par=${c.par}, holes=${JSON.stringify(c.holes)}::jsonb
      WHERE day=${c.day}
    `;
  }
  return NextResponse.json({ ok: true });
}
