'use client';
import { useState, useEffect, useCallback } from 'react';

// ── Golf logic (inlined) ──────────────────────────────────
interface Hole { hole: number; par: number; si: number; }
interface Player { id: string; name: string; teamId: string; hi: number | null; }
interface TeeOption { name: string; slope: number; cr: number; par: number; holes: Hole[]; }
interface Course { day: number; name: string; activeTee: string; teeOptions: TeeOption[]; }
interface Pairing {
  id: string; day: number; matchIndex: number;
  teamA: string[]; teamB: string[];
  playerA: string; playerB: string;
}
interface MatchStat { sc: number; pl: number; closed: boolean; rem: number; }

const DEFAULT_HOLES: Hole[] = Array.from({length:18},(_,i)=>({hole:i+1,par:[4,4,3,4,5,3,4,4,4,4,4,3,4,5,3,4,4,5][i],si:i+1}));
function activeTeeOf(course: Course): TeeOption {
  const t = course.teeOptions?.find(t => t.name === course.activeTee) || course.teeOptions?.[0];
  return t || { name: '', slope: 113, cr: 72, par: 72, holes: DEFAULT_HOLES };
}

const TNAME: Record<string, string> = { A: 'Pakistan', B: 'England' };
const TCOL: Record<string, string> = { A: '#0F6E56', B: '#185FA5' };
const TBG: Record<string, string> = { A: '#E1F5EE', B: '#E6F1FB' };
const TTXT: Record<string, string> = { A: '#085041', B: '#0C447C' };
const DAY_FMT: Record<number, string> = { 1: '2-ball scramble', 2: 'Fourball', 3: 'Singles', 4: 'Individual competition' };
const DAY_COURSE: Record<number, string> = { 1: 'qdl_south', 2: 'san_lorenzo', 3: 'qdl_laranjal', 4: 'qdl_north' };
const DAY_LABEL: Record<number, string> = { 1: 'South Course', 2: 'San Lorenzo', 3: 'Laranjal', 4: 'North Course' };

const HISTORY = [
  { year: 2024, winner: 'Pakistan', venue: 'Belek, Turkey', tied: false },
  { year: 2025, winner: null, venue: 'Paphos, Cyprus', tied: true },
];

function calcPH(hi: number, slope: number, cr: number, par: number): number {
  return Math.round(hi * (slope / 113) + (cr - par));
}
function scrambHcp(a: number, b: number): number {
  return Math.round(0.35 * Math.min(a, b) + 0.15 * Math.max(a, b));
}
function shotsOnHole(hcp: number, si: number): number {
  if (hcp <= 0) return 0;
  return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
}
function playerPH(player: Player, course: Course): number {
  const tee = activeTeeOf(course);
  if (player.hi === null || !tee.cr) return 0;
  return calcPH(Number(player.hi), tee.slope, Number(tee.cr), tee.par);
}

function holeWinner(nA: number, nB: number): 'A' | 'B' | 'H' {
  return nA < nB ? 'A' : nB < nA ? 'B' : 'H';
}

function getResults(
  day: number, match: Pairing, players: Player[], course: Course,
  scores: Record<string, (number | null)[]>
): (string | null)[] {
  const tee = activeTeeOf(course);
  if (!tee?.cr) return Array(18).fill(null);
  const ph = (pid: string) => {
    const p = players.find(x => x.id === pid);
    return (!p || p.hi === null) ? 0 : playerPH(p, course);
  };

  if (day === 1) {
    const { teamA, teamB } = match;
    if (!teamA[0] || !teamA[1] || !teamB[0] || !teamB[1]) return Array(18).fill(null);
    const hA = scrambHcp(ph(teamA[0]), ph(teamA[1]));
    const hB = scrambHcp(ph(teamB[0]), ph(teamB[1]));
    const stA = Math.max(0, hA - hB), stB = Math.max(0, hB - hA);
    return tee.holes.map((hole, i) => {
      const sA = scores[`d1_${match.id}_A`]?.[i];
      const sB = scores[`d1_${match.id}_B`]?.[i];
      if (!sA || !sB) return null;
      return holeWinner(sA - shotsOnHole(stA, hole.si), sB - shotsOnHole(stB, hole.si));
    });
  }

  if (day === 2) {
    const { teamA, teamB } = match;
    if (!teamA[0] || !teamA[1] || !teamB[0] || !teamB[1]) return Array(18).fill(null);
    const all = [...teamA, ...teamB];
    const phs: Record<string, number> = {};
    all.forEach(pid => phs[pid] = ph(pid));
    const mn = Math.min(...Object.values(phs));
    return tee.holes.map((hole, i) => {
      const net = (pid: string) => {
        const s = scores[`d2_${pid}`]?.[i];
        return !s ? Infinity : s - shotsOnHole(Math.max(0, phs[pid] - mn), hole.si);
      };
      const bA = Math.min(net(teamA[0]), net(teamA[1]));
      const bB = Math.min(net(teamB[0]), net(teamB[1]));
      if (!isFinite(bA) || !isFinite(bB)) return null;
      return holeWinner(bA, bB);
    });
  }

  if (day === 3) {
    const { playerA, playerB } = match;
    if (!playerA || !playerB) return Array(18).fill(null);
    const phA = ph(playerA), phB = ph(playerB);
    const stA = Math.max(0, phA - phB), stB = Math.max(0, phB - phA);
    return tee.holes.map((hole, i) => {
      const sA = scores[`d3_${playerA}`]?.[i];
      const sB = scores[`d3_${playerB}`]?.[i];
      if (!sA || !sB) return null;
      return holeWinner(sA - shotsOnHole(stA, hole.si), sB - shotsOnHole(stB, hole.si));
    });
  }
  return Array(18).fill(null);
}

function matchStat(res: (string | null)[]): MatchStat {
  let sc = 0, pl = 0;
  for (let i = 0; i < 18; i++) {
    if (res[i] == null) break;
    pl++;
    if (res[i] === 'A') sc++;
    else if (res[i] === 'B') sc--;
    if (Math.abs(sc) > 18 - pl) return { sc, pl, closed: true, rem: 18 - pl };
  }
  return { sc, pl, closed: false, rem: 18 - pl };
}

function statLabel(s: MatchStat): string {
  if (s.pl === 0) return 'Not started';
  if (s.closed) return `${s.sc > 0 ? TNAME.A : TNAME.B} wins ${Math.abs(s.sc)}&${s.rem}`;
  if (s.pl === 18) return s.sc === 0 ? 'Halved' : `${s.sc > 0 ? TNAME.A : TNAME.B} wins`;
  if (s.sc === 0) return 'All square';
  return `${s.sc > 0 ? TNAME.A : TNAME.B} ${Math.abs(s.sc)} up`;
}

function matchPts(s: MatchStat): { A: number; B: number } {
  const done = s.closed || s.pl === 18;
  if (!done) return { A: 0, B: 0 };
  if (s.sc > 0) return { A: 1, B: 0 };
  if (s.sc < 0) return { A: 0, B: 1 };
  return { A: 0.5, B: 0.5 };
}

function fmtPt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}


// ── Styles ────────────────────────────────────────────────
const S = {
  card: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' } as React.CSSProperties,
  inp: { width: '100%', padding: '8px 10px', border: '1px solid #d0d0cc', borderRadius: 8, fontSize: 14, color: '#111', background: '#fff', outline: 'none', boxSizing: 'border-box' as const },
  lbl: { fontSize: 11, color: '#888', marginBottom: 3, display: 'block' },
  sm: { width: 36, textAlign: 'center' as const, padding: '4px 2px', border: '1px solid #d0d0cc', borderRadius: 6, fontSize: 13, background: '#fff', color: '#111' },
  sel: { width: '100%', padding: '7px 8px', border: '1px solid #d0d0cc', borderRadius: 8, fontSize: 13, color: '#111', background: '#fff' },
};

function Btn({ label, primary, small, onClick, full, disabled }: { label: string; primary?: boolean; small?: boolean; onClick?: () => void; full?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '5px 13px' : '9px 20px', borderRadius: 999,
      border: primary ? 'none' : '1px solid #d0d0cc',
      background: primary ? '#111' : 'transparent',
      color: primary ? '#fff' : '#111',
      fontSize: small ? 12 : 14, cursor: disabled ? 'default' : 'pointer',
      fontWeight: primary ? 500 : 400, width: full ? '100%' : 'auto',
      opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: '3rem', color: '#888', fontSize: 14 }}>Loading…</div>;
}

