import { sql } from '@vercel/postgres';

export async function initDB() {
  await sql`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', team_id TEXT NOT NULL, hi NUMERIC)`;
  await sql`CREATE TABLE IF NOT EXISTS courses (day INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', active_tee TEXT NOT NULL DEFAULT '', tee_options JSONB NOT NULL DEFAULT '[]')`;
  await sql`CREATE TABLE IF NOT EXISTS pairings (id TEXT PRIMARY KEY, day INTEGER NOT NULL, match_index INTEGER NOT NULL, team_a TEXT[] DEFAULT '{}', team_b TEXT[] DEFAULT '{}', player_a TEXT DEFAULT '', player_b TEXT DEFAULT '')`;
  await sql`CREATE TABLE IF NOT EXISTS scores (score_key TEXT PRIMARY KEY, holes JSONB NOT NULL DEFAULT '[]')`;
  await sql`CREATE TABLE IF NOT EXISTS setup (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;

  const { rows: pr } = await sql`SELECT COUNT(*) as c FROM players`;
  if (parseInt(pr[0].c) === 0) {
    for (let i = 1; i <= 10; i++) await sql`INSERT INTO players (id, name, team_id) VALUES (${`p${i}`}, '', 'A') ON CONFLICT DO NOTHING`;
    for (let i = 11; i <= 20; i++) await sql`INSERT INTO players (id, name, team_id) VALUES (${`p${i}`}, '', 'B') ON CONFLICT DO NOTHING`;
  }
  const { rows: cr } = await sql`SELECT COUNT(*) as c FROM courses`;
  if (parseInt(cr[0].c) === 0) {
    for (const d of [1,2,3,4]) await sql`INSERT INTO courses (day,name,active_tee,tee_options) VALUES (${d},'','','[]'::jsonb) ON CONFLICT DO NOTHING`;
  }
  const { rows: mr } = await sql`SELECT COUNT(*) as c FROM pairings`;
  if (parseInt(mr[0].c) === 0) {
    for (let i=0;i<5;i++) {
      await sql`INSERT INTO pairings (id,day,match_index,team_a,team_b) VALUES (${`d1m${i}`},1,${i},'{}','{}') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO pairings (id,day,match_index,team_a,team_b) VALUES (${`d2m${i}`},2,${i},'{}','{}') ON CONFLICT DO NOTHING`;
    }
    for (let i=0;i<10;i++) await sql`INSERT INTO pairings (id,day,match_index,player_a,player_b) VALUES (${`d3m${i}`},3,${i},'','') ON CONFLICT DO NOTHING`;
  }
}

export { sql };
