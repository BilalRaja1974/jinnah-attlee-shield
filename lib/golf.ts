export interface Hole { hole: number; par: number; si: number; }
export interface Player { id: string; name: string; teamId: string; hi: number | null; }
export interface Course { day: number; name: string; tees: string; slope: number; cr: number | null; par: number; holes: Hole[]; }
export interface Pairing {
  id: string; day: number; matchIndex: number;
  teamA: string[]; teamB: string[];
  playerA: string; playerB: string;
}
export interface MatchStat { sc: number; pl: number; closed: boolean; rem: number; }

export const TNAME: Record<string, string> = { A: 'Pakistan', B: 'England' };
export const TCOL: Record<string, string> = { A: '#0F6E56', B: '#185FA5' };
export const TBG: Record<string, string> = { A: '#E1F5EE', B: '#E6F1FB' };
export const TTXT: Record<string, string> = { A: '#085041', B: '#0C447C' };
export const DAY_FMT: Record<number, string> = { 1: '2-ball scramble', 2: 'Fourball', 3: 'Singles' };

export const HISTORY = [
  { year: 2024, winner: 'Pakistan', venue: 'Belek, Turkey', tied: false },
  { year: 2025, winner: null, venue: 'Paphos, Cyprus', tied: true },
];

export function calcPH(hi: number, slope: number, cr: number, par: number): number {
  return Math.round(hi * (slope / 113) + (cr - par));
}
export function scrambHcp(a: number, b: number): number {
  return Math.round(0.35 * Math.min(a, b) + 0.15 * Math.max(a, b));
}
export function shotsOnHole(hcp: number, si: number): number {
  if (hcp <= 0) return 0;
  return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
}
export function playerPH(player: Player, course: Course): number {
  if (player.hi === null || !course.cr) return 0;
  return calcPH(Number(player.hi), course.slope, Number(course.cr), course.par);
}

function holeWinner(nA: number, nB: number): 'A' | 'B' | 'H' {
  return nA < nB ? 'A' : nB < nA ? 'B' : 'H';
}

export function getResults(
  day: number, match: Pairing, players: Player[], course: Course,
  scores: Record<string, (number | null)[]>
): (string | null)[] {
  if (!course?.cr) return Array(18).fill(null);
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
    return course.holes.map((hole, i) => {
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
    return course.holes.map((hole, i) => {
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
    return course.holes.map((hole, i) => {
      const sA = scores[`d3_${playerA}`]?.[i];
      const sB = scores[`d3_${playerB}`]?.[i];
      if (!sA || !sB) return null;
      return holeWinner(sA - shotsOnHole(stA, hole.si), sB - shotsOnHole(stB, hole.si));
    });
  }
  return Array(18).fill(null);
}

export function matchStat(res: (string | null)[]): MatchStat {
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

export function statLabel(s: MatchStat): string {
  if (s.pl === 0) return 'Not started';
  if (s.closed) return `${s.sc > 0 ? TNAME.A : TNAME.B} wins ${Math.abs(s.sc)}&${s.rem}`;
  if (s.pl === 18) return s.sc === 0 ? 'Halved' : `${s.sc > 0 ? TNAME.A : TNAME.B} wins`;
  if (s.sc === 0) return 'All square';
  return `${s.sc > 0 ? TNAME.A : TNAME.B} ${Math.abs(s.sc)} up`;
}

export function matchPts(s: MatchStat): { A: number; B: number } {
  const done = s.closed || s.pl === 18;
  if (!done) return { A: 0, B: 0 };
  if (s.sc > 0) return { A: 1, B: 0 };
  if (s.sc < 0) return { A: 0, B: 1 };
  return { A: 0.5, B: 0.5 };
}

export function fmtPt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