// ── Shield ────────────────────────────────────────────────
function Shield({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 56 64" fill="none">
      <path d="M28 2 L54 12 L54 34 C54 50 28 62 28 62 C28 62 2 50 2 34 L2 12 Z" fill="#f0f0ec" stroke="#ccc" strokeWidth="1.5" />
      <line x1="28" y1="8" x2="28" y2="60" stroke="#ddd" strokeWidth="1" />
      <line x1="4" y1="22" x2="52" y2="22" stroke="#ddd" strokeWidth="1" />
      <text x="15" y="17" fontSize="7" fill={TCOL.A} fontWeight="600" textAnchor="middle">PAK</text>
      <text x="41" y="17" fontSize="7" fill={TCOL.B} fontWeight="600" textAnchor="middle">ENG</text>
      <text x="28" y="45" fontSize="8" fill="#888" fontWeight="500" textAnchor="middle">JAS</text>
    </svg>
  );
}

// ── Team badge ────────────────────────────────────────────
function TeamBadge({ tid, size = 'sm' }: { tid: string; size?: 'sm' | 'md' }) {
  const fs = size === 'md' ? 13 : 11;
  return (
    <span style={{ fontSize: fs, fontWeight: 500, color: TTXT[tid], background: TBG[tid], padding: '2px 8px', borderRadius: 999 }}>
      {TNAME[tid]}
    </span>
  );
}

// ── Home ──────────────────────────────────────────────────
function Home({ setupDone, onSetup, onPlay }: { setupDone: boolean; onSetup: () => void; onPlay: () => void }) {
  const pWins = HISTORY.filter(r => !r.tied && r.winner === 'Pakistan').length;
  const eWins = HISTORY.filter(r => !r.tied && r.winner === 'England').length;
  const ties = HISTORY.filter(r => r.tied).length;

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '2rem 0 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}><Shield size={70} /></div>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>The</div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 6px', lineHeight: 1.2 }}>Jinnah-Attlee Shield</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: TCOL.A }}>{TNAME.A}</span>
          <span style={{ fontSize: 14, color: '#bbb' }}>vs</span>
          <span style={{ fontSize: 16, fontWeight: 500, color: TCOL.B }}>{TNAME.B}</span>
        </div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>3-day team match play · 20 points</div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>SERIES RECORD</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1.25rem' }}>
          {[
            { tid: 'A', val: pWins, lbl: TNAME.A },
            { tid: null, val: ties, lbl: 'Tied' },
            { tid: 'B', val: eWins, lbl: TNAME.B },
          ].map(({ tid, val, lbl }) => (
            <div key={lbl} style={{ background: tid ? TBG[tid] : '#f4f4f0', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 600, color: tid ? TCOL[tid] : '#888' }}>{val}</div>
              <div style={{ fontSize: 11, color: tid ? TTXT[tid] : '#888', marginTop: 2 }}>{lbl}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>PREVIOUS EDITIONS</div>
        <div style={{ borderTop: '1px solid #f0f0ec' }}>
          {HISTORY.map((r, i) => (
            <div key={r.year} style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: i < HISTORY.length - 1 ? '1px solid #f0f0ec' : 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.year}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{r.venue}</div>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: r.tied ? '#f4f4f0' : r.winner === 'Pakistan' ? TBG.A : TBG.B, color: r.tied ? '#888' : r.winner === 'Pakistan' ? TTXT.A : TTXT.B }}>
                {r.tied ? 'Tied' : `${r.winner} won`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: '0.5rem' }}>
        {!setupDone
          ? <Btn label="Set up this year's tournament →" primary full onClick={onSetup} />
          : <>
            <Btn label="Play →" primary onClick={onPlay} full />
            <Btn label="Setup" onClick={onSetup} />
          </>
        }
      </div>
    </div>
  );
}

