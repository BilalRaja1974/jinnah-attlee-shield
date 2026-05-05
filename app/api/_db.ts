import { sql } from '@vercel/postgres';

export async function initDB() {
  // Year-keyed tables — all data scoped to a tournament year
  await sql`CREATE TABLE IF NOT EXISTS tournaments (
    year INTEGER PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS players (
    year INTEGER NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    team_id TEXT NOT NULL,
    hi NUMERIC,
    PRIMARY KEY (year, id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS courses (
    year INTEGER NOT NULL,
    day INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    active_tee TEXT NOT NULL DEFAULT '',
    tee_options JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (year, day)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS pairings (
    year INTEGER NOT NULL,
    id TEXT NOT NULL,
    day INTEGER NOT NULL,
    match_index INTEGER NOT NULL,
    team_a TEXT[] DEFAULT '{}',
    team_b TEXT[] DEFAULT '{}',
    player_a TEXT DEFAULT '',
    player_b TEXT DEFAULT '',
    PRIMARY KEY (year, id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS scores (
    year INTEGER NOT NULL,
    score_key TEXT NOT NULL,
    holes JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (year, score_key)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS match_overrides (
    year INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (year, match_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS locked_days (
    year INTEGER NOT NULL,
    day INTEGER NOT NULL,
    PRIMARY KEY (year, day)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS completed_tournaments (
    year INTEGER PRIMARY KEY,
    winner TEXT,
    tied BOOLEAN NOT NULL DEFAULT FALSE,
    score_a NUMERIC NOT NULL DEFAULT 0,
    score_b NUMERIC NOT NULL DEFAULT 0,
    venue TEXT NOT NULL DEFAULT '',
    matches JSONB NOT NULL DEFAULT '[]',
    completed_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

export async function seedYear(year: number) {
  // Insert tournament record
  await sql`INSERT INTO tournaments (year) VALUES (${year}) ON CONFLICT DO NOTHING`;

  // Seed players if not present for this year
  const { rows: pr } = await sql`SELECT COUNT(*) as c FROM players WHERE year=${year}`;
  if (parseInt(pr[0].c) === 0) {
    for (let i = 1; i <= 10; i++) await sql`INSERT INTO players (year,id,name,team_id) VALUES (${year},${`p${i}`},'','A') ON CONFLICT DO NOTHING`;
    for (let i = 11; i <= 20; i++) await sql`INSERT INTO players (year,id,name,team_id) VALUES (${year},${`p${i}`},'','B') ON CONFLICT DO NOTHING`;
  }

  // Seed courses if not present for this year
  const { rows: cr } = await sql`SELECT COUNT(*) as c FROM courses WHERE year=${year}`;
  if (parseInt(cr[0].c) === 0) {
    for (const d of [1,2,3,4]) await sql`INSERT INTO courses (year,day,name,active_tee,tee_options) VALUES (${year},${d},'','','[]'::jsonb) ON CONFLICT DO NOTHING`;
  }

  // Seed pairings if not present for this year
  const { rows: mr } = await sql`SELECT COUNT(*) as c FROM pairings WHERE year=${year}`;
  if (parseInt(mr[0].c) === 0) {
    for (let i=0;i<5;i++) {
      await sql`INSERT INTO pairings (year,id,day,match_index,team_a,team_b) VALUES (${year},${`d1m${i}`},1,${i},'{}','{}') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO pairings (year,id,day,match_index,team_a,team_b) VALUES (${year},${`d2m${i}`},2,${i},'{}','{}') ON CONFLICT DO NOTHING`;
    }
    for (let i=0;i<10;i++) await sql`INSERT INTO pairings (year,id,day,match_index,player_a,player_b) VALUES (${year},${`d3m${i}`},3,${i},'','') ON CONFLICT DO NOTHING`;
  }
}

export { sql };