// ── Players setup ─────────────────────────────────────────
function PlayersStep({ players, setPlayers }: { players: Player[]; setPlayers: (p: Player[]) => void }) {
  const upd = (id: string, f: string, v: string) =>
    setPlayers(players.map(p => p.id === id ? { ...p, [f]: v } : p));

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Players & handicap indexes</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: '1.25rem' }}>Enter each player's WHS handicap index. Playing handicaps are calculated per course each day.</p>
      {(['A', 'B'] as const).map(tid => {
        const tp = players.filter(p => p.teamId === tid);
        return (
          <div key={tid} style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: TTXT[tid], borderLeft: `3px solid ${TCOL[tid]}`, paddingLeft: 10, marginBottom: '0.75rem' }}>{TNAME[tid]}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 72px', gap: 6, marginBottom: 4, paddingLeft: 4 }}>
              <span /><span style={{ fontSize: 11, color: '#aaa' }}>Name</span><span style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>H.I.</span>
            </div>
            {tp.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 72px', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#bbb', textAlign: 'center' }}>{i + 1}</span>
                <input style={S.inp} value={p.name} placeholder={`Player ${i + 1}`} onChange={e => upd(p.id, 'name', e.target.value)} />
                <input style={{ ...S.inp, textAlign: 'center', padding: '8px 4px' }} type="number" step="0.1" min="-9.9" max="54" value={p.hi ?? ''} placeholder="18.0" onChange={e => upd(p.id, 'hi', e.target.value)} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Courses setup ─────────────────────────────────────────
// ── Courses setup ─────────────────────────────────────────
// ── Pre-loaded course data ─────────────────────────────────
const COURSE_LIBRARY: Record<string, {name:string; tees:TeeOption[]}> = {
  'san_lorenzo': {
    name: 'San Lorenzo Golf Course',
    tees: [
      { name: 'Yellow', slope: 134, cr: 70.7, par: 72, holes: [
        {hole:1,par:5,si:7},{hole:2,par:3,si:15},{hole:3,par:4,si:13},{hole:4,par:4,si:9},
        {hole:5,par:3,si:17},{hole:6,par:4,si:1},{hole:7,par:4,si:11},{hole:8,par:5,si:3},
        {hole:9,par:4,si:5},{hole:10,par:5,si:12},{hole:11,par:4,si:16},{hole:12,par:4,si:2},
        {hole:13,par:4,si:8},{hole:14,par:3,si:18},{hole:15,par:5,si:6},{hole:16,par:3,si:14},
        {hole:17,par:4,si:10},{hole:18,par:4,si:4}
      ]},
      { name: 'White', slope: 136, cr: 73.0, par: 72, holes: [
        {hole:1,par:5,si:7},{hole:2,par:3,si:15},{hole:3,par:4,si:13},{hole:4,par:4,si:9},
        {hole:5,par:3,si:17},{hole:6,par:4,si:1},{hole:7,par:4,si:11},{hole:8,par:5,si:3},
        {hole:9,par:4,si:5},{hole:10,par:5,si:12},{hole:11,par:4,si:16},{hole:12,par:4,si:2},
        {hole:13,par:4,si:8},{hole:14,par:3,si:18},{hole:15,par:5,si:6},{hole:16,par:3,si:14},
        {hole:17,par:4,si:10},{hole:18,par:4,si:4}
      ]},
    ]
  },
  'qdl_north': {
    name: 'Quinta do Lago - North',
    tees: [
      { name: 'Yellow', slope: 136, cr: 73.1, par: 72, holes: [
        {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:5,si:9},{hole:4,par:4,si:1},
        {hole:5,par:4,si:5},{hole:6,par:4,si:13},{hole:7,par:5,si:7},{hole:8,par:3,si:17},
        {hole:9,par:4,si:3},{hole:10,par:4,si:12},{hole:11,par:5,si:10},{hole:12,par:4,si:4},
        {hole:13,par:4,si:6},{hole:14,par:3,si:16},{hole:15,par:4,si:2},{hole:16,par:3,si:18},
        {hole:17,par:4,si:14},{hole:18,par:5,si:8}
      ]},
      { name: 'White', slope: 131, cr: 72.0, par: 72, holes: [
        {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:5,si:9},{hole:4,par:4,si:1},
        {hole:5,par:4,si:5},{hole:6,par:4,si:13},{hole:7,par:5,si:7},{hole:8,par:3,si:17},
        {hole:9,par:4,si:3},{hole:10,par:4,si:12},{hole:11,par:5,si:10},{hole:12,par:4,si:4},
        {hole:13,par:4,si:6},{hole:14,par:3,si:16},{hole:15,par:4,si:2},{hole:16,par:3,si:18},
        {hole:17,par:4,si:14},{hole:18,par:5,si:8}
      ]},
    ]
  },
  'qdl_south': {
    name: 'Quinta do Lago - South',
    tees: [
      { name: 'Yellow', slope: 133, cr: 71.0, par: 72, holes: [
        {hole:1,par:4,si:13},{hole:2,par:5,si:7},{hole:3,par:4,si:5},{hole:4,par:3,si:17},
        {hole:5,par:5,si:1},{hole:6,par:4,si:9},{hole:7,par:3,si:15},{hole:8,par:4,si:3},
        {hole:9,par:4,si:11},{hole:10,par:4,si:6},{hole:11,par:3,si:16},{hole:12,par:5,si:12},
        {hole:13,par:4,si:18},{hole:14,par:4,si:2},{hole:15,par:3,si:8},{hole:16,par:4,si:14},
        {hole:17,par:5,si:4},{hole:18,par:4,si:10}
      ]},
      { name: 'White', slope: 127, cr: 73.5, par: 72, holes: [
        {hole:1,par:4,si:13},{hole:2,par:5,si:7},{hole:3,par:4,si:5},{hole:4,par:3,si:17},
        {hole:5,par:5,si:1},{hole:6,par:4,si:9},{hole:7,par:3,si:15},{hole:8,par:4,si:3},
        {hole:9,par:4,si:11},{hole:10,par:4,si:6},{hole:11,par:3,si:16},{hole:12,par:5,si:12},
        {hole:13,par:4,si:18},{hole:14,par:4,si:2},{hole:15,par:3,si:8},{hole:16,par:4,si:14},
        {hole:17,par:5,si:4},{hole:18,par:4,si:10}
      ]},
    ]
  },
  'qdl_laranjal': {
    name: 'Quinta do Lago - Laranjal',
    tees: [
      { name: 'Yellow', slope: 130, cr: 71.1, par: 72, holes: [
        {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:4,si:5},{hole:4,par:4,si:9},
        {hole:5,par:4,si:3},{hole:6,par:3,si:17},{hole:7,par:5,si:1},{hole:8,par:3,si:13},
        {hole:9,par:5,si:7},{hole:10,par:4,si:6},{hole:11,par:4,si:18},{hole:12,par:3,si:10},
        {hole:13,par:5,si:16},{hole:14,par:4,si:4},{hole:15,par:5,si:8},{hole:16,par:3,si:2},
        {hole:17,par:4,si:14},{hole:18,par:5,si:12}
      ]},
      { name: 'White', slope: 136, cr: 73.2, par: 72, holes: [
        {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:4,si:5},{hole:4,par:4,si:9},
        {hole:5,par:4,si:3},{hole:6,par:3,si:17},{hole:7,par:5,si:1},{hole:8,par:3,si:13},
        {hole:9,par:5,si:7},{hole:10,par:4,si:6},{hole:11,par:4,si:18},{hole:12,par:3,si:10},
        {hole:13,par:5,si:16},{hole:14,par:4,si:4},{hole:15,par:5,si:8},{hole:16,par:3,si:2},
        {hole:17,par:4,si:14},{hole:18,par:5,si:12}
      ]},
      { name: 'Black', slope: 140, cr: 75.4, par: 72, holes: [
        {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:4,si:5},{hole:4,par:4,si:9},
        {hole:5,par:4,si:3},{hole:6,par:3,si:17},{hole:7,par:5,si:1},{hole:8,par:3,si:13},
        {hole:9,par:5,si:7},{hole:10,par:4,si:6},{hole:11,par:4,si:18},{hole:12,par:3,si:10},
        {hole:13,par:5,si:16},{hole:14,par:4,si:4},{hole:15,par:5,si:8},{hole:16,par:3,si:2},
        {hole:17,par:4,si:14},{hole:18,par:5,si:12}
      ]},
    ]
  },
};

const SAN_LORENZO_TEES = [
  { name: 'Yellow', slope: 134, cr: 70.7, par: 72, holes: [{"hole": 1, "par": 5, "si": 7}, {"hole": 2, "par": 3, "si": 15}, {"hole": 3, "par": 4, "si": 13}, {"hole": 4, "par": 4, "si": 9}, {"hole": 5, "par": 3, "si": 17}, {"hole": 6, "par": 4, "si": 1}, {"hole": 7, "par": 4, "si": 11}, {"hole": 8, "par": 5, "si": 3}, {"hole": 9, "par": 4, "si": 5}, {"hole": 10, "par": 5, "si": 12}, {"hole": 11, "par": 4, "si": 16}, {"hole": 12, "par": 4, "si": 2}, {"hole": 13, "par": 4, "si": 8}, {"hole": 14, "par": 3, "si": 18}, {"hole": 15, "par": 5, "si": 6}, {"hole": 16, "par": 3, "si": 14}, {"hole": 17, "par": 4, "si": 10}, {"hole": 18, "par": 4, "si": 4}] },
  { name: 'White', slope: 136, cr: 73.0, par: 72, holes: [{"hole": 1, "par": 5, "si": 7}, {"hole": 2, "par": 3, "si": 15}, {"hole": 3, "par": 4, "si": 13}, {"hole": 4, "par": 4, "si": 9}, {"hole": 5, "par": 3, "si": 17}, {"hole": 6, "par": 4, "si": 1}, {"hole": 7, "par": 4, "si": 11}, {"hole": 8, "par": 5, "si": 3}, {"hole": 9, "par": 4, "si": 5}, {"hole": 10, "par": 5, "si": 12}, {"hole": 11, "par": 4, "si": 16}, {"hole": 12, "par": 4, "si": 2}, {"hole": 13, "par": 4, "si": 8}, {"hole": 14, "par": 3, "si": 18}, {"hole": 15, "par": 5, "si": 6}, {"hole": 16, "par": 3, "si": 14}, {"hole": 17, "par": 4, "si": 10}, {"hole": 18, "par": 4, "si": 4}] },
];

function CoursesStep({ courses, setCourses }: { courses: Course[]; setCourses: (c: Course[]) => void }) {
  const [ad, setAd] = useState(1);
  const [showH, setShowH] = useState(false);
  const [editTeeIdx, setEditTeeIdx] = useState<number | null>(null);
  const c = courses.find(x => x.day === ad)!;
  const tees = c.teeOptions || [];

  const updCourse = (f: string, v: any) => setCourses(courses.map(x => x.day === ad ? { ...x, [f]: v } : x));

  const addTee = () => {
    const newTee: TeeOption = { name: '', slope: 113, cr: 72, par: 72, holes: DEFAULT_HOLES };
    const updated = [...tees, newTee];
    updCourse('teeOptions', updated);
    setEditTeeIdx(updated.length - 1);
  };

  const removeTee = (idx: number) => {
    const updated = tees.filter((_, i) => i !== idx);
    updCourse('teeOptions', updated);
    if (c.activeTee === tees[idx].name) updCourse('activeTee', updated[0]?.name || '');
    setEditTeeIdx(null);
  };

  const updTee = (idx: number, f: string, v: any) => {
    const updated = tees.map((t, i) => i === idx ? { ...t, [f]: v } : t);
    updCourse('teeOptions', updated);
  };

  const updHole = (teeIdx: number, holeIdx: number, f: string, v: number) => {
    const updated = tees.map((t, i) => {
      if (i !== teeIdx) return t;
      const holes = t.holes.map((h, j): Hole => j === holeIdx ? { ...h, [f]: v } : h);
      return { ...t, holes };
    });
    updCourse('teeOptions', updated);
  };



  const activeTee = tees.find(t => t.name === c.activeTee) || tees[0];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Course details</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>Set course name, add tee options, then select which tees you are playing on the day.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {[1, 2, 3, 4].map(d => (
          <button key={d} onClick={() => { setAd(d); setShowH(false); setEditTeeIdx(null); }} style={{ padding: '5px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: ad === d ? 'none' : '1px solid #d0d0cc', background: ad === d ? '#111' : 'transparent', color: ad === d ? '#fff' : '#888' }}>
            Day {d}
          </button>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.lbl}>Course name</label>
            <input style={S.inp} value={c.name} placeholder="e.g. San Lorenzo" onChange={e => updCourse('name', e.target.value)} />
          </div>
          <div style={{ paddingTop: 18 }}>
            <select onChange={e => {
              const key = e.target.value;
              if (!key) return;
              const preset = COURSE_LIBRARY[key];
              updCourse('name', preset.name);
              updCourse('teeOptions', preset.tees);
              updCourse('activeTee', preset.tees[0].name);
              e.target.value = '';
            }} style={{ ...S.sel, fontSize: 11, color: '#888' }}>
              <option value="">Load preset...</option>
              <option value="san_lorenzo">San Lorenzo</option>
              <option value="qdl_north">QDL - North</option>
              <option value="qdl_south">QDL - South</option>
              <option value="qdl_laranjal">QDL - Laranjal</option>
            </select>
          </div>
        </div>

        {tees.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <label style={S.lbl}>Active tees (playing today)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tees.map(t => (
                <button key={t.name} onClick={() => updCourse('activeTee', t.name)} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: c.activeTee === t.name ? 'none' : '1px solid #d0d0cc', background: c.activeTee === t.name ? TCOL.A : 'transparent', color: c.activeTee === t.name ? '#fff' : '#888' }}>
                  {t.name || 'Unnamed'} tees
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTee && c.activeTee && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 0', borderTop: '1px solid #f0f0ec', marginTop: 4 }}>
            <div><label style={S.lbl}>Slope</label><div style={{ fontSize: 14, fontWeight: 500 }}>{activeTee.slope}</div></div>
            <div><label style={S.lbl}>Course rating</label><div style={{ fontSize: 14, fontWeight: 500 }}>{activeTee.cr}</div></div>
            <div><label style={S.lbl}>Par</label><div style={{ fontSize: 14, fontWeight: 500 }}>{activeTee.par}</div></div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Tee options</div>
        <Btn label="+ Add tee" small onClick={addTee} />
      </div>

      {tees.map((tee, ti) => (
        <div key={ti} style={{ ...S.card, padding: '0.75rem', marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editTeeIdx === ti ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{tee.name || 'Unnamed'} tees</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>Slope {tee.slope} · CR {tee.cr} · Par {tee.par}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn label={editTeeIdx === ti ? 'Done' : 'Edit'} small onClick={() => setEditTeeIdx(editTeeIdx === ti ? null : ti)} />
              <Btn label="Remove" small onClick={() => removeTee(ti)} />
            </div>
          </div>
          {editTeeIdx === ti && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div><label style={S.lbl}>Tee name</label><input style={S.inp} value={tee.name} placeholder="Yellow" onChange={e => updTee(ti, 'name', e.target.value)} /></div>
                <div><label style={S.lbl}>Slope</label><input style={{ ...S.inp, textAlign: 'center' }} type="number" value={tee.slope} onChange={e => updTee(ti, 'slope', +e.target.value)} /></div>
                <div><label style={S.lbl}>CR</label><input style={{ ...S.inp, textAlign: 'center' }} type="number" step="0.1" value={tee.cr} onChange={e => updTee(ti, 'cr', +e.target.value)} /></div>
                <div><label style={S.lbl}>Par</label><input style={{ ...S.inp, textAlign: 'center' }} type="number" value={tee.par} onChange={e => updTee(ti, 'par', +e.target.value)} /></div>
              </div>
              <button onClick={() => setShowH(!showH)} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: '0.5rem' }}>
                {showH ? '▲ Hide hole data' : '▼ Edit hole par & stroke index'}
              </button>
              {showH && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '3px 8px', color: '#aaa', fontWeight: 400, textAlign: 'left' }}>Hole</th>
                        {tee.holes.map((_, i) => <th key={i} style={{ padding: '3px 4px', color: '#aaa', fontWeight: 400, textAlign: 'center', minWidth: 36 }}>{i + 1}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px 8px', color: '#aaa', fontSize: 11 }}>Par</td>
                        {tee.holes.map((hole, i) => <td key={i} style={{ padding: 2 }}><input type="number" min={3} max={5} value={hole.par} onChange={e => updHole(ti, i, 'par', +e.target.value)} style={S.sm} /></td>)}
                      </tr>
                      <tr>
                        <td style={{ padding: '3px 8px', color: '#aaa', fontSize: 11 }}>S.I.</td>
                        {tee.holes.map((hole, i) => <td key={i} style={{ padding: 2 }}><input type="number" min={1} max={18} value={hole.si} onChange={e => updHole(ti, i, 'si', +e.target.value)} style={S.sm} /></td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {tees.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#bbb', fontSize: 13, border: '1px dashed #e0e0dc', borderRadius: 10 }}>
          Tap "+ Add tee" to add tee data, or use "Load San Lorenzo" if playing there
        </div>
      )}
    </div>
  );
}


// ── Setup flow ────────────────────────────────────────────
// ── Setup flow ────────────────────────────────────────────
function Setup({ onBack, onDone, initPlayers, initCourses, alreadyDone }: { onBack: () => void; onDone: () => void; initPlayers: Player[]; initCourses: Course[]; alreadyDone: boolean }) {
  const [step, setStep] = useState<'players' | 'courses'>('players');
  const [players, setPlayers] = useState<Player[]>(initPlayers);
  const [courses, setCourses] = useState<Course[]>(() => {
    // Pre-assign known courses if not yet set
    return [1,2,3,4].map(d => {
      const existing = initCourses.find(c => c.day === d);
      if (existing && (existing.name || (existing.teeOptions && existing.teeOptions.length > 0))) return existing;
      const preset = COURSE_LIBRARY[DAY_COURSE[d]];
      return { day: d, name: preset.name, activeTee: preset.tees[0].name, teeOptions: preset.tees };
    });
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const savePlayers = async () => {
    setSaving(true); setSaved(false);
    await fetch('/api/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(players) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const saveCourses = async () => {
    setSaving(true); setSaved(false);
    await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(courses) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const finish = async () => {
    setSaving(true);
    await fetch('/api/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(players) });
    await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(courses) });
    if (!alreadyDone) await fetch('/api/setup', { method: 'POST' });
    setSaving(false);
    onDone();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, padding: 0 }}>← Home</button>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Tournament setup</span>
        {alreadyDone && <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 999, marginLeft: 4 }}>Setup complete</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1.5rem' }}>
        {(['players', 'courses'] as const).map((s, i) => (
          <>
            <div key={s} onClick={() => setStep(s)} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, flexShrink: 0, background: step === s ? '#111' : '#1D9E75', color: '#fff' }}>
                {step === s ? i + 1 : '✓'}
              </div>
              <span style={{ fontSize: 12, whiteSpace: 'nowrap', color: step === s ? '#111' : '#888' }}>{['Players', 'Courses'][i]}</span>
            </div>
            {i === 0 && <div style={{ width: 14, height: 1, background: '#e0e0dc', flexShrink: 0 }} />}
          </>
        ))}
      </div>

      {step === 'players' && <PlayersStep players={players} setPlayers={setPlayers} />}
      {step === 'courses' && <CoursesStep courses={courses} setCourses={setCourses} />}

      <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {step === 'courses' && <Btn label="← Players" onClick={() => setStep('players')} />}
          {step === 'players' && <Btn label={saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save players'} onClick={savePlayers} disabled={saving} />}
          {step === 'courses' && <Btn label={saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save courses'} onClick={saveCourses} disabled={saving} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {step === 'players' && <Btn label="Courses →" primary onClick={() => setStep('courses')} />}
          {step === 'courses' && <Btn label={saving ? 'Saving…' : alreadyDone ? 'Save & return →' : 'Start tournament →'} primary onClick={finish} disabled={saving} />}
        </div>
      </div>
    </div>
  );
}


// ── Pairings editor ───────────────────────────────────────
function PairingsEditor({ day, pairings, setPairings, players }: { day: number; pairings: Pairing[]; setPairings: (p: Pairing[]) => void; players: Player[] }) {
  const tp = { A: players.filter(p => p.teamId === 'A'), B: players.filter(p => p.teamId === 'B') };
  const dm = pairings.filter(p => p.day === day);

  const updSlot = (id: string, side: 'teamA' | 'teamB', si: number, v: string) => {
    setPairings(pairings.map(p => {
      if (p.id !== id) return p;
      const arr = [...(p[side] || ['', ''])]; arr[si] = v;
      return { ...p, [side]: arr };
    }));
  };
  const updField = (id: string, field: 'playerA' | 'playerB', v: string) =>
    setPairings(pairings.map(p => p.id === id ? { ...p, [field]: v } : p));

  const Sel = ({ opts, val, onChange }: { opts: Player[]; val: string; onChange: (v: string) => void }) => (
    <select style={S.sel} value={val || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— Select —</option>
      {opts.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
    </select>
  );

  return (
    <div style={{ marginBottom: '1rem' }}>
      {dm.map((m, mi) => (
        <div key={m.id} style={{ ...S.card, padding: '0.75rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 8 }}>Match {mi + 1}</div>
          {day < 3 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: 6, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 11, color: TCOL.A, fontWeight: 500, marginBottom: 4 }}>{TNAME.A}</div>
                <Sel opts={tp.A} val={(m.teamA || [])[0]} onChange={v => updSlot(m.id, 'teamA', 0, v)} />
                <div style={{ height: 4 }} />
                <Sel opts={tp.A} val={(m.teamA || [])[1]} onChange={v => updSlot(m.id, 'teamA', 1, v)} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', paddingTop: 8 }}>vs</div>
              <div>
                <div style={{ fontSize: 11, color: TCOL.B, fontWeight: 500, marginBottom: 4 }}>{TNAME.B}</div>
                <Sel opts={tp.B} val={(m.teamB || [])[0]} onChange={v => updSlot(m.id, 'teamB', 0, v)} />
                <div style={{ height: 4 }} />
                <Sel opts={tp.B} val={(m.teamB || [])[1]} onChange={v => updSlot(m.id, 'teamB', 1, v)} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: 6, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 11, color: TCOL.A, fontWeight: 500, marginBottom: 4 }}>{TNAME.A}</div>
                <Sel opts={tp.A} val={m.playerA} onChange={v => updField(m.id, 'playerA', v)} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', paddingTop: 8 }}>vs</div>
              <div>
                <div style={{ fontSize: 11, color: TCOL.B, fontWeight: 500, marginBottom: 4 }}>{TNAME.B}</div>
                <Sel opts={tp.B} val={m.playerB} onChange={v => updField(m.id, 'playerB', v)} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Match cards ───────────────────────────────────────────
function MatchCards({ day, pairings, players, course, scores, onSelect }: { day: number; pairings: Pairing[]; players: Player[]; course: Course; scores: Record<string, (number | null)[]>; onSelect: (id: string) => void }) {
  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name || '—';
  const dm = pairings.filter(p => p.day === day);

  return (
    <div>
      {dm.map((m, i) => {
        const res = getResults(day, m, players, course, scores);
        const s = matchStat(res);
        const paired = day < 3 ? !!(m.teamA?.[0] && m.teamB?.[0]) : !!(m.playerA && m.playerB);
        const lA = day < 3 ? `${nameOf(m.teamA?.[0])} & ${nameOf(m.teamA?.[1])}` : nameOf(m.playerA);
        const lB = day < 3 ? `${nameOf(m.teamB?.[0])} & ${nameOf(m.teamB?.[1])}` : nameOf(m.playerB);
        const done = s.closed || s.pl === 18;
        const pts = matchPts(s);

        return (
          <div key={m.id} onClick={() => paired && onSelect(m.id)} style={{ ...S.card, cursor: paired ? 'pointer' : 'default', padding: '0.75rem', borderLeft: done ? `4px solid ${s.sc > 0 ? TCOL.A : s.sc < 0 ? TCOL.B : '#ccc'}` : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#aaa' }}>Match {i + 1}</span>
              {s.pl > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: done ? '#e8f5e9' : '#f4f4f0', color: done ? '#2e7d32' : '#888' }}>{done ? 'Complete' : `Thru ${s.pl}`}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 1fr', gap: 4, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: TCOL.A, fontWeight: 500, marginBottom: 2 }}>{TNAME.A}</div>
                <div style={{ fontSize: 13 }}>{lA}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: s.pl === 0 ? 13 : 20, fontWeight: 500, color: s.sc > 0 ? TCOL.A : s.sc < 0 ? TCOL.B : '#bbb' }}>
                  {s.pl === 0 ? 'vs' : s.sc === 0 ? 'AS' : `${Math.abs(s.sc)}${s.closed ? '&' + s.rem : ''}`}
                </div>
                {done && <div style={{ fontSize: 10, color: s.sc > 0 ? TTXT.A : s.sc < 0 ? TTXT.B : '#888', marginTop: 2 }}>
                  {pts.A} – {pts.B}
                </div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: TCOL.B, fontWeight: 500, marginBottom: 2 }}>{TNAME.B}</div>
                <div style={{ fontSize: 13 }}>{lB}</div>
              </div>
            </div>
            {!paired && <div style={{ fontSize: 11, color: '#bbb', marginTop: 6, textAlign: 'center' }}>Tap "Edit pairings" to assign players</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Score entry ───────────────────────────────────────────
function ScoreEntry({ day, matchId, pairings, players, course, scores, onSave, onBack }: { day: number; matchId: string; pairings: Pairing[]; players: Player[]; course: Course; scores: Record<string, (number | null)[]>; onSave: (key: string, holes: (number | null)[]) => Promise<void>; onBack: () => void }) {
  const match = pairings.find(m => m.id === matchId)!;
  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name || '?';
  const ph = (pid: string) => { const p = players.find(x => x.id === pid); return (!p || p.hi === null) ? 0 : playerPH(p, course); };
  const [localScores, setLocalScores] = useState<Record<string, (number | null)[]>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const init: Record<string, (number | null)[]> = {};
    // build row keys
    const keys = buildRows().map(r => r.key);
    keys.forEach(k => { init[k] = scores[k] ? [...scores[k]] : Array(18).fill(null); });
    setLocalScores(init);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  interface Row { key: string; label: string; teamId: string; hcp: number; shots: number; }
  const buildRows = (): Row[] => {
    if (day === 1) {
      const { teamA, teamB } = match;
      const hA = scrambHcp(ph(teamA[0]), ph(teamA[1]));
      const hB = scrambHcp(ph(teamB[0]), ph(teamB[1]));
      return [
        { key: `d1_${matchId}_A`, label: `${nameOf(teamA[0])} & ${nameOf(teamA[1])}`, teamId: 'A', hcp: hA, shots: Math.max(0, hA - hB) },
        { key: `d1_${matchId}_B`, label: `${nameOf(teamB[0])} & ${nameOf(teamB[1])}`, teamId: 'B', hcp: hB, shots: Math.max(0, hB - hA) },
      ];
    }
    if (day === 2) {
      const { teamA, teamB } = match;
      const all = [...teamA, ...teamB];
      const phs: Record<string, number> = {}; all.forEach(pid => phs[pid] = ph(pid));
      const mn = Math.min(...Object.values(phs));
      return [
        { key: `d2_${teamA[0]}`, label: nameOf(teamA[0]), teamId: 'A', hcp: phs[teamA[0]], shots: Math.max(0, phs[teamA[0]] - mn) },
        { key: `d2_${teamA[1]}`, label: nameOf(teamA[1]), teamId: 'A', hcp: phs[teamA[1]], shots: Math.max(0, phs[teamA[1]] - mn) },
        { key: `d2_${teamB[0]}`, label: nameOf(teamB[0]), teamId: 'B', hcp: phs[teamB[0]], shots: Math.max(0, phs[teamB[0]] - mn) },
        { key: `d2_${teamB[1]}`, label: nameOf(teamB[1]), teamId: 'B', hcp: phs[teamB[1]], shots: Math.max(0, phs[teamB[1]] - mn) },
      ];
    }
    const { playerA, playerB } = match;
    const phA = ph(playerA), phB = ph(playerB);
    return [
      { key: `d3_${playerA}`, label: nameOf(playerA), teamId: 'A', hcp: phA, shots: Math.max(0, phA - phB) },
      { key: `d3_${playerB}`, label: nameOf(playerB), teamId: 'B', hcp: phB, shots: Math.max(0, phB - phA) },
    ];
  };

  const rows = buildRows();
  const mergedScores = { ...scores, ...localScores };
  const res = getResults(day, match, players, course, mergedScores);
  const s = matchStat(res);

  const setScore = (key: string, hi: number, val: string) => {
    const v = val === '' ? null : Math.max(1, parseInt(val));
    setLocalScores(prev => {
      const arr = prev[key] ? [...prev[key]] : Array(18).fill(null);
      arr[hi] = v;
      return { ...prev, [key]: arr };
    });
  };

  const saveRow = async (key: string) => {
    setSaving(key);
    await onSave(key, localScores[key] || Array(18).fill(null));
    setSaving(null);
  };

  const hs: React.CSSProperties = { padding: '3px 4px', textAlign: 'center', fontSize: 11, color: '#aaa' };
  const cs: React.CSSProperties = { padding: '2px 3px', textAlign: 'center', fontSize: 12 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, padding: 0 }}>← Back</button>
        <span style={{ fontSize: 14, color: '#888' }}>Score entry · {DAY_FMT[day]}</span>
      </div>

      <div style={{ ...S.card, background: (s.closed || s.pl === 18) ? '#e8f5e9' : '#f8f8f6', border: 'none', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{statLabel(s)}</div>
            {s.pl > 0 && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.pl} holes played</div>}
          </div>
          {s.pl > 0 && (
            <div style={{ display: 'flex', gap: 20 }}>
              {(['A', 'B'] as const).map(tid => (
                <div key={tid} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: TCOL[tid], marginBottom: 2 }}>{TNAME[tid]}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: TCOL[tid] }}>{matchPts(s)[tid]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...S.card, padding: '0.5rem', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...hs, textAlign: 'left', width: 120 }} />
              {activeTeeOf(course).holes.map((_, i) => <th key={i} style={{ ...hs, minWidth: 34 }}>{i + 1}</th>)}
              <th style={{ ...hs, minWidth: 40 }}>Save</th>
            </tr>
            <tr>
              <td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>Par</td>
              {activeTeeOf(course).holes.map((hole, i) => <td key={i} style={hs}>{hole.par}</td>)}
              <td />
            </tr>
            <tr>
              <td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>S.I.</td>
              {activeTeeOf(course).holes.map((hole, i) => <td key={i} style={hs}>{hole.si}</td>)}
              <td />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td style={{ ...cs, textAlign: 'left', fontWeight: 500, color: TCOL[row.teamId], paddingLeft: 4, whiteSpace: 'nowrap', fontSize: 11 }}>
                  {row.label} ({row.hcp})
                </td>
                {activeTeeOf(course).holes.map((hole, i) => {
                  const val = localScores[row.key]?.[i] ?? null;
                  const net = val !== null ? val - shotsOnHole(row.shots, hole.si) : null;
                  const diff = net !== null ? net - hole.par : null;
                  const bg = diff == null ? 'transparent' : diff <= -2 ? '#185FA5' : diff === -1 ? '#1D9E75' : diff === 0 ? 'transparent' : diff === 1 ? '#E24B4A' : '#A32D2D';
                  const fc = diff == null || diff === 0 ? '#111' : '#fff';
                  return (
                    <td key={i} style={{ padding: 2 }}>
                      <input type="number" min={1} max={15} value={val ?? ''} onChange={e => setScore(row.key, i, e.target.value)}
                        style={{ width: 33, textAlign: 'center', padding: '3px 1px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, background: bg, color: fc }} />
                    </td>
                  );
                })}
                <td style={{ padding: '2px 4px' }}>
                  <button onClick={() => saveRow(row.key)} disabled={saving === row.key} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', background: saving === row.key ? '#f0f0ec' : '#111', color: saving === row.key ? '#888' : '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {saving === row.key ? '…' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cs, textAlign: 'left', fontSize: 11, color: '#888', paddingLeft: 4, fontWeight: 500 }}>Hole result</td>
              {res.map((r, i) => <td key={i} style={{ ...cs, fontWeight: 500, color: r === 'A' ? TCOL.A : r === 'B' ? TCOL.B : r === 'H' ? '#888' : '#ddd' }}>{r === 'H' ? '½' : r || '·'}</td>)}
              <td />
            </tr>
            <tr>
              <td style={{ ...cs, textAlign: 'left', fontSize: 11, color: '#888', paddingLeft: 4 }}>Status</td>
              {res.map((_, i) => {
                const sub = res.slice(0, i + 1) as (string | null)[];
                const ss = matchStat(sub);
                const txt = res[i] == null ? '' : ss.sc === 0 ? 'AS' : `${ss.sc > 0 ? 'A' : 'B'}${Math.abs(ss.sc)}${ss.closed ? '&' + ss.rem : ''}`;
                return <td key={i} style={{ ...cs, fontSize: 10, color: ss.sc > 0 ? TCOL.A : ss.sc < 0 ? TCOL.B : '#bbb' }}>{txt}</td>;
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Individual scorecard ──────────────────────────────────
function Scorecard({ day, pid, players, course, scores, onBack }: { day: number; pid: string; players: Player[]; course: Course; scores: Record<string, (number | null)[]>; onBack: () => void }) {
  const player = players.find(p => p.id === pid)!;
  const teeData = activeTeeOf(course); const phVal = player?.hi !== null && teeData.cr ? playerPH(player, course) : null;

  let scoreKey: string | null = null;
  if (day === 2) scoreKey = `d2_${pid}`;
  else if (day === 3) scoreKey = `d3_${pid}`;

  const raw: (number | null)[] = scoreKey ? (scores[scoreKey] || []) : [];
  const tot = raw.reduce((a: number, s) => (s != null ? a + s : a), 0);
  const netTot = phVal !== null ? raw.reduce((a: number, s, i) => (s != null ? a + (s as number) - shotsOnHole(phVal as number, teeData.holes[i].si) : a), 0) : null;
  const parTot = teeData.holes.reduce((a, h) => a + h.par, 0);

  const hs: React.CSSProperties = { padding: '3px 4px', textAlign: 'center', fontSize: 11, color: '#aaa' };
  const cs: React.CSSProperties = { padding: '2px 3px', textAlign: 'center', fontSize: 12 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, padding: 0 }}>← Back</button>
        <span style={{ fontSize: 14, color: '#888' }}>Scorecard</span>
      </div>
      <div style={{ ...S.card, marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{player?.name || 'Player'}</div>
            <div style={{ marginTop: 4 }}><TeamBadge tid={player?.teamId} /></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Playing HCP</div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{phVal ?? '—'}</div>
            <div style={{ fontSize: 11, color: '#bbb' }}>H.I. {player?.hi ?? '—'}</div>
          </div>
        </div>
      </div>
      <div style={{ ...S.card, padding: '0.5rem', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 520 }}>
          <thead>
            <tr><th style={{ ...hs, textAlign: 'left', width: 60 }}>Hole</th>{teeData.holes.map((_, i) => <th key={i} style={{ ...hs, minWidth: 32 }}>{i + 1}</th>)}</tr>
            <tr><td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>Par</td>{teeData.holes.map((h, i) => <td key={i} style={hs}>{h.par}</td>)}</tr>
            <tr><td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>S.I.</td>{teeData.holes.map((h, i) => <td key={i} style={hs}>{h.si}</td>)}</tr>
            {phVal !== null && <tr><td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>Shots</td>{teeData.holes.map((h, i) => <td key={i} style={hs}>{shotsOnHole(phVal, h.si) || ''}</td>)}</tr>}
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cs, textAlign: 'left', fontWeight: 500, color: TCOL[player?.teamId], paddingLeft: 4 }}>Gross</td>
              {activeTeeOf(course).holes.map((hole, i) => {
                const s = raw[i]; const diff = s ? s - hole.par : null;
                const bg = diff == null ? 'transparent' : diff <= -2 ? '#185FA5' : diff === -1 ? '#1D9E75' : diff === 0 ? 'transparent' : diff === 1 ? '#E24B4A' : '#A32D2D';
                const fc = diff == null || diff === 0 ? '#111' : '#fff';
                const br = diff != null && diff <= -1 ? '50%' : diff === 1 ? '3px' : diff != null && diff >= 2 ? '2px' : '4px';
                return (
                  <td key={i} style={{ padding: 2 }}>
                    {s ? <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: br, background: bg, color: fc, fontSize: 12, fontWeight: 500, margin: '0 auto' }}>{s}</div>
                      : <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: '1px solid #eee', margin: '0 auto' }} />}
                  </td>
                );
              })}
            </tr>
            {phVal !== null && (
              <tr>
                <td style={{ ...cs, textAlign: 'left', color: '#888', paddingLeft: 4 }}>Net</td>
                {teeData.holes.map((h, i) => { const s = raw[i]; return <td key={i} style={{ ...cs, color: '#888' }}>{s ? s - shotsOnHole(phVal, h.si) : ''}</td>; })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {tot > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
          {[
            { lbl: 'Gross', val: tot, col: '#111' },
            { lbl: 'To par', val: tot - parTot > 0 ? `+${tot - parTot}` : tot - parTot, col: tot - parTot < 0 ? TCOL.A : tot - parTot > 0 ? '#E24B4A' : '#111' },
            ...(netTot !== null ? [{ lbl: 'Net', val: netTot, col: '#111' }] : []),
          ].map(({ lbl, val, col }) => (
            <div key={lbl} style={{ flex: 1, background: '#f4f4f0', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: col }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────
function DayView({ day, players, courses, pairings, setPairings, scores, onSave }: { day: number; players: Player[]; courses: Course[]; pairings: Pairing[]; setPairings: (p: Pairing[]) => void; scores: Record<string, (number | null)[]>; onSave: (key: string, holes: (number | null)[]) => Promise<void> }) {
  const [sub, setSub] = useState<string>('list');
  const [editPairings, setEditPairings] = useState(false);
  const [savingPairings, setSavingPairings] = useState(false);
  const course = courses.find(c => c.day === day)!;

  if (sub.startsWith('score:')) return <ScoreEntry day={day} matchId={sub.split(':')[1]} pairings={pairings} players={players} course={course} scores={scores} onSave={onSave} onBack={() => setSub('list')} />;
  if (sub.startsWith('card:')) return <Scorecard day={day} pid={sub.split(':')[1]} players={players} course={course} scores={scores} onBack={() => setSub('list')} />;

  const inPairings = (pid: string) => {
    const dm = pairings.filter(p => p.day === day);
    return day < 3 ? dm.some(m => (m.teamA || []).includes(pid) || (m.teamB || []).includes(pid)) : dm.some(m => m.playerA === pid || m.playerB === pid);
  };
  const pairedPlayers = players.filter(p => inPairings(p.id));

  const savePairings = async () => {
    setSavingPairings(true);
    const dm = pairings.filter(p => p.day === day);
    await fetch('/api/pairings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dm) });
    setSavingPairings(false);
    setEditPairings(false);
  };

  return (
    <div>
      <div style={{ ...S.card, background: '#f4f4f0', border: 'none', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{course.name || 'Course TBC'}</div>
            {activeTeeOf(course).name && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{activeTeeOf(course).name} tees · Par {activeTeeOf(course).par}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Slope / CR</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{activeTeeOf(course).slope} / {activeTeeOf(course).cr ?? '—'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: 15, fontWeight: 500 }}>Day {day} · {DAY_FMT[day]}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {editPairings && <Btn label={savingPairings ? 'Saving…' : 'Save pairings'} primary small onClick={savePairings} disabled={savingPairings} />}
          <Btn label={editPairings ? 'Cancel' : 'Edit pairings'} small onClick={() => setEditPairings(!editPairings)} />
        </div>
      </div>

      {editPairings && <PairingsEditor day={day} pairings={pairings} setPairings={setPairings} players={players} />}
      {!editPairings && <MatchCards day={day} pairings={pairings} players={players} course={course} scores={scores} onSelect={mid => setSub(`score:${mid}`)} />}

      {!editPairings && pairedPlayers.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: '0.75rem' }}>Individual scorecards</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(145px,1fr))', gap: 6 }}>
            {pairedPlayers.map(p => (
              <button key={p.id} onClick={() => setSub(`card:${p.id}`)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e8e8e4', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{p.name || p.id}</div>
                <TeamBadge tid={p.teamId} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────
// ── Day 4 — Individual competition ───────────────────────
function Day4View({ players, courses, scores, onSave }: { players: Player[]; courses: Course[]; scores: Record<string, (number | null)[]>; onSave: (key: string, holes: (number | null)[]) => Promise<void> }) {
  const [selPid, setSelPid] = useState<string | null>(null);
  const course = courses.find(c => c.day === 4)!;
  const teeData = activeTeeOf(course);

  if (selPid) {
    return <Day4Card pid={selPid} players={players} course={course} scores={scores} onSave={onSave} onBack={() => setSelPid(null)} />;
  }

  return (
    <div>
      <div style={{ ...S.card, background: '#f4f4f0', border: 'none', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{course.name || 'Course TBC'}</div>
            {teeData.name && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{teeData.name} tees · Par {teeData.par}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Slope / CR</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{teeData.slope} / {teeData.cr}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: 15, fontWeight: 500 }}>Day 4 · Individual competition</h3>
        <div style={{ fontSize: 11, color: '#888', background: '#f4f4f0', padding: '3px 10px', borderRadius: 999 }}>Format TBC on day</div>
      </div>

      <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>Select a player to enter or view their scorecard. No team points — standalone individual competition.</p>

      {(['A', 'B'] as const).map(tid => (
        <div key={tid} style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: TTXT[tid], borderLeft: `3px solid ${TCOL[tid]}`, paddingLeft: 8, marginBottom: '0.5rem', borderRadius: 0 }}>{TNAME[tid]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(145px,1fr))', gap: 6 }}>
            {players.filter(p => p.teamId === tid).map(p => {
              const key = `d4_${p.id}`;
              const holesPlayed = (scores[key] || []).filter(s => s != null).length;
              const ph = p.hi !== null && teeData.cr ? calcPH(Number(p.hi), teeData.slope, Number(teeData.cr), teeData.par) : null;
              return (
                <button key={p.id} onClick={() => setSelPid(p.id)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e8e8e4', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{p.name || p.id}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <TeamBadge tid={p.teamId} />
                    <div style={{ fontSize: 11, color: holesPlayed > 0 ? '#1D9E75' : '#bbb' }}>
                      {holesPlayed > 0 ? `${holesPlayed} holes` : ph !== null ? `PH ${ph}` : '—'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Day4Card({ pid, players, course, scores, onSave, onBack }: { pid: string; players: Player[]; course: Course; scores: Record<string, (number | null)[]>; onSave: (key: string, holes: (number | null)[]) => Promise<void>; onBack: () => void }) {
  const player = players.find(p => p.id === pid)!;
  const teeData = activeTeeOf(course);
  const ph = player?.hi !== null && teeData.cr ? calcPH(Number(player.hi), teeData.slope, Number(teeData.cr), teeData.par) : null;
  const key = `d4_${pid}`;
  const [localScores, setLocalScores] = useState<(number | null)[]>(scores[key] ? [...scores[key]] : Array(18).fill(null));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setScore = (i: number, val: string) => {
    const v = val === '' ? null : Math.max(1, parseInt(val));
    setLocalScores(prev => { const a = [...prev]; a[i] = v; return a; });
  };

  const save = async () => {
    setSaving(true);
    await onSave(key, localScores);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const raw = localScores;
  const tot = raw.reduce((a: number, s) => s != null ? a + s : a, 0);
  const netTot = ph !== null ? raw.reduce((a: number, s, i) => s != null ? a + (s as number) - shotsOnHole(ph, teeData.holes[i].si) : a, 0) : null;
  const parTot = teeData.holes.reduce((a, h) => a + h.par, 0);

  const hs: React.CSSProperties = { padding: '3px 4px', textAlign: 'center', fontSize: 11, color: '#aaa' };
  const cs: React.CSSProperties = { padding: '2px 3px', textAlign: 'center', fontSize: 12 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, padding: 0 }}>← Back</button>
        <span style={{ fontSize: 14, color: '#888' }}>Day 4 scorecard</span>
      </div>

      <div style={{ ...S.card, marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{player?.name || 'Player'}</div>
            <div style={{ marginTop: 4 }}><TeamBadge tid={player?.teamId} /></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#aaa' }}>Playing HCP</div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{ph ?? '—'}</div>
            <div style={{ fontSize: 11, color: '#bbb' }}>H.I. {player?.hi ?? '—'}</div>
          </div>
        </div>
      </div>

      <div style={{ ...S.card, padding: '0.5rem', overflowX: 'auto', marginBottom: '0.75rem' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...hs, textAlign: 'left', width: 50 }} />
              {teeData.holes.map((_, i) => <th key={i} style={{ ...hs, minWidth: 34 }}>{i + 1}</th>)}
              <th style={{ ...hs, minWidth: 40 }}>Save</th>
            </tr>
            <tr><td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>Par</td>{teeData.holes.map((h, i) => <td key={i} style={hs}>{h.par}</td>)}<td /></tr>
            <tr><td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>S.I.</td>{teeData.holes.map((h, i) => <td key={i} style={hs}>{h.si}</td>)}<td /></tr>
            {ph !== null && <tr><td style={{ ...hs, textAlign: 'left', fontWeight: 400 }}>Shots</td>{teeData.holes.map((h, i) => <td key={i} style={hs}>{shotsOnHole(ph, h.si) || ''}</td>)}<td /></tr>}
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cs, textAlign: 'left', fontWeight: 500, color: TCOL[player?.teamId], paddingLeft: 4 }}>Gross</td>
              {teeData.holes.map((hole, i) => {
                const s = raw[i]; const diff = s != null ? s - hole.par : null;
                const bg = diff == null ? 'transparent' : diff <= -2 ? '#185FA5' : diff === -1 ? '#1D9E75' : diff === 0 ? 'transparent' : diff === 1 ? '#E24B4A' : '#A32D2D';
                const fc = diff == null || diff === 0 ? '#111' : '#fff';
                return (
                  <td key={i} style={{ padding: 2 }}>
                    <input type="number" min={1} max={15} value={s ?? ''} onChange={e => setScore(i, e.target.value)}
                      style={{ width: 33, textAlign: 'center', padding: '3px 1px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, background: bg, color: fc }} />
                  </td>
                );
              })}
              <td style={{ padding: '2px 4px' }}>
                <button onClick={save} disabled={saving} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #ddd', background: saving ? '#f0f0ec' : '#111', color: saving ? '#888' : '#fff', cursor: 'pointer' }}>
                  {saving ? '…' : saved ? '✓' : 'Save'}
                </button>
              </td>
            </tr>
            {ph !== null && (
              <tr>
                <td style={{ ...cs, textAlign: 'left', color: '#888', paddingLeft: 4 }}>Net</td>
                {teeData.holes.map((h, i) => { const s = raw[i]; return <td key={i} style={{ ...cs, color: '#888' }}>{s != null ? s - shotsOnHole(ph, h.si) : ''}</td>; })}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tot > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { lbl: 'Gross', val: tot, col: '#111' },
            { lbl: 'To par', val: tot - parTot > 0 ? `+${tot - parTot}` : tot - parTot, col: tot - parTot < 0 ? TCOL.A : tot - parTot > 0 ? '#E24B4A' : '#111' },
            ...(netTot !== null ? [{ lbl: 'Net', val: netTot, col: '#111' }] : []),
          ].map(({ lbl, val, col }) => (
            <div key={lbl} style={{ flex: 1, background: '#f4f4f0', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: col }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Leaderboard({ players, courses, pairings, scores }: { players: Player[]; courses: Course[]; pairings: Pairing[]; scores: Record<string, (number | null)[]> }) {
  const nameOf = (pid: string) => players.find(p => p.id === pid)?.name || '?';
  const dayPts = (day: number) => {
    let a = 0, b = 0;
    const course = courses.find(c => c.day === day)!;
    pairings.filter(m => m.day === day).forEach(m => {
      const res = getResults(day, m, players, course, scores);
      const pts = matchPts(matchStat(res));
      a += pts.A; b += pts.B;
    });
    return { A: a, B: b };
  };
  const d: Record<number, { A: number; B: number }> = { 1: dayPts(1), 2: dayPts(2), 3: dayPts(3) };
  const totA = d[1].A + d[2].A + d[3].A;
  const totB = d[1].B + d[2].B + d[3].B;
  const lead = totA > totB ? 'A' : totB > totA ? 'B' : null;

  return (
    <div>
      <div style={{ ...S.card, padding: '1.5rem', marginBottom: '1rem', textAlign: 'center', background: lead === 'A' ? TBG.A : lead === 'B' ? TBG.B : '#f4f4f0', border: 'none' }}>
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>OVERALL STANDINGS · 20 POINTS AVAILABLE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 8, alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: 13, color: TCOL.A, fontWeight: 500, marginBottom: 4 }}>{TNAME.A}</div>
            <div style={{ fontSize: 60, fontWeight: 600, color: TCOL.A, lineHeight: 1 }}>{fmtPt(totA)}</div>
          </div>
          <div style={{ fontSize: 18, color: '#ccc' }}>–</div>
          <div>
            <div style={{ fontSize: 13, color: TCOL.B, fontWeight: 500, marginBottom: 4 }}>{TNAME.B}</div>
            <div style={{ fontSize: 60, fontWeight: 600, color: TCOL.B, lineHeight: 1 }}>{fmtPt(totB)}</div>
          </div>
        </div>
        {lead && <div style={{ fontSize: 14, fontWeight: 500, color: TTXT[lead] }}>{TNAME[lead]} lead{Math.abs(totA - totB) === 1 ? 's' : ''} by {fmtPt(Math.abs(totA - totB))} point{Math.abs(totA - totB) === 1 ? '' : 's'}</div>}
        {!lead && (totA + totB) > 0 && <div style={{ fontSize: 14, color: '#888' }}>Level</div>}
      </div>

      {[1, 2, 3].map(day => { /* team match play days only */
        const course = courses.find(c => c.day === day)!;
        return (
          <div key={day} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Day {day} · {DAY_FMT[day]}</div>
                {course.name && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{course.name}</div>}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {(['A', 'B'] as const).map(tid => (
                  <div key={tid} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: TCOL[tid] }}>{TNAME[tid]}</div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: TCOL[tid] }}>{fmtPt(d[day][tid])}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f0f0ec', paddingTop: '0.75rem' }}>
              {pairings.filter(m => m.day === day).map((m, i) => {
                const res = getResults(day, m, players, course, scores);
                const s = matchStat(res);
                const pts = matchPts(s);
                const paired = day < 3 ? !!(m.teamA?.[0] && m.teamB?.[0]) : !!(m.playerA && m.playerB);
                if (!paired) return null;
                const lA = day < 3 ? `${nameOf(m.teamA[0])} & ${nameOf(m.teamA[1])}` : nameOf(m.playerA);
                const lB = day < 3 ? `${nameOf(m.teamB[0])} & ${nameOf(m.teamB[1])}` : nameOf(m.playerB);
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: i < 4 ? '1px solid #f4f4f0' : 'none' }}>
                    <div style={{ flex: 1, fontSize: 11, color: TCOL.A }}>{lA}</div>
                    <div style={{ minWidth: 108, textAlign: 'center', fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 999, background: pts.A > pts.B ? TBG.A : pts.B > pts.A ? TBG.B : s.pl > 0 ? '#f4f4f0' : 'transparent', color: pts.A > pts.B ? TTXT.A : pts.B > pts.A ? TTXT.B : '#888' }}>
                      {s.pl === 0 ? '—' : statLabel(s)}
                    </div>
                    <div style={{ flex: 1, fontSize: 11, color: TCOL.B, textAlign: 'right' }}>{lB}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Root app ──────────────────────────────────────────────
export default function App() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [scores, setScores] = useState<Record<string, (number | null)[]>>({});
  const [nav, setNav] = useState<string>('home');

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const fetchJson = async (url: string) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${url} returned ${r.status}: ${await r.text()}`);
        return r.json();
      };
      const [setupRes, playersRes, coursesRes, pairingsRes, scoresRes] = await Promise.all([
        fetchJson('/api/setup'),
        fetchJson('/api/players'),
        fetchJson('/api/courses'),
        fetchJson('/api/pairings'),
        fetchJson('/api/scores'),
      ]);
      setSetupDone(setupRes.done);
      setPlayers(playersRes);
      setCourses(coursesRes);
      setPairings(pairingsRes);
      setScores(scoresRes);
      setReady(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveScore = async (key: string, holes: (number | null)[]) => {
    await fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, holes }) });
    setScores(prev => ({ ...prev, [key]: holes }));
  };

  if (loadError) return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ background: '#fff1f0', border: '1px solid #ffc9c9', borderRadius: 12, padding: '1.25rem' }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#c0392b', marginBottom: 8 }}>Failed to load app</div>
        <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace', background: '#f8f8f6', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{loadError}</div>
        <button onClick={loadAll} style={{ padding: '8px 18px', borderRadius: 999, background: '#111', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Retry</button>
      </div>
    </div>
  );

  if (!ready) return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem' }}>
      <Spinner />
    </div>
  );

  const navItems = [
    { k: 'home', l: 'Home' },
    ...(setupDone ? [{ k: 'day1', l: 'Day 1' }, { k: 'day2', l: 'Day 2' }, { k: 'day3', l: 'Day 3' }, { k: 'day4', l: 'Day 4' }, { k: 'scores', l: 'Scores' }] : []),
  ];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 1rem 5rem' }}>
      <div style={{ position: 'sticky', top: 0, background: 'rgba(248,248,246,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #e8e8e4', marginBottom: '1.25rem', paddingTop: '0.75rem', paddingBottom: '0.75rem', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111', flexShrink: 0 }}>Jinnah-Attlee Shield</div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            {navItems.map(({ k, l }) => (
              <button key={k} onClick={() => setNav(k)} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', border: nav === k ? 'none' : '1px solid #d0d0cc', background: nav === k ? '#111' : 'transparent', color: nav === k ? '#fff' : '#888' }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {nav === 'home' && <Home setupDone={setupDone} onSetup={() => setNav('setup')} onPlay={() => setNav('day1')} />}
      {nav === 'setup' && <Setup onBack={() => setNav('home')} onDone={() => { setSetupDone(true); loadAll(); setNav(setupDone ? 'home' : 'day1'); }} initPlayers={players} initCourses={courses} alreadyDone={setupDone} />}
      {nav === 'day1' && setupDone && <DayView day={1} players={players} courses={courses} pairings={pairings} setPairings={setPairings} scores={scores} onSave={saveScore} />}
      {nav === 'day2' && setupDone && <DayView day={2} players={players} courses={courses} pairings={pairings} setPairings={setPairings} scores={scores} onSave={saveScore} />}
      {nav === 'day3' && setupDone && <DayView day={3} players={players} courses={courses} pairings={pairings} setPairings={setPairings} scores={scores} onSave={saveScore} />}
      {nav === 'day4' && setupDone && <Day4View players={players} courses={courses} scores={scores} onSave={saveScore} />}
      {nav === 'scores' && setupDone && <Leaderboard players={players} courses={courses} pairings={pairings} scores={scores} />}
    </div>
  );
}
