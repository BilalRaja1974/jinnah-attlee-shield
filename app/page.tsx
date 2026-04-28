'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Design tokens ─────────────────────────────────────────
const C = {
  pakGreen: '#01411C',
  pakLight: '#E8F5E9',
  pakMid: '#2E7D32',
  engNavy: '#012169',
  engLight: '#E3F0FF',
  engMid: '#1565C0',
  gold: '#C8A84B',
  goldLight: '#FDF8EC',
  dark: '#111827',
  mid: '#374151',
  light: '#F9FAFB',
  border: '#E5E7EB',
  white: '#FFFFFF',
  red: '#DC2626',
  redLight: '#FEF2F2',
  green: '#16A34A',
  greenLight: '#F0FDF4',
};

const TCOL: Record<string,string> = { A: C.pakGreen, B: C.engNavy };
const TLIGHT: Record<string,string> = { A: C.pakLight, B: C.engLight };
const TMID: Record<string,string> = { A: C.pakMid, B: C.engMid };
const TNAME: Record<string,string> = { A: 'Pakistan', B: 'England' };
const DAY_FMT: Record<number,string> = { 1: '2-Ball Scramble', 2: 'Fourball', 3: 'Singles', 4: 'Individual' };
const DAY_COURSE: Record<number,string> = { 1: 'qdl_south', 2: 'san_lorenzo', 3: 'qdl_laranjal', 4: 'qdl_north' };

const SEED_HISTORY = [
  { year: 2024, winner: 'Pakistan', venue: 'Belek, Turkey', tied: false, scoreA: 0, scoreB: 0, matches: [] },
  { year: 2025, winner: null, venue: 'Paphos, Cyprus', tied: true, scoreA: 0, scoreB: 0, matches: [] },
];

// ── Interfaces ────────────────────────────────────────────
interface Hole { hole: number; par: number; si: number; }
interface TeeOption { name: string; slope: number; cr: number; par: number; holes: Hole[]; }
interface Course { day: number; name: string; activeTee: string; teeOptions: TeeOption[]; }
interface Player { id: string; name: string; teamId: string; hi: number | null; }
interface Pairing { id: string; day: number; matchIndex: number; teamA: string[]; teamB: string[]; playerA: string; playerB: string; }
interface MatchStat { sc: number; pl: number; closed: boolean; rem: number; }
interface MatchRecord { day: number; labelA: string; labelB: string; result: string; ptsA: number; ptsB: number; }
interface CompletedTournament { year: number; winner: string | null; tied: boolean; scoreA: number; scoreB: number; venue: string; matches: MatchRecord[]; }

// ── Golf logic ────────────────────────────────────────────
const DEFAULT_HOLES: Hole[] = Array.from({length:18},(_,i)=>({hole:i+1,par:[4,4,3,4,5,3,4,4,4,4,4,3,4,5,3,4,4,5][i],si:i+1}));

function activeTeeOf(course: Course): TeeOption {
  const t = course.teeOptions?.find(t => t.name === course.activeTee) || course.teeOptions?.[0];
  return t || { name:'', slope:113, cr:72, par:72, holes:DEFAULT_HOLES };
}
function calcPH(hi:number, slope:number, cr:number, par:number): number {
  return Math.round(hi*(slope/113)+(cr-par));
}
function scrambHcp(a:number, b:number): number {
  return Math.round(0.35*Math.min(a,b)+0.15*Math.max(a,b));
}
function shotsOnHole(hcp:number, si:number): number {
  if(hcp<=0) return 0;
  return Math.floor(hcp/18)+(si<=(hcp%18)?1:0);
}
function playerPH(player:Player, _course:Course): number {
  // Use raw handicap index — no slope/CR adjustment
  if(player.hi===null) return 0;
  return Math.round(Number(player.hi));
}
function holeWinner(nA:number, nB:number): 'A'|'B'|'H' {
  return nA<nB?'A':nB<nA?'B':'H';
}
function getResults(day:number, match:Pairing, players:Player[], course:Course, scores:Record<string,(number|null)[]>): (string|null)[] {
  const tee = activeTeeOf(course);
  if(!tee?.cr) return Array(18).fill(null);
  const ph=(pid:string)=>{const p=players.find(x=>x.id===pid);return(!p||p.hi===null)?0:playerPH(p,course);};
  if(day===1){
    const{teamA,teamB}=match;
    if(!teamA[0]||!teamA[1]||!teamB[0]||!teamB[1]) return Array(18).fill(null);
    const hA=scrambHcp(ph(teamA[0]),ph(teamA[1])), hB=scrambHcp(ph(teamB[0]),ph(teamB[1]));
    const stA=Math.max(0,hA-hB), stB=Math.max(0,hB-hA);
    return tee.holes.map((hole,i)=>{
      const sA=scores[`d1_${match.id}_A`]?.[i], sB=scores[`d1_${match.id}_B`]?.[i];
      if(!sA||!sB) return null;
      return holeWinner(sA-shotsOnHole(stA,hole.si), sB-shotsOnHole(stB,hole.si));
    });
  }
  if(day===2){
    const{teamA,teamB}=match;
    if(!teamA[0]||!teamA[1]||!teamB[0]||!teamB[1]) return Array(18).fill(null);
    const all=[...teamA,...teamB], phs:Record<string,number>={};
    all.forEach(pid=>phs[pid]=ph(pid));
    const mn=Math.min(...Object.values(phs));
    // 90% of difference to lowest, rounded
    const adj=(pid:string)=>Math.round(Math.max(0,phs[pid]-mn)*0.9);
    return tee.holes.map((hole,i)=>{
      const net=(pid:string)=>{const s=scores[`d2_${pid}`]?.[i];return s==null?Infinity:s-shotsOnHole(adj(pid),hole.si);};
      // Best ball point
      const bA=Math.min(net(teamA[0]),net(teamA[1])), bB=Math.min(net(teamB[0]),net(teamB[1]));
      // Aggregate point
      const aggA=net(teamA[0])+net(teamA[1]), aggB=net(teamB[0])+net(teamB[1]);
      const bbValid=isFinite(bA)&&isFinite(bB);
      const aggValid=isFinite(aggA)&&isFinite(aggB);
      if(!bbValid&&!aggValid) return null;
      // Encode: pts for A = bb_pts + agg_pts (0, 0.5, 1, 1.5, 2)
      const bbPtsA=bbValid?(bA<bB?1:bA===bB?0.5:0):0;
      const aggPtsA=aggValid?(aggA<aggB?1:aggA===aggB?0.5:0):0;
      const totalA=bbPtsA+aggPtsA, totalB=(bbValid?1:0)+(aggValid?1:0)-totalA;
      // Encode as special string for Day 2: "ptsA:ptsB"
      return `${totalA}:${totalB}`;
    });
  }
  if(day===3){
    const{playerA,playerB}=match;
    if(!playerA||!playerB) return Array(18).fill(null);
    const phA=ph(playerA), phB=ph(playerB);
    const stA=Math.max(0,phA-phB), stB=Math.max(0,phB-phA);
    return tee.holes.map((hole,i)=>{
      const sA=scores[`d3_${playerA}`]?.[i], sB=scores[`d3_${playerB}`]?.[i];
      if(!sA||!sB) return null;
      return holeWinner(sA-shotsOnHole(stA,hole.si), sB-shotsOnHole(stB,hole.si));
    });
  }
  return Array(18).fill(null);
}
// For Day 2: extract running points from encoded "ptsA:ptsB" results
function d2RunningPts(res:(string|null)[]): {ptsA:number;ptsB:number;pl:number} {
  let ptsA=0,ptsB=0,pl=0;
  for(let i=0;i<18;i++){
    if(res[i]==null) break; pl++;
    const parts=res[i]!.split(':');
    ptsA+=parseFloat(parts[0]||'0');
    ptsB+=parseFloat(parts[1]||'0');
  }
  return{ptsA,ptsB,pl};
}
function isD2Result(res:(string|null)[]): boolean {
  return res.some(r=>r!=null&&r.includes(':'));
}
function matchStat(res:(string|null)[]): MatchStat {
  if(isD2Result(res)){
    // For Day 2, convert running pts to a comparable sc (ptsA - ptsB scaled)
    const{ptsA,ptsB,pl}=d2RunningPts(res);
    const sc=ptsA-ptsB; // can be fractional
    return{sc,pl,closed:false,rem:18-pl};
  }
  let sc=0,pl=0;
  for(let i=0;i<18;i++){
    if(res[i]==null) break; pl++;
    if(res[i]==='A') sc++; else if(res[i]==='B') sc--;
    if(Math.abs(sc)>18-pl) return{sc,pl,closed:true,rem:18-pl};
  }
  return{sc,pl,closed:false,rem:18-pl};
}
function statLabel(s:MatchStat): string {
  if(s.pl===0) return 'Not started';
  if(s.closed) return`${s.sc>0?TNAME.A:TNAME.B} wins ${Math.abs(s.sc)}&${s.rem}`;
  if(s.pl===18) return s.sc===0?'Tied':`${s.sc>0?TNAME.A:TNAME.B} leads`;
  if(s.sc===0) return 'Level';
  return`${s.sc>0?TNAME.A:TNAME.B} leads`;
}
function matchPts(s:MatchStat): {A:number;B:number} {
  const done=s.closed||s.pl===18;
  if(!done) return{A:0,B:0};
  if(s.sc>0) return{A:1,B:0};
  if(s.sc<0) return{A:0,B:1};
  return{A:0.5,B:0.5};
}
// Day 2 total points (out of max 2 per hole × 18 = 36 total)
function d2TotalPts(res:(string|null)[]): {A:number;B:number} {
  const{ptsA,ptsB}=d2RunningPts(res);
  return{A:ptsA,B:ptsB};
}
function fmtPt(n:number): string { return n%1===0?String(n):n.toFixed(1); }

// ── Course library ────────────────────────────────────────
const SL_HOLES: Hole[] = [
  {hole:1,par:5,si:7},{hole:2,par:3,si:15},{hole:3,par:4,si:13},{hole:4,par:4,si:9},
  {hole:5,par:3,si:17},{hole:6,par:4,si:1},{hole:7,par:4,si:11},{hole:8,par:5,si:3},
  {hole:9,par:4,si:5},{hole:10,par:5,si:12},{hole:11,par:4,si:16},{hole:12,par:4,si:2},
  {hole:13,par:4,si:8},{hole:14,par:3,si:18},{hole:15,par:5,si:6},{hole:16,par:3,si:14},
  {hole:17,par:4,si:10},{hole:18,par:4,si:4}
];
const QDL_N_HOLES: Hole[] = [
  {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:5,si:9},{hole:4,par:4,si:1},
  {hole:5,par:4,si:5},{hole:6,par:4,si:13},{hole:7,par:5,si:7},{hole:8,par:3,si:17},
  {hole:9,par:4,si:3},{hole:10,par:4,si:12},{hole:11,par:5,si:10},{hole:12,par:4,si:4},
  {hole:13,par:4,si:6},{hole:14,par:3,si:16},{hole:15,par:4,si:2},{hole:16,par:3,si:18},
  {hole:17,par:4,si:14},{hole:18,par:5,si:8}
];
const QDL_S_HOLES: Hole[] = [
  {hole:1,par:4,si:13},{hole:2,par:5,si:7},{hole:3,par:4,si:5},{hole:4,par:3,si:17},
  {hole:5,par:5,si:1},{hole:6,par:4,si:9},{hole:7,par:3,si:15},{hole:8,par:4,si:3},
  {hole:9,par:4,si:11},{hole:10,par:4,si:6},{hole:11,par:3,si:16},{hole:12,par:5,si:12},
  {hole:13,par:4,si:18},{hole:14,par:4,si:2},{hole:15,par:3,si:8},{hole:16,par:4,si:14},
  {hole:17,par:5,si:4},{hole:18,par:4,si:10}
];
const QDL_L_HOLES: Hole[] = [
  {hole:1,par:4,si:15},{hole:2,par:3,si:11},{hole:3,par:4,si:5},{hole:4,par:4,si:9},
  {hole:5,par:4,si:3},{hole:6,par:3,si:17},{hole:7,par:5,si:1},{hole:8,par:3,si:13},
  {hole:9,par:5,si:7},{hole:10,par:4,si:6},{hole:11,par:4,si:18},{hole:12,par:3,si:10},
  {hole:13,par:5,si:16},{hole:14,par:4,si:4},{hole:15,par:5,si:8},{hole:16,par:3,si:2},
  {hole:17,par:4,si:14},{hole:18,par:5,si:12}
];
const COURSE_LIBRARY: Record<string,{name:string;tees:TeeOption[]}> = {
  san_lorenzo: { name:'San Lorenzo Golf Course', tees:[
    {name:'Yellow',slope:134,cr:70.7,par:72,holes:SL_HOLES},
    {name:'White',slope:136,cr:73.0,par:72,holes:SL_HOLES},
  ]},
  qdl_north: { name:'Quinta do Lago — North', tees:[
    {name:'Yellow',slope:136,cr:73.1,par:72,holes:QDL_N_HOLES},
    {name:'White',slope:131,cr:72.0,par:72,holes:QDL_N_HOLES},
  ]},
  qdl_south: { name:'Quinta do Lago — South', tees:[
    {name:'Yellow',slope:133,cr:71.0,par:72,holes:QDL_S_HOLES},
    {name:'White',slope:127,cr:73.5,par:72,holes:QDL_S_HOLES},
  ]},
  qdl_laranjal: { name:'Quinta do Lago — Laranjal', tees:[
    {name:'Yellow',slope:130,cr:71.1,par:72,holes:QDL_L_HOLES},
    {name:'White',slope:136,cr:73.2,par:72,holes:QDL_L_HOLES},
    {name:'Black',slope:140,cr:75.4,par:72,holes:QDL_L_HOLES},
  ]},
};

// ── Shared UI primitives ──────────────────────────────────
const card: React.CSSProperties = {
  background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
  padding: '1rem', marginBottom: '0.75rem',
};
const inp: React.CSSProperties = {
  width:'100%', padding:'10px 12px', border:`1.5px solid ${C.border}`,
  borderRadius:10, fontSize:15, color:C.dark, background:C.white,
  outline:'none', boxSizing:'border-box' as const,
};
const lbl: React.CSSProperties = { fontSize:12, color:C.mid, marginBottom:4, display:'block', fontWeight:500 };

function Btn({label,primary,small,danger,onClick,full,disabled,style:sx={}}: {
  label:string; primary?:boolean; small?:boolean; danger?:boolean;
  onClick?:()=>void; full?:boolean; disabled?:boolean; style?:React.CSSProperties;
}) {
  const bg = primary ? C.dark : danger ? C.red : 'transparent';
  const col = primary || danger ? C.white : C.dark;
  const border = primary || danger ? 'none' : `1.5px solid ${C.border}`;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small?'7px 14px':'11px 20px', borderRadius:10, border,
      background:bg, color:col, fontSize:small?13:14, cursor:disabled?'not-allowed':'pointer',
      fontWeight:500, width:full?'100%':'auto', opacity:disabled?0.55:1,
      transition:'opacity 0.15s', ...sx
    }}>{label}</button>
  );
}

function TeamPill({tid,size='sm'}:{tid:string;size?:'sm'|'md'}) {
  return (
    <span style={{
      fontSize:size==='md'?13:11, fontWeight:600, color:TCOL[tid],
      background:TLIGHT[tid], padding:size==='md'?'3px 10px':'2px 8px',
      borderRadius:999, border:`1px solid ${TMID[tid]}33`,
    }}>{TNAME[tid]}</span>
  );
}

function StatusBadge({done,pl,closed}:{done:boolean;pl:number;closed:boolean}) {
  if(pl===0) return <span style={{fontSize:11,color:C.mid,background:C.light,padding:'2px 8px',borderRadius:999}}>Not started</span>;
  if(done||closed) return <span style={{fontSize:11,color:C.green,background:C.greenLight,padding:'2px 8px',borderRadius:999,fontWeight:500}}>Complete</span>;
  return <span style={{fontSize:11,color:C.gold,background:C.goldLight,padding:'2px 8px',borderRadius:999,fontWeight:500}}>Thru {pl}</span>;
}

function SaveIndicator({state}:{state:'idle'|'saving'|'saved'|'error'}) {
  if(state==='idle') return null;
  const map = {saving:{c:C.mid,t:'Saving…'}, saved:{c:C.green,t:'Saved ✓'}, error:{c:C.red,t:'Save failed'}};
  const {c,t} = map[state as keyof typeof map];
  return <span style={{fontSize:11,color:c,fontWeight:500,transition:'all 0.3s'}}>{t}</span>;
}

// ── Shield logo ───────────────────────────────────────────
const SHIELD_IMG = "data:image/jpeg;base64,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";
function Shield({size=64}:{size?:number}) {
  return (
    <img src={SHIELD_IMG} alt="Jinnah-Attlee Shield"
      style={{width:size, height:size, objectFit:'cover', borderRadius:'50%', display:'block'}}/>
  );
}

// ── Home ──────────────────────────────────────────────────
function Home({setupDone,activeYear,allYears,completedTournaments,liveScore,onStartYear,onSwitchYear,onSetup,onPlay}: {
  setupDone:boolean; activeYear:number|null; allYears:number[];
  completedTournaments:CompletedTournament[];
  liveScore:{A:number;B:number;holesPlayed:number}|null;
  onStartYear:(y:number)=>void; onSwitchYear:(y:number)=>void;
  onSetup:()=>void; onPlay:()=>void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const pWins = completedTournaments.filter(r=>!r.tied&&r.winner==='Pakistan').length;
  const eWins = completedTournaments.filter(r=>!r.tied&&r.winner==='England').length;
  const ties = completedTournaments.filter(r=>r.tied).length;

  return (
    <div>
      {/* Hero */}
      <div style={{textAlign:'center', padding:'2.5rem 1rem 2rem', background:`linear-gradient(160deg, ${C.dark} 0%, #1a2744 100%)`, margin:'-1rem -1rem 1.25rem', borderRadius:'0 0 24px 24px'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:'1.25rem'}}><Shield size={72}/></div>
        <div style={{fontSize:11,letterSpacing:'0.15em',color:C.gold,marginBottom:6,textTransform:'uppercase',fontWeight:500}}>The Annual</div>
        <h1 style={{fontSize:28,fontWeight:700,margin:'0 0 6px',lineHeight:1.1,color:C.white}}>Jinnah-Attlee<br/>Shield</h1>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginTop:12}}>
          <span style={{fontSize:15,fontWeight:700,color:C.pakGreen,background:C.pakLight,padding:'4px 14px',borderRadius:999}}>{TNAME.A}</span>
          <span style={{fontSize:13,color:C.gold}}>vs</span>
          <span style={{fontSize:15,fontWeight:700,color:'#4A90D9',background:'#E3F0FF',padding:'4px 14px',borderRadius:999}}>{TNAME.B}</span>
        </div>
        {activeYear && <div style={{fontSize:12,color:'#4B5563',marginTop:12}}>{activeYear} · 3-day team match play · 20 points</div>}
      </div>

      {/* Series record */}
      <div style={{...card, padding:'1rem'}}>
        <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.08em',marginBottom:'0.75rem'}}>SERIES RECORD</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
          {[
            {tid:'A',val:pWins,lbl:TNAME.A},
            {tid:null,val:ties,lbl:'Tied'},
            {tid:'B',val:eWins,lbl:TNAME.B},
          ].map(({tid,val,lbl})=>(
            <div key={lbl} style={{background:tid?TLIGHT[tid as string]:'#F3F4F6',borderRadius:10,padding:'0.75rem',textAlign:'center',border:`1px solid ${tid?TMID[tid as string]+'33':C.border}`}}>
              <div style={{fontSize:34,fontWeight:700,color:tid?TCOL[tid as string]:C.mid,lineHeight:1}}>{val}</div>
              <div style={{fontSize:11,color:tid?TMID[tid as string]:C.mid,marginTop:4,fontWeight:500}}>{lbl}</div>
            </div>
          ))}
        </div>

        <button onClick={()=>setShowHistory(!showHistory)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',background:'none',border:'none',cursor:'pointer',padding:'4px 0',color:C.mid,fontSize:12,fontWeight:500}}>
          <span>Previous editions ({completedTournaments.length})</span>
          <span>{showHistory?'▲':'▼'}</span>
        </button>

        {showHistory && (
          <div style={{marginTop:8,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
            {completedTournaments.map((r,i)=>(
              <div key={r.year} style={{padding:'8px 0',borderBottom:i<completedTournaments.length-1?`1px solid ${C.border}`:'none'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:r.matches?.length>0?6:0}}>
                  <div>
                    <span style={{fontSize:14,fontWeight:700,color:C.dark,marginRight:8}}>{r.year}</span>
                    <span style={{fontSize:12,color:C.mid}}>{r.venue||'—'}</span>
                  </div>
                  <span style={{fontSize:12,fontWeight:600,padding:'3px 10px',borderRadius:999,
                    background:r.tied?'#F3F4F6':r.winner==='Pakistan'?C.pakLight:C.engLight,
                    color:r.tied?C.mid:r.winner==='Pakistan'?C.pakGreen:C.engNavy}}>
                    {r.tied?'Tied':`${r.winner} won`}
                    {!r.tied&&r.scoreA>0?` · ${r.winner==='Pakistan'?r.scoreA:r.scoreB}–${r.winner==='Pakistan'?r.scoreB:r.scoreA}`:''}
                  </span>
                </div>
                {r.matches?.length>0&&(
                  <div style={{marginLeft:4,display:'flex',flexDirection:'column',gap:3}}>
                    {r.matches.map((m,mi)=>(
                      <div key={mi} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                        <div style={{flex:1,color:TCOL.A,fontWeight:500}}>{m.labelA}</div>
                        <div style={{minWidth:90,textAlign:'center',fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:999,
                          background:m.ptsA>m.ptsB?C.pakLight:m.ptsB>m.ptsA?C.engLight:'#F3F4F6',
                          color:m.ptsA>m.ptsB?C.pakGreen:m.ptsB>m.ptsA?C.engNavy:C.mid}}>{m.result}</div>
                        <div style={{flex:1,color:TCOL.B,textAlign:'right',fontWeight:500}}>{m.labelB}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {completedTournaments.length===0&&<div style={{fontSize:13,color:C.mid,textAlign:'center',padding:'0.5rem 0'}}>No completed editions yet</div>}
          </div>
        )}
      </div>

      {/* CTA */}
      {/* Live score widget */}
      {activeYear&&setupDone&&liveScore&&(
        <div style={{...card,background:C.dark,border:'none',marginBottom:'0.75rem',padding:'1rem 1.25rem'}}>
          <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:'0.1em',marginBottom:10}}>LIVE · {activeYear}</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16,fontWeight:800,color:'#4ADE80'}}>{TNAME.A}</span>
              <span style={{fontSize:28,fontWeight:800,color:'#4ADE80'}}>{fmtPt(liveScore.A)}</span>
            </div>
            <span style={{fontSize:20,fontWeight:400,color:'rgba(255,255,255,0.3)'}}>–</span>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:28,fontWeight:800,color:'#60A5FA'}}>{fmtPt(liveScore.B)}</span>
              <span style={{fontSize:16,fontWeight:800,color:'#60A5FA'}}>{TNAME.B}</span>
            </div>
          </div>
          {liveScore.holesPlayed>0&&<div style={{textAlign:'center',fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:6}}>{liveScore.holesPlayed} holes played today</div>}
        </div>
      )}

      {activeYear&&setupDone&&(
        <button onClick={onPlay} style={{width:'100%',padding:'16px',borderRadius:12,background:C.dark,color:C.white,fontSize:16,fontWeight:700,border:'none',cursor:'pointer',marginBottom:8,letterSpacing:'0.02em'}}>
          Go to matches →
        </button>
      )}
      {activeYear&&!setupDone&&(
        <Btn label={`Set up ${activeYear} tournament →`} primary full onClick={onSetup}/>
      )}
      {!allYears.includes(2026)&&(
        <Btn label="Start 2026 tournament" primary={!activeYear} full onClick={()=>onStartYear(2026)} style={{marginBottom:8}}/>
      )}
      {allYears.filter(y=>y!==activeYear).map(y=>(
        <Btn key={y} label={`Switch to ${y}`} full onClick={()=>onSwitchYear(y)} style={{marginBottom:8}}/>
      ))}
    </div>
  );
}

// ── Today (match list for current day) ───────────────────
function Today({day,players,courses,pairings,scores,onSelectMatch,onSelectCard}: {
  day:number; players:Player[]; courses:Course[]; pairings:Pairing[];
  scores:Record<string,(number|null)[]>; onSelectMatch:(mid:string)=>void; onSelectCard:(pid:string)=>void;
}) {
  const course = courses.find(c=>c.day===day)!;
  const tee = activeTeeOf(course);
  const dm = pairings.filter(p=>p.day===day);
  const nameOf=(pid:string)=>players.find(p=>p.id===pid)?.name||'—';

  const inPairings=(pid:string)=>day<3
    ?dm.some(m=>(m.teamA||[]).includes(pid)||(m.teamB||[]).includes(pid))
    :dm.some(m=>m.playerA===pid||m.playerB===pid);
  const pairedPlayers=players.filter(p=>inPairings(p.id));

  return (
    <div>
      {/* Course header */}
      <div style={{background:C.dark,borderRadius:12,padding:'1rem',marginBottom:'1rem',color:C.white}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:11,color:C.gold,fontWeight:600,letterSpacing:'0.08em',marginBottom:4}}>DAY {day} · {DAY_FMT[day].toUpperCase()}</div>
            <div style={{fontSize:17,fontWeight:700}}>{course.name||'Course TBC'}</div>
            {tee.name&&<div style={{fontSize:12,color:'#4B5563',marginTop:2}}>{tee.name} tees · Par {tee.par}</div>}
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:10,color:'#4B5563'}}>Slope / CR</div>
            <div style={{fontSize:14,fontWeight:600,color:C.gold}}>{tee.slope} / {tee.cr||'—'}</div>
          </div>
        </div>
      </div>

      {/* Matches */}
      <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.08em',marginBottom:'0.5rem'}}>MATCHES</div>
      {dm.map((m,i)=>{
        const res=getResults(day,m,players,course,scores);
        const s=matchStat(res);
        const pts=matchPts(s);
        const done=s.closed||s.pl===18;
        const paired=day<3?!!(m.teamA?.[0]&&m.teamB?.[0]):!!(m.playerA&&m.playerB);
        const hiOf=(pid:string)=>{const p=players.find(x=>x.id===pid);return p?.hi!=null?Math.round(Number(p.hi)):0;};
        const lA=day===1
          ?`${nameOf(m.teamA?.[0])} & ${nameOf(m.teamA?.[1])} (${scrambHcp(hiOf(m.teamA?.[0]),hiOf(m.teamA?.[1]))})`
          :day<3?`${nameOf(m.teamA?.[0])} & ${nameOf(m.teamA?.[1])}`:nameOf(m.playerA);
        const lB=day===1
          ?`${nameOf(m.teamB?.[0])} & ${nameOf(m.teamB?.[1])} (${scrambHcp(hiOf(m.teamB?.[0]),hiOf(m.teamB?.[1]))})`
          :day<3?`${nameOf(m.teamB?.[0])} & ${nameOf(m.teamB?.[1])}`:nameOf(m.playerB);
        const winnerTid = done && s.sc!==0 ? (s.sc>0?'A':'B') : null;

        return (
          <div key={m.id} onClick={()=>paired&&onSelectMatch(m.id)}
            style={{...card, cursor:paired?'pointer':'default', padding:'0.875rem',
              borderLeft:done?`4px solid ${winnerTid?TCOL[winnerTid]:C.border}`:`4px solid ${C.border}`,
              background:done&&winnerTid?TLIGHT[winnerTid]:C.white}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:11,fontWeight:600,color:C.mid}}>MATCH {i+1}</span>
              <StatusBadge done={done} pl={s.pl} closed={s.closed}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'center'}}>
              <div>
                <TeamPill tid="A"/>
                <div style={{fontSize:13,fontWeight:500,color:C.dark,marginTop:4}}>{lA}</div>
              </div>
              <div style={{textAlign:'center',minWidth:60}}>
                {s.pl===0
                  ? <span style={{fontSize:12,color:C.mid,fontWeight:500}}>vs</span>
                  : <>
                      <div style={{fontSize:22,fontWeight:700,color:winnerTid?TCOL[winnerTid]:C.mid}}>
                        {s.sc===0?'AS':`${Math.abs(s.sc)}${s.closed?'&'+s.rem:''}`}
                      </div>
                      {done&&<div style={{fontSize:11,color:C.mid}}>{fmtPt(pts.A)} – {fmtPt(pts.B)}</div>}
                    </>
                }
              </div>
              <div style={{textAlign:'right'}}>
                <TeamPill tid="B"/>
                <div style={{fontSize:13,fontWeight:500,color:C.dark,marginTop:4,textAlign:'right'}}>{lB}</div>
              </div>
            </div>
            {!paired&&<div style={{fontSize:11,color:C.mid,marginTop:6,textAlign:'center'}}>Pairings not set — go to More → Set matches</div>}
          </div>
        );
      })}

      {/* Individual scorecards — not shown for Day 1 scramble */}
      {day>1&&pairedPlayers.length>0&&(
        <div style={{marginTop:'1.25rem'}}>
          <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.08em',marginBottom:'0.5rem'}}>INDIVIDUAL SCORECARDS</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8}}>
            {pairedPlayers.map(p=>(
              <button key={p.id} onClick={()=>onSelectCard(p.id)}
                style={{padding:'10px 12px',borderRadius:10,border:`1.5px solid ${C.border}`,background:C.white,cursor:'pointer',textAlign:'left',transition:'border-color 0.15s'}}>
                <div style={{fontSize:13,fontWeight:600,color:C.dark,marginBottom:4}}>{p.name||p.id}</div>
                <TeamPill tid={p.teamId}/>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Auto-save hook ────────────────────────────────────────
function useAutoSave(onSave:(key:string,holes:(number|null)[])=>Promise<void>, delay=1500) {
  const pending = useRef<Record<string,ReturnType<typeof setTimeout>>>({});
  const [saveState, setSaveState] = useState<Record<string,'idle'|'saving'|'saved'|'error'>>({});

  const trigger = useCallback((key:string, holes:(number|null)[]) => {
    if(pending.current[key]) clearTimeout(pending.current[key]);
    setSaveState(s=>({...s,[key]:'saving'}));
    pending.current[key] = setTimeout(async()=>{
      try {
        await onSave(key, holes);
        setSaveState(s=>({...s,[key]:'saved'}));
        setTimeout(()=>setSaveState(s=>({...s,[key]:'idle'})), 2000);
      } catch {
        setSaveState(s=>({...s,[key]:'error'}));
      }
    }, delay);
  }, [onSave, delay]);

  return { trigger, saveState };
}

// ── Score entry (vertical, auto-save) ────────────────────
function ScoreEntry({day,matchId,pairings,players,course,scores,onSave,onBack}: {
  day:number; matchId:string; pairings:Pairing[]; players:Player[]; course:Course;
  scores:Record<string,(number|null)[]>; onSave:(key:string,holes:(number|null)[])=>Promise<void>; onBack:()=>void;
}) {
  const match = pairings.find(m=>m.id===matchId)!;
  const tee = activeTeeOf(course);
  const nameOf=(pid:string)=>players.find(p=>p.id===pid)?.name||'?';
  const ph=(pid:string)=>{const p=players.find(x=>x.id===pid);return(!p||p.hi===null)?0:playerPH(p,course);};
  const {trigger, saveState} = useAutoSave(onSave);
  const [showRules, setShowRules] = useState(false);

  const initials=(pid:string)=>{const n=nameOf(pid);return n.split(' ').map((w:string)=>w[0]?.toUpperCase()||'').join('').slice(0,3)||'?';};
  interface Row { key:string; label:string; initials:string; teamId:string; hcp:number; adjHcp:number; shots:number; pid:string; }
  const buildRows=():Row[]=>{
    if(day===1){
      const{teamA,teamB}=match;
      const hA=scrambHcp(ph(teamA[0]),ph(teamA[1])), hB=scrambHcp(ph(teamB[0]),ph(teamB[1]));
      return[
        {key:`d1_${matchId}_A`,label:`${nameOf(teamA[0])} & ${nameOf(teamA[1])}`,initials:'PK',teamId:'A',hcp:hA,adjHcp:hA,shots:Math.max(0,hA-hB),pid:teamA[0]},
        {key:`d1_${matchId}_B`,label:`${nameOf(teamB[0])} & ${nameOf(teamB[1])}`,initials:'EN',teamId:'B',hcp:hB,adjHcp:hB,shots:Math.max(0,hB-hA),pid:teamB[0]},
      ];
    }
    if(day===2){
      const{teamA,teamB}=match; const all=[...teamA,...teamB];
      const phs:Record<string,number>={}; all.forEach(pid=>phs[pid]=ph(pid));
      const mn=Math.min(...Object.values(phs));
      const adj=(pid:string)=>Math.round(Math.max(0,phs[pid]-mn)*0.9);
      return[
        {key:`d2_${teamA[0]}`,label:nameOf(teamA[0]),initials:initials(teamA[0]),teamId:'A',hcp:phs[teamA[0]],adjHcp:adj(teamA[0]),shots:adj(teamA[0]),pid:teamA[0]},
        {key:`d2_${teamA[1]}`,label:nameOf(teamA[1]),initials:initials(teamA[1]),teamId:'A',hcp:phs[teamA[1]],adjHcp:adj(teamA[1]),shots:adj(teamA[1]),pid:teamA[1]},
        {key:`d2_${teamB[0]}`,label:nameOf(teamB[0]),initials:initials(teamB[0]),teamId:'B',hcp:phs[teamB[0]],adjHcp:adj(teamB[0]),shots:adj(teamB[0]),pid:teamB[0]},
        {key:`d2_${teamB[1]}`,label:nameOf(teamB[1]),initials:initials(teamB[1]),teamId:'B',hcp:phs[teamB[1]],adjHcp:adj(teamB[1]),shots:adj(teamB[1]),pid:teamB[1]},
      ];
    }
    const{playerA,playerB}=match; const phA=ph(playerA),phB=ph(playerB);
    const mn3=Math.min(phA,phB);
    return[
      {key:`d3_${playerA}`,label:nameOf(playerA),initials:initials(playerA),teamId:'A',hcp:phA,adjHcp:Math.max(0,phA-mn3),shots:Math.max(0,phA-phB),pid:playerA},
      {key:`d3_${playerB}`,label:nameOf(playerB),initials:initials(playerB),teamId:'B',hcp:phB,adjHcp:Math.max(0,phB-mn3),shots:Math.max(0,phB-phA),pid:playerB},
    ];
  };

  const rows=buildRows();
  // Day 1 shot counters: drives and seconds per player
  const [driveCounts, setDriveCounts]=useState<Record<string,number>>({});
  const [secondCounts, setSecondCounts]=useState<Record<string,number>>({});
  const bumpDrive=(pid:string)=>setDriveCounts(p=>({...p,[pid]:(p[pid]||0)+1}));
  const bumpSecond=(pid:string)=>setSecondCounts(p=>({...p,[pid]:(p[pid]||0)+1}));
  const resetCounts=()=>{setDriveCounts({});setSecondCounts({});};

  const [localScores, setLocalScores]=useState<Record<string,(number|null)[]>>(()=>{
    const init:Record<string,(number|null)[]>={};
    rows.forEach(r=>{init[r.key]=scores[r.key]?[...scores[r.key]]:Array(18).fill(null);});
    return init;
  });

  const setScore=(key:string, hi:number, val:string)=>{
    const v=val===''?null:Math.max(1,parseInt(val));
    setLocalScores(prev=>{
      const arr=prev[key]?[...prev[key]]:Array(18).fill(null);
      arr[hi]=v;
      const next={...prev,[key]:arr};
      trigger(key, arr);
      return next;
    });
  };

  const mergedScores={...scores,...localScores};
  const res=getResults(day,match,players,course,mergedScores);
  const s=matchStat(res);
  const pts=matchPts(s);
  const done=s.closed||s.pl===18;

  // Label: PK1/PK2 for Pakistan, EN1/EN2 for England (or PK/EN for singles/scramble)
  const pairLabel=(ri:number)=>{
    if(rows.length<=2) return ri===0?'PK':'EN';
    if(ri===0) return 'PK1'; if(ri===1) return 'PK2';
    if(ri===2) return 'EN1'; return 'EN2';
  };

  return (
    <div>
      {/* Back + title */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:C.mid,fontSize:14,padding:0,display:'flex',alignItems:'center',gap:4}}>
          ← Back
        </button>
        <span style={{fontSize:13,color:C.mid}}>Score entry · {DAY_FMT[day]}</span>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {rows.map(r=><SaveIndicator key={r.key} state={saveState[r.key]||'idle'}/>)}
        </div>
      </div>

      {/* Match status banner */}
      <div style={{background:C.dark,borderRadius:12,padding:'1rem 1.25rem',marginBottom:'0.75rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:s.pl>0?10:0}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.white}}>{statLabel(s)}</div>
            {s.pl>0&&<div style={{fontSize:11,color:C.gold,marginTop:2}}>{s.pl} holes played</div>}
          </div>
          {s.pl>0&&(
            <div style={{display:'flex',gap:16}}>
              {(['A','B'] as const).map(tid=>(
                <div key={tid} style={{textAlign:'center'}}>
                  <div style={{fontSize:10,color:tid==='A'?'#4ADE80':'#60A5FA',fontWeight:700}}>{TNAME[tid]}</div>
                  <div style={{fontSize:22,fontWeight:800,color:tid==='A'?'#4ADE80':'#60A5FA'}}>
                    {day===2?fmtPt(d2TotalPts(res)[tid]):fmtPt(pts[tid])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Match details: handicaps */}
        <div style={{borderTop:s.pl>0?`1px solid rgba(255,255,255,0.1)`:'none',paddingTop:s.pl>0?8:0}}>
          {day===1&&(()=>{const r0=rows[0],r1=rows[1];return(
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.85)'}}>
                <span style={{color:'#4ADE80',fontWeight:700}}>PK</span> Team HCP: <span style={{color:C.white,fontWeight:700}}>{r0.hcp}</span>
                {r0.shots>0&&<span style={{color:C.gold}}> (gets {r0.shots} shots)</span>}
              </div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.85)'}}>
                <span style={{color:'#60A5FA',fontWeight:700}}>EN</span> Team HCP: <span style={{color:C.white,fontWeight:700}}>{r1.hcp}</span>
                {r1.shots>0&&<span style={{color:C.gold}}> (gets {r1.shots} shots)</span>}
              </div>
            </div>
          );})()}
          {day===2&&(()=>{const mn=Math.min(...rows.map(r=>r.hcp));return(
            <div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.8)',marginBottom:4}}>Adjusted handicaps (90% of diff to lowest HCP {mn}):</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {rows.map((row,ri)=>(
                  <div key={ri} style={{fontSize:11}}>
                    <span style={{color:row.teamId==='A'?'#4ADE80':'#60A5FA',fontWeight:700}}>{row.initials}</span>
                    <span style={{color:'rgba(255,255,255,0.8)'}}> HCP {row.hcp} → </span>
                    <span style={{color:C.white,fontWeight:700}}>{row.adjHcp}</span>
                  </div>
                ))}
              </div>
            </div>
          );})()}
          {day===3&&(()=>{const mn=Math.min(...rows.map(r=>r.hcp));return(
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              {rows.map((row,ri)=>(
                <div key={ri} style={{fontSize:11}}>
                  <span style={{color:row.teamId==='A'?'#4ADE80':'#60A5FA',fontWeight:700}}>{row.initials}</span>
                  <span style={{color:'rgba(255,255,255,0.8)'}}> HCP {row.hcp} → net </span>
                  <span style={{color:C.white,fontWeight:700}}>{row.adjHcp===0?'scratch':`gets ${row.adjHcp}`}</span>
                </div>
              ))}
            </div>
          );})()}
        </div>
      </div>

      {/* Rules toggle */}
      <button onClick={()=>setShowRules(!showRules)} style={{display:'flex',alignItems:'center',gap:6,width:'100%',background:C.goldLight,border:`1px solid ${C.gold}44`,borderRadius:8,cursor:'pointer',padding:'8px 12px',fontSize:12,color:C.dark,marginBottom:'0.75rem',fontWeight:500}}>
        <span style={{color:C.gold}}>ⓘ</span>
        <span>Format & handicap rules</span>
        <span style={{marginLeft:'auto',color:C.gold}}>{showRules?'▲':'▼'}</span>
      </button>
      {showRules&&(
        <div style={{...card,fontSize:13,color:C.dark,lineHeight:1.7,marginBottom:'0.75rem'}}>
          {day===1&&<>
            <div style={{fontWeight:700,marginBottom:6,fontSize:14}}>Texas Scramble — 2-ball team match</div>
            <div style={{marginBottom:8,color:C.mid}}>Both players tee off on every hole. The best drive is selected and both play their next shot from that spot. Continue until holed. One team score per hole.</div>
            <div style={{fontWeight:600,marginBottom:4,color:C.dark}}>Shot requirements (per player, per round)</div>
            <div style={{marginBottom:8,color:C.mid}}>Each player must contribute a minimum of <strong>7 tee shots</strong> and <strong>5 second shots</strong>. Par 3 tee shots count toward the 7 drive requirement. Par 3 second shots do not count toward the 5 second shot requirement.</div>
            <div style={{fontWeight:600,marginBottom:4,color:C.dark}}>Team handicap</div>
            <div style={{color:C.mid}}>35% × lower HCP + 15% × higher HCP, rounded. Higher handicap team receives the difference in shots, allocated by stroke index.</div>
          </>}
          {day===2&&<>
            <div style={{fontWeight:700,marginBottom:6,fontSize:14}}>Fourball — Best Ball &amp; Aggregate</div>
            <div style={{marginBottom:8,color:C.mid}}>All four players play their own ball. <strong>2 points available per hole:</strong></div>
            <div style={{marginBottom:4,color:C.mid}}>• <strong>Point 1 (Best Ball):</strong> Lower net score from each pair wins 1 point. Halved if equal.</div>
            <div style={{marginBottom:8,color:C.mid}}>• <strong>Point 2 (Aggregate):</strong> Lower combined net score from each pair wins 1 point. Halved if equal.</div>
            <div style={{fontWeight:600,marginBottom:4,color:C.dark}}>Handicap</div>
            <div style={{color:C.mid}}>Lowest handicap in the 4-ball plays off scratch. Others receive 90% of their difference to that player, rounded.</div>
          </>}
          {day===3&&<>
            <div style={{fontWeight:700,marginBottom:6,fontSize:14}}>Singles Match Play</div>
            <div style={{marginBottom:8,color:C.mid}}>Each player plays their own ball. Lower net score wins the hole. The player more holes up than holes remaining wins the match.</div>
            <div style={{fontWeight:600,marginBottom:4,color:C.dark}}>Handicap</div>
            <div style={{color:C.mid}}>Lower handicap plays off scratch. Higher handicap player receives the full difference in shots, allocated by stroke index.</div>
          </>}
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`,color:C.mid,fontSize:12}}>
            {day===2?'Each hole: 0–2 points available per team (best ball + aggregate)'
              :'Win = 1 pt · Halved = ½ pt each · Loss = 0 pts'}
          </div>
        </div>
      )}

      {/* ── Sticky scorecard header: player names + column labels ── */}
      <div style={{
        position:'sticky', top:52, zIndex:20,
        background:C.dark, borderRadius:12, overflow:'hidden',
        marginBottom:'0.75rem', boxShadow:'0 4px 16px rgba(0,0,0,0.4)'
      }}>
        {/* Team name rows */}
        {(rows.length<=2?rows:[rows[0],rows[2]]).map((row,ri)=>{
          const teamCol=row.teamId==='A'?C.pakGreen:C.engNavy;
          const teamBg=row.teamId==='A'?'#022d13':'#011540';
          const teammates=rows.filter(r=>r.teamId===row.teamId);
          return (
            <div key={ri} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'7px 10px',background:teamBg,borderBottom:`1px solid rgba(255,255,255,0.06)`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',flex:1}}>
                {teammates.map((tm,ti)=>(
                  <div key={ti} style={{display:'flex',alignItems:'center',gap:5}}>
                    <div style={{background:teamCol,borderRadius:5,padding:'2px 6px',minWidth:30,textAlign:'center'}}>
                      <div style={{fontSize:10,fontWeight:800,color:C.white,letterSpacing:'0.02em'}}>{tm.initials}</div>
                    </div>
                    <div style={{fontSize:11,fontWeight:600,color:C.white}}>{tm.label}</div>
                    {ti<teammates.length-1&&<span style={{color:'rgba(255,255,255,0.4)',fontSize:10,paddingLeft:2}}>·</span>}
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:4}}>
                {rows.filter(r=>r.teamId===row.teamId).map(r=><SaveIndicator key={r.key} state={saveState[r.key]||'idle'}/>)}
              </div>
            </div>
          );
        })}
        {/* Column label row — always visible */}
        <div style={{display:'grid',
          gridTemplateColumns:`52px 28px 24px ${rows.map(()=>'1fr').join(' ')} 56px 56px`,
          gap:2,padding:'5px 8px',background:'rgba(255,255,255,0.06)',alignItems:'center',
          borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{fontSize:10,fontWeight:700,color:C.gold,letterSpacing:'0.06em'}}>HOLE</div>
          <div style={{fontSize:10,fontWeight:700,color:'#D1D5DB',textAlign:'center'}}>Par</div>
          <div style={{fontSize:10,fontWeight:700,color:'#D1D5DB',textAlign:'center'}}>SI</div>
          {rows.map((row,ri)=>(
            <div key={ri} style={{textAlign:'center'}}>
              <div style={{fontSize:12,fontWeight:800,color:row.teamId==='A'?'#4ADE80':'#60A5FA'}}>{row.initials}</div>
            </div>
          ))}
          <div style={{fontSize:10,fontWeight:700,color:'#D1D5DB',textAlign:'center'}}>{day===2?'Pts':'Res'}</div>
          <div style={{fontSize:10,fontWeight:700,color:'#D1D5DB',textAlign:'center'}}>Stat</div>
        </div>
      </div>

      {/* ── Scorecard — continuous holes 1–18 with Out/In dividers ── */}
      <div style={{...card,padding:0,overflow:'hidden',marginBottom:'0.75rem'}}>
        {tee.holes.map((hole,hi)=>{
          const r=res[hi];
          const sub=res.slice(0,hi+1) as (string|null)[];
          const ss=matchStat(sub);
          const statusTxt=r==null?'':ss.sc===0?'AS':`${ss.sc>0?'PK':'EN'}${Math.abs(ss.sc)}${ss.closed?'&'+ss.rem:''}`;
          const isEven=hi%2===0;
          const isOut=hi===8; // after hole 9
          const outRow=isOut?(
            <div key={`out`} style={{display:'grid',
              gridTemplateColumns:`52px 28px 24px ${rows.map(()=>'1fr').join(' ')} 44px 56px`,
              gap:2,background:'#1F2937',padding:'7px 8px',alignItems:'center',
              borderTop:'2px solid #374151',borderBottom:'2px solid #374151'}}>
              <div style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:'0.06em',paddingLeft:4}}>OUT</div>
              <div style={{fontSize:11,fontWeight:700,color:'#E5E7EB',textAlign:'center'}}>{tee.holes.slice(0,9).reduce((a,h)=>a+h.par,0)}</div>
              <div/>
              {rows.map((row,ri)=>{
                const gross=tee.holes.slice(0,9).reduce((a,_,i)=>{const v=localScores[row.key]?.[i]??null;return v!=null?a+v:a;},0);
                const filled=tee.holes.slice(0,9).every((_,i)=>localScores[row.key]?.[i]!=null);
                const teamAccent=row.teamId==='A'?'#4ADE80':'#60A5FA';
                return <div key={ri} style={{textAlign:'center',fontSize:14,fontWeight:800,color:filled?teamAccent:'#4B5563'}}>{filled?gross:'—'}</div>;
              })}
              <div style={{textAlign:'center',fontSize:10,fontWeight:600,color:'#4B5563'}}>
                {day===2?(()=>{
                  const front=res.slice(0,9).filter(r=>r!=null);
                  const[pa,pb]=front.reduce(([a,b],r)=>{const[x,y]=r!.split(':').map(Number);return[a+x,b+y];},[0,0]);
                  return <span><span style={{color:'#4ADE80'}}>{fmtPt(pa)}</span>–<span style={{color:'#60A5FA'}}>{fmtPt(pb)}</span></span>;
                })()
                :`${res.slice(0,9).filter(r=>r==='A').length}pk ${res.slice(0,9).filter(r=>r==='H').length}½ ${res.slice(0,9).filter(r=>r==='B').length}en`}
              </div>
              <div/>
            </div>
          ):null;

          const holeEl=(
            <div key={hi} style={{display:'grid',
              gridTemplateColumns:`52px 28px 24px ${rows.map(()=>'1fr').join(' ')} 44px 56px`,
              gap:2,alignItems:'center',background:isEven?C.white:'#F9FAFB',
              borderTop:`1px solid ${C.border}`,minHeight:50,padding:'3px 8px'}}>
              <div style={{fontSize:12,fontWeight:700,color:C.dark}}>{hi+1}</div>
              <div style={{fontSize:12,fontWeight:600,color:C.mid,textAlign:'center'}}>{hole.par}</div>
              <div style={{fontSize:11,color:'#4B5563',textAlign:'center'}}>{hole.si}</div>
              {rows.map((row)=>{
                const val=localScores[row.key]?.[hi]??null;
                const net=val!==null?val-shotsOnHole(row.shots,hole.si):null;
                const diff=net!==null?net-hole.par:null;
                const bg=diff==null?'transparent':diff<=-2?C.engNavy:diff===-1?C.pakGreen:diff===0?'transparent':diff===1?'#EF4444':'#991B1B';
                const fc=diff==null||diff===0?C.dark:C.white;
                const br=diff!=null&&diff<=-1?'50%':'6px';
                const shots=shotsOnHole(row.shots,hole.si);
                return (
                  <div key={row.key} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                    {shots>0&&<div style={{fontSize:8,fontWeight:700,lineHeight:1,color:row.teamId==='A'?C.pakGreen:C.engNavy}}>{shots>1?`+${shots}`:'+'}▸</div>}
                    <input type="number" inputMode="numeric" min={1} max={15} value={val??''} onChange={e=>setScore(row.key,hi,e.target.value)}
                      style={{width:40,height:40,textAlign:'center',border:`1.5px solid ${diff!=null&&diff!==0?bg:C.border}`,borderRadius:br,fontSize:16,fontWeight:700,background:bg,color:fc,padding:0,outline:'none'}}/>
                  </div>
                );
              })}
              {/* Result column — Day 2 shows pts, others show PK/EN/½ */}
              <div style={{textAlign:'center',fontSize:12,fontWeight:800,lineHeight:1.1}}>
                {day===2&&r!=null?(()=>{
                  const[pa,pb]=r.split(':').map(Number);
                  return <div>
                    <div style={{color:'#4ADE80'}}>{fmtPt(pa)}</div>
                    <div style={{color:'#60A5FA'}}>{fmtPt(pb)}</div>
                  </div>;
                })()
                :r==='H'?<span style={{color:C.gold,fontSize:14}}>½</span>
                :r==='A'?<span style={{color:C.pakGreen}}>PK</span>
                :r==='B'?<span style={{color:C.engNavy}}>EN</span>
                :<span style={{color:'#9CA3AF',fontSize:10}}>·</span>}
              </div>
              <div style={{textAlign:'center',fontSize:11,fontWeight:700,
                color:ss.sc>0?C.pakGreen:ss.sc<0?C.engNavy:'#9CA3AF'}}>{statusTxt}</div>
            </div>
          );

          return hi===8?[holeEl,outRow]:holeEl;
        })}

        {/* IN row after hole 18 */}
        <div style={{display:'grid',
          gridTemplateColumns:`52px 28px 24px ${rows.map(()=>'1fr').join(' ')} 44px 56px`,
          gap:2,background:'#1F2937',padding:'7px 8px',alignItems:'center',
          borderTop:'2px solid #374151'}}>
          <div style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:'0.06em',paddingLeft:4}}>IN</div>
          <div style={{fontSize:11,fontWeight:700,color:'#E5E7EB',textAlign:'center'}}>{tee.holes.slice(9).reduce((a,h)=>a+h.par,0)}</div>
          <div/>
          {rows.map((row,ri)=>{
            const gross=tee.holes.slice(9).reduce((a,_,i)=>{const v=localScores[row.key]?.[i+9]??null;return v!=null?a+v:a;},0);
            const filled=tee.holes.slice(9).every((_,i)=>localScores[row.key]?.[i+9]!=null);
            const teamAccent=row.teamId==='A'?'#4ADE80':'#60A5FA';
            return <div key={ri} style={{textAlign:'center',fontSize:14,fontWeight:800,color:filled?teamAccent:'#4B5563'}}>{filled?gross:'—'}</div>;
          })}
          <div style={{textAlign:'center',fontSize:10,fontWeight:600,color:'#4B5563'}}>
            {day===2?(()=>{
              const back=res.slice(9).filter(r=>r!=null);
              const[pa,pb]=back.reduce(([a,b],r)=>{const[x,y]=r!.split(':').map(Number);return[a+x,b+y];},[0,0]);
              return <span><span style={{color:'#4ADE80'}}>{fmtPt(pa)}</span>–<span style={{color:'#60A5FA'}}>{fmtPt(pb)}</span></span>;
            })()
            :`${res.slice(9).filter(r=>r==='A').length}pk ${res.slice(9).filter(r=>r==='H').length}½ ${res.slice(9).filter(r=>r==='B').length}en`}
          </div>
          <div/>
        </div>
      </div>

      {/* ── Grand totals ── */}
      {rows.some(row=>tee.holes.some((_,i)=>localScores[row.key]?.[i]!=null))&&(
        <div style={{...card,background:C.dark,border:'none',marginBottom:'0.75rem'}}>
          <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:'0.08em',marginBottom:10}}>
            {day===2?'MATCH POINTS':'MATCH TOTALS'}
          </div>
          <div style={{display:'flex',gap:8}}>
            {day===2?(
              (['A','B'] as const).map(tid=>{
                const teamAccent=tid==='A'?'#4ADE80':'#60A5FA';
                const teamBg=tid==='A'?'#022d13':'#011540';
                const{A,B}=d2TotalPts(res);
                const val=tid==='A'?A:B;
                return(
                  <div key={tid} style={{flex:1,background:teamBg,borderRadius:10,padding:'0.75rem',textAlign:'center',border:`1px solid ${TCOL[tid]}44`}}>
                    <div style={{fontSize:12,fontWeight:800,color:teamAccent,marginBottom:6}}>{TNAME[tid]}</div>
                    <div style={{fontSize:32,fontWeight:800,color:C.white,lineHeight:1}}>{fmtPt(val)}</div>
                    <div style={{fontSize:10,color:'#4B5563',marginTop:4}}>of {res.filter(r=>r!=null).length*2} pts played</div>
                  </div>
                );
              })
            ):rows.map((row,ri)=>{
              const pl=pairLabel(ri);
              const teamAccent=row.teamId==='A'?'#4ADE80':'#60A5FA';
              const teamBg=row.teamId==='A'?'#022d13':'#011540';
              const out=tee.holes.slice(0,9).reduce((a,_,i)=>{const v=localScores[row.key]?.[i]??null;return v!=null?a+v:a;},0);
              const inn=tee.holes.slice(9).reduce((a,_,i)=>{const v=localScores[row.key]?.[i+9]??null;return v!=null?a+v:a;},0);
              const outF=tee.holes.slice(0,9).every((_,i)=>localScores[row.key]?.[i]!=null);
              const inF=tee.holes.slice(9).every((_,i)=>localScores[row.key]?.[i+9]!=null);
              const total=out+inn;
              const diff=total-tee.par;
              return (
                <div key={ri} style={{flex:1,background:teamBg,borderRadius:10,padding:'0.75rem',textAlign:'center',border:`1px solid ${TCOL[row.teamId]}44`}}>
                  <div style={{fontSize:12,fontWeight:800,color:teamAccent,marginBottom:6}}>{pl}</div>
                  {outF&&inF?(
                    <>
                      <div style={{fontSize:28,fontWeight:800,color:C.white,lineHeight:1}}>{total}</div>
                      <div style={{fontSize:12,color:diff<0?'#4ADE80':diff>0?'#F87171':'#9CA3AF',marginTop:4,fontWeight:700}}>{diff>0?`+${diff}`:diff===0?'E':diff}</div>
                      <div style={{fontSize:10,color:'#4B5563',marginTop:4}}>{out} out · {inn} in</div>
                    </>
                  ):<div style={{fontSize:13,color:'#374151',paddingTop:8}}>—</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Day 1 Shot counter ── */}
      {day===1&&(
        <div style={{...card,background:C.dark,border:'none',marginBottom:'0.75rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:'0.08em'}}>SHOT TRACKER</div>
            <button onClick={resetCounts} style={{fontSize:10,color:'#4B5563',background:'none',border:'1px solid #374151',borderRadius:6,padding:'2px 8px',cursor:'pointer'}}>Reset</button>
          </div>
          <div style={{fontSize:11,color:'#4B5563',marginBottom:10}}>Each player needs min. 7 drives &amp; 5 second shots. Par 3 drives count. Par 3 second shots don't count.</div>
          {match.teamA&&match.teamA[0]&&[...match.teamA,...match.teamB].map((pid,pi)=>{
            const nm=nameOf(pid); const tid=pi<2?'A':'B';
            const drives=driveCounts[pid]||0; const seconds=secondCounts[pid]||0;
            const dOk=drives>=7; const sOk=seconds>=5;
            return(
              <div key={pid} style={{marginBottom:10,padding:'8px 10px',borderRadius:8,background:dOk&&sOk?'#022d13':'#1a1a2e',border:`1px solid ${dOk&&sOk?C.pakGreen+'33':'#374151'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:tid==='A'?'#4ADE80':'#60A5FA'}}>{nm}</div>
                  {dOk&&sOk&&<span style={{fontSize:10,color:C.pakGreen,fontWeight:600}}>✓ Requirements met</span>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[
                    {label:'Drives',count:drives,target:7,ok:dOk,onTap:()=>bumpDrive(pid)},
                    {label:'2nd shots',count:seconds,target:5,ok:sOk,onTap:()=>bumpSecond(pid)},
                  ].map(({label,count,target,ok,onTap})=>(
                    <div key={label}>
                      <div style={{fontSize:10,color:'#4B5563',marginBottom:4}}>{label} (min {target})</div>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{fontSize:18,fontWeight:800,color:ok?'#4ADE80':'#F87171',minWidth:28}}>{count}</div>
                        <div style={{flex:1,height:4,borderRadius:2,background:'#374151',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${Math.min(100,(count/target)*100)}%`,background:ok?C.pakGreen:'#F87171',borderRadius:2,transition:'width 0.2s'}}/>
                        </div>
                        <button onClick={onTap} style={{background:ok?C.pakGreen:C.engNavy,color:C.white,border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,fontWeight:700,cursor:'pointer'}}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Individual scorecard (read-only, vertical) ────────────
function Scorecard({day,pid,players,course,scores,onBack}: {
  day:number; pid:string; players:Player[]; course:Course;
  scores:Record<string,(number|null)[]>; onBack:()=>void;
}) {
  const player=players.find(p=>p.id===pid)!;
  const tee=activeTeeOf(course);
  const ph=player?.hi!==null&&tee.cr?playerPH(player,course):null;
  let scoreKey:string|null=null;
  if(day===2) scoreKey=`d2_${pid}`;
  else if(day===3) scoreKey=`d3_${pid}`;
  const raw:((number|null)[])=scoreKey?(scores[scoreKey]||[]):[];
  const parTot=tee.holes.reduce((a,h)=>a+h.par,0);
  const tot=raw.reduce((a:number,s)=>s!=null?a+(s as number):a,0);
  const netTot=ph!==null?raw.reduce((a:number,s,i)=>s!=null?a+(s as number)-shotsOnHole(ph,tee.holes[i].si):a,0):null;

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:C.mid,fontSize:14,padding:0}}>← Back</button>
        <span style={{fontSize:13,color:C.mid}}>Scorecard</span>
      </div>
      <div style={{...card,background:TLIGHT[player?.teamId],border:`1px solid ${TCOL[player?.teamId]}33`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:C.dark}}>{player?.name||'Player'}</div>
            <div style={{marginTop:4}}><TeamPill tid={player?.teamId} size="md"/></div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:10,color:C.mid,fontWeight:500}}>PLAYING HCP</div>
            <div style={{fontSize:28,fontWeight:700,color:TCOL[player?.teamId]}}>{ph??'—'}</div>
            <div style={{fontSize:11,color:C.mid}}>H.I. {player?.hi??'—'}</div>
          </div>
        </div>
      </div>

      {[{label:'Front 9',start:0,end:9},{label:'Back 9',start:9,end:18}].map(({label,start,end})=>{
        const sHoles=tee.holes.slice(start,end);
        const gross=sHoles.reduce((a,_,i)=>{const s=raw[start+i];return s!=null?a+(s as number):a;},0);
        const filled=sHoles.every((_,i)=>raw[start+i]!=null);
        const sPar=sHoles.reduce((a,h)=>a+h.par,0);
        return (
          <div key={label} style={{...card,padding:0,overflow:'hidden',marginBottom:'1rem'}}>
            <div style={{background:C.dark,padding:'8px 12px',display:'grid',
              gridTemplateColumns:ph!==null?'70px 28px 24px 1fr 1fr':'70px 28px 24px 1fr',
              gap:4,alignItems:'center'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.gold}}>{label}</div>
              <div style={{fontSize:10,color:'#4B5563',textAlign:'center'}}>Par</div>
              <div style={{fontSize:10,color:'#4B5563',textAlign:'center'}}>SI</div>
              <div style={{fontSize:10,color:TCOL[player?.teamId],textAlign:'center',fontWeight:600}}>Gross</div>
              {ph!==null&&<div style={{fontSize:10,color:'#4B5563',textAlign:'center'}}>Net</div>}
            </div>
            {sHoles.map((hole,idx)=>{
              const hi=start+idx;
              const s=raw[hi] as number|null;
              const net=s!=null&&ph!==null?s-shotsOnHole(ph,hole.si):null;
              const diff=s!=null?s-hole.par:null;
              const netDiff=net!==null?net-hole.par:null;
              const bg=diff==null?'transparent':diff<=-2?C.engNavy:diff===-1?C.pakGreen:diff===0?'transparent':diff===1?'#EF4444':'#991B1B';
              const fc=diff==null||diff===0?C.dark:C.white;
              const br=diff!=null&&diff<=-1?'50%':'6px';
              const shots=ph!==null?shotsOnHole(ph,hole.si):0;
              return (
                <div key={hi} style={{display:'grid',
                  gridTemplateColumns:ph!==null?'70px 28px 24px 1fr 1fr':'70px 28px 24px 1fr',
                  gap:4,alignItems:'center',background:idx%2===0?C.white:'#F9FAFB',
                  borderTop:`1px solid ${C.border}`,minHeight:44,padding:'2px 4px'}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.dark,paddingLeft:8,display:'flex',alignItems:'center',gap:4}}>
                    H{hi+1}
                    {shots>0&&<span style={{fontSize:8,color:TCOL[player?.teamId],fontWeight:700}}>{shots>1?`+${shots}`:'+'}▸</span>}
                  </div>
                  <div style={{fontSize:12,color:C.mid,textAlign:'center'}}>{hole.par}</div>
                  <div style={{fontSize:11,color:'#4B5563',textAlign:'center'}}>{hole.si}</div>
                  <div style={{display:'flex',justifyContent:'center'}}>
                    {s!=null
                      ?<div style={{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:br,background:bg,color:fc,fontSize:15,fontWeight:700}}>{s}</div>
                      :<div style={{width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'6px',border:`1.5px solid ${C.border}`,color:'#9CA3AF',fontSize:12}}>—</div>
                    }
                  </div>
                  {ph!==null&&<div style={{textAlign:'center',fontSize:13,fontWeight:netDiff!==0?600:400,
                    color:netDiff!=null&&netDiff<0?C.pakGreen:netDiff!=null&&netDiff>0?C.red:C.mid}}>
                    {net!==null?net:'—'}
                  </div>}
                </div>
              );
            })}
            <div style={{display:'grid',
              gridTemplateColumns:ph!==null?'70px 28px 24px 1fr 1fr':'70px 28px 24px 1fr',
              gap:4,background:'#F3F4F6',borderTop:`2px solid ${C.border}`,padding:'6px 4px',alignItems:'center'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.mid,paddingLeft:8}}>{start===0?'Out':'In'}</div>
              <div style={{fontSize:11,fontWeight:600,color:C.mid,textAlign:'center'}}>{sPar}</div>
              <div/>
              <div style={{textAlign:'center',fontSize:14,fontWeight:700,color:filled?C.dark:'#D1D5DB'}}>{filled?gross:'—'}</div>
              {ph!==null&&<div style={{textAlign:'center',fontSize:13,color:C.mid}}>{filled?gross-sHoles.reduce((a,_,i)=>a+shotsOnHole(ph,sHoles[i].si),0):'—'}</div>}
            </div>
          </div>
        );
      })}

      {tot>0&&(
        <div style={{...card,background:C.goldLight,border:`1px solid ${C.gold}44`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:'0.08em',marginBottom:10}}>TOTALS</div>
          <div style={{display:'flex',gap:8}}>
            {[
              {lbl:'Out',val:raw.slice(0,9).reduce((a:number,s)=>s!=null?a+(s as number):a,0),filled:raw.slice(0,9).every(s=>s!=null),diff:null},
              {lbl:'In',val:raw.slice(9).reduce((a:number,s)=>s!=null?a+(s as number):a,0),filled:raw.slice(9).every(s=>s!=null),diff:null},
              {lbl:'Gross',val:tot,filled:true,diff:tot-parTot},
              ...(netTot!==null?[{lbl:'Net',val:netTot,filled:true,diff:netTot-parTot}]:[]),
            ].map(({lbl,val,filled,diff})=>(
              <div key={lbl} style={{flex:1,background:C.white,borderRadius:10,padding:'0.6rem',textAlign:'center',border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.mid,marginBottom:3,fontWeight:500}}>{lbl}</div>
                <div style={{fontSize:20,fontWeight:700,color:filled?C.dark:'#D1D5DB'}}>{filled?val:'—'}</div>
                {diff!==null&&filled&&<div style={{fontSize:10,color:diff<0?C.pakGreen:diff>0?C.red:C.mid,marginTop:2,fontWeight:600}}>{diff>0?`+${diff}`:diff===0?'E':diff}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────
function Leaderboard({players,courses,pairings,scores,onEndTournament}: {
  players:Player[]; courses:Course[]; pairings:Pairing[];
  scores:Record<string,(number|null)[]>; onEndTournament:()=>void;
}) {
  const nameOf=(pid:string)=>players.find(p=>p.id===pid)?.name||'?';
  const dayPts=(day:number)=>{
    let a=0,b=0;
    const course=courses.find(c=>c.day===day)!;
    pairings.filter(m=>m.day===day).forEach(m=>{
      const res=getResults(day,m,players,course,scores);
      const pts=matchPts(matchStat(res));
      a+=pts.A; b+=pts.B;
    });
    return{A:a,B:b};
  };
  const d:{[k:number]:{A:number;B:number}}={1:dayPts(1),2:dayPts(2),3:dayPts(3)};
  const totA=d[1].A+d[2].A+d[3].A, totB=d[1].B+d[2].B+d[3].B;
  const lead=totA>totB?'A':totB>totA?'B':null;

  return (
    <div>
      {/* Overall scoreboard */}
      <div style={{background:C.dark,borderRadius:16,padding:'1.5rem',marginBottom:'1rem'}}>
        <div style={{fontSize:10,color:C.gold,fontWeight:700,letterSpacing:'0.12em',marginBottom:16,textAlign:'center'}}>JINNAH-ATTLEE SHIELD · 20 POINTS</div>
        {/* One-line score: Pakistan X – England X */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
          <span style={{fontSize:20,fontWeight:800,color:'#4ADE80'}}>{TNAME.A}</span>
          <span style={{fontSize:32,fontWeight:800,color:'#4ADE80'}}>{fmtPt(totA)}</span>
          <span style={{fontSize:24,fontWeight:300,color:'rgba(255,255,255,0.3)'}}>–</span>
          <span style={{fontSize:32,fontWeight:800,color:'#60A5FA'}}>{fmtPt(totB)}</span>
          <span style={{fontSize:20,fontWeight:800,color:'#60A5FA'}}>{TNAME.B}</span>
        </div>
        {lead&&<div style={{textAlign:'center'}}>
          <span style={{fontSize:13,fontWeight:700,color:lead==='A'?'#4ADE80':'#60A5FA',background:lead==='A'?'rgba(74,222,128,0.15)':'rgba(96,165,250,0.15)',padding:'5px 14px',borderRadius:999,display:'inline-block'}}>
            {TNAME[lead]} lead{Math.abs(totA-totB)===1?'s':''} by {fmtPt(Math.abs(totA-totB))} pt{Math.abs(totA-totB)!==1?'s':''}
          </span>
        </div>}
        {!lead&&(totA+totB)>0&&<div style={{textAlign:'center',fontSize:13,color:'rgba(255,255,255,0.5)',fontWeight:500}}>Level</div>}
      </div>

      {/* Day breakdown */}
      {[1,2,3].map(day=>{
        const course=courses.find(c=>c.day===day)!;
        return (
          <div key={day} style={card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.dark}}>Day {day} · {DAY_FMT[day]}</div>
                {course.name&&<div style={{fontSize:11,color:C.mid,marginTop:2}}>{course.name}</div>}
              </div>
              <div style={{display:'flex',gap:16}}>
                {(['A','B'] as const).map(tid=>(
                  <div key={tid} style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:TCOL[tid],fontWeight:600}}>{TNAME[tid]}</div>
                    <div style={{fontSize:22,fontWeight:700,color:TCOL[tid]}}>{fmtPt(d[day][tid])}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:'0.75rem'}}>
              {pairings.filter(m=>m.day===day).map((m,i)=>{
                const res=getResults(day,m,players,course,scores);
                const s=matchStat(res); const pts=matchPts(s);
                const paired=day<3?!!(m.teamA?.[0]&&m.teamB?.[0]):!!(m.playerA&&m.playerB);
                if(!paired) return null;
                const lA=day<3?`${nameOf(m.teamA[0])} & ${nameOf(m.teamA[1])}`:nameOf(m.playerA);
                const lB=day<3?`${nameOf(m.teamB[0])} & ${nameOf(m.teamB[1])}`:nameOf(m.playerB);
                const winTid=pts.A>pts.B?'A':pts.B>pts.A?'B':null;
                return (
                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:i<4?`1px solid ${C.border}`:'none'}}>
                    <div style={{flex:1,fontSize:12,color:TCOL.A,fontWeight:winTid==='A'?600:400}}>{lA}</div>
                    <div style={{minWidth:100,textAlign:'center',fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:999,
                      background:winTid?TLIGHT[winTid]:'#F3F4F6',
                      color:winTid?TCOL[winTid]:C.mid}}>
                      {s.pl===0?'—':statLabel(s)}
                    </div>
                    <div style={{flex:1,fontSize:12,color:TCOL.B,textAlign:'right',fontWeight:winTid==='B'?600:400}}>{lB}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* End tournament */}
      <div style={{marginTop:'1rem',paddingTop:'1rem',borderTop:`1px solid ${C.border}`}}>
        <button onClick={onEndTournament} style={{width:'100%',padding:'12px',borderRadius:10,border:`1.5px solid ${C.red}44`,background:C.redLight,color:C.red,fontSize:13,cursor:'pointer',fontWeight:600}}>
          End tournament & save to history
        </button>
      </div>
    </div>
  );
}

// ── Setup ─────────────────────────────────────────────────
function Setup({onBack,year,onDone,initPlayers,initCourses,alreadyDone}: {
  onBack:()=>void; year:number; onDone:()=>void;
  initPlayers:Player[]; initCourses:Course[]; alreadyDone:boolean;
}) {
  const [step,setStep]=useState<'players'|'courses'>('players');
  const [players,setPlayers]=useState<Player[]>(initPlayers);
  const [courses,setCourses]=useState<Course[]>(()=>
    [1,2,3,4].map(d=>{
      const ex=initCourses.find(c=>c.day===d);
      if(ex&&(ex.name||(ex.teeOptions&&ex.teeOptions.length>0))) return ex;
      const preset=COURSE_LIBRARY[DAY_COURSE[d]];
      return{day:d,name:preset.name,activeTee:preset.tees[0].name,teeOptions:preset.tees};
    })
  );
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  const saveAll=async(finish:boolean)=>{
    setSaving(true); setSaved(false);
    await fetch('/api/players',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,players})});
    await fetch('/api/courses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,courses})});
    if(finish) onDone();
    setSaving(false); setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  };

  const updP=(id:string,f:string,v:string)=>setPlayers(ps=>ps.map(p=>p.id===id?{...p,[f]:v}:p));
  const updC=(day:number,f:string,v:string|number|TeeOption[])=>setCourses(cs=>cs.map(c=>c.day===day?{...c,[f]:v}:c));

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1.25rem'}}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:C.mid,fontSize:14,padding:0}}>← Home</button>
        <span style={{fontSize:16,fontWeight:700,color:C.dark}}>Setup · {year}</span>
        {alreadyDone&&<span style={{fontSize:11,background:C.greenLight,color:C.green,padding:'2px 8px',borderRadius:999,fontWeight:600,marginLeft:4}}>Saved</span>}
      </div>

      {/* Step tabs */}
      <div style={{display:'flex',gap:6,marginBottom:'1.25rem'}}>
        {(['players','courses'] as const).map((s,i)=>(
          <button key={s} onClick={()=>setStep(s)} style={{flex:1,padding:'10px',borderRadius:10,border:step===s?'none':`1.5px solid ${C.border}`,background:step===s?C.dark:'transparent',color:step===s?C.white:C.mid,fontSize:13,fontWeight:600,cursor:'pointer'}}>
            {i+1}. {s==='players'?'Players':'Courses'}
          </button>
        ))}
      </div>

      {step==='players'&&(
        <div>
          <p style={{fontSize:13,color:C.mid,marginBottom:'1rem'}}>Enter each player's name and WHS handicap index.</p>
          {(['A','B'] as const).map(tid=>{
            const tp=players.filter(p=>p.teamId===tid);
            return (
              <div key={tid} style={{marginBottom:'1.5rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:'0.75rem'}}>
                  <div style={{width:4,height:20,background:TCOL[tid],borderRadius:2}}/>
                  <span style={{fontSize:14,fontWeight:700,color:TCOL[tid]}}>{TNAME[tid]}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'24px 1fr 72px',gap:6,marginBottom:4,paddingLeft:4}}>
                  <span/><span style={{fontSize:11,color:C.mid,fontWeight:500}}>Name</span>
                  <span style={{fontSize:11,color:C.mid,fontWeight:500,textAlign:'center'}}>H.I.</span>
                </div>
                {tp.map((p,i)=>(
                  <div key={p.id} style={{display:'grid',gridTemplateColumns:'24px 1fr 72px',gap:6,alignItems:'center',marginBottom:6}}>
                    <span style={{fontSize:12,color:'#4B5563',textAlign:'center'}}>{i+1}</span>
                    <input style={inp} value={p.name} placeholder={`Player ${i+1}`} onChange={e=>updP(p.id,'name',e.target.value)}/>
                    <input style={{...inp,textAlign:'center',padding:'10px 4px'}} type="number" step="0.1" min="-9.9" max="54" value={p.hi??''} placeholder="18.0" onChange={e=>updP(p.id,'hi',e.target.value)}/>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {step==='courses'&&(
        <div>
          <p style={{fontSize:13,color:C.mid,marginBottom:'1rem'}}>Courses are pre-loaded. Select tees and adjust if needed.</p>
          {[1,2,3,4].map(day=>{
            const c=courses.find(x=>x.day===day)!;
            const preset=COURSE_LIBRARY[DAY_COURSE[day]];
            return (
              <div key={day} style={card}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <div style={{width:28,height:28,borderRadius:8,background:C.dark,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:C.gold}}>D{day}</div>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:C.dark}}>{c.name||'Course TBC'}</div>
                    <div style={{fontSize:11,color:C.mid}}>{DAY_FMT[day]}</div>
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <label style={lbl}>Active tees</label>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {c.teeOptions.map(t=>(
                      <button key={t.name} onClick={()=>updC(day,'activeTee',t.name)}
                        style={{padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',
                          border:`1.5px solid ${c.activeTee===t.name?TCOL.A:C.border}`,
                          background:c.activeTee===t.name?TLIGHT.A:C.white,
                          color:c.activeTee===t.name?TCOL.A:C.mid}}>
                        {t.name} · CR {t.cr} · Slope {t.slope}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{marginBottom:8}}>
                  <label style={lbl}>Load different course</label>
                  <select onChange={e=>{const key=e.target.value;if(!key) return;const p=COURSE_LIBRARY[key];updC(day,'name',p.name);updC(day,'teeOptions',p.tees);updC(day,'activeTee',p.tees[0].name);e.target.value='';}}
                    style={{...inp,padding:'8px 12px',fontSize:13,color:C.mid}}>
                    <option value="">— Load preset —</option>
                    <option value="san_lorenzo">San Lorenzo</option>
                    <option value="qdl_north">QDL North</option>
                    <option value="qdl_south">QDL South</option>
                    <option value="qdl_laranjal">QDL Laranjal</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:'flex',gap:8,marginTop:'1.5rem',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',gap:8}}>
          {step==='courses'&&<Btn label="← Players" onClick={()=>setStep('players')}/>}
          <Btn label={saving?'Saving…':saved?'Saved ✓':'Save'} onClick={()=>saveAll(false)} disabled={saving}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          {step==='players'&&<Btn label="Courses →" primary onClick={()=>setStep('courses')}/>}
          {step==='courses'&&<Btn label={saving?'Saving…':alreadyDone?'Save & return →':'Start tournament →'} primary onClick={()=>saveAll(true)} disabled={saving}/>}
        </div>
      </div>
    </div>
  );
}

// ── Pairings editor ───────────────────────────────────────
function PairingsEditor({day,pairings,setPairings,players,onSave,saving}: {
  day:number; pairings:Pairing[]; setPairings:(p:Pairing[])=>void;
  players:Player[]; onSave:()=>void; saving:boolean;
}) {
  const tp={A:players.filter(p=>p.teamId==='A'),B:players.filter(p=>p.teamId==='B')};
  const dm=pairings.filter(p=>p.day===day);
  const usedA=new Set<string>(), usedB=new Set<string>();
  dm.forEach(m=>{
    if(day<3){(m.teamA||[]).forEach(id=>id&&usedA.add(id));(m.teamB||[]).forEach(id=>id&&usedB.add(id));}
    else{if(m.playerA)usedA.add(m.playerA);if(m.playerB)usedB.add(m.playerB);}
  });
  const updSlot=(id:string,side:'teamA'|'teamB',si:number,v:string)=>{
    setPairings(pairings.map(p=>{if(p.id!==id)return p;const arr=[...(p[side]||['',''])];arr[si]=v;return{...p,[side]:arr};}));
  };
  const updField=(id:string,field:'playerA'|'playerB',v:string)=>setPairings(pairings.map(p=>p.id===id?{...p,[field]:v}:p));
  const Sel=({opts,val,usedSet,onChange}:{opts:Player[];val:string;usedSet:Set<string>;onChange:(v:string)=>void})=>(
    <select style={{...inp,padding:'8px 10px',fontSize:13}} value={val||''} onChange={e=>onChange(e.target.value)}>
      <option value="">— Select —</option>
      {opts.map(p=><option key={p.id} value={p.id} disabled={usedSet.has(p.id)&&p.id!==val}>{p.name||p.id}{usedSet.has(p.id)&&p.id!==val?' (assigned)':''}</option>)}
    </select>
  );
  return (
    <div>
      {dm.map((m,mi)=>(
        <div key={m.id} style={{...card,padding:'0.875rem'}}>
          <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.06em',marginBottom:10}}>MATCH {mi+1}</div>
          {day<3?(
            <div style={{display:'grid',gridTemplateColumns:'1fr 32px 1fr',gap:8,alignItems:'start'}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TCOL.A,marginBottom:6}}>{TNAME.A}</div>
                <Sel opts={tp.A} val={(m.teamA||[])[0]} usedSet={usedA} onChange={v=>updSlot(m.id,'teamA',0,v)}/>
                <div style={{height:6}}/>
                <Sel opts={tp.A} val={(m.teamA||[])[1]} usedSet={usedA} onChange={v=>updSlot(m.id,'teamA',1,v)}/>
              </div>
              <div style={{textAlign:'center',fontSize:11,color:C.mid,paddingTop:10,fontWeight:600}}>vs</div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TCOL.B,marginBottom:6}}>{TNAME.B}</div>
                <Sel opts={tp.B} val={(m.teamB||[])[0]} usedSet={usedB} onChange={v=>updSlot(m.id,'teamB',0,v)}/>
                <div style={{height:6}}/>
                <Sel opts={tp.B} val={(m.teamB||[])[1]} usedSet={usedB} onChange={v=>updSlot(m.id,'teamB',1,v)}/>
              </div>
            </div>
          ):(
            <div style={{display:'grid',gridTemplateColumns:'1fr 32px 1fr',gap:8,alignItems:'start'}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TCOL.A,marginBottom:6}}>{TNAME.A}</div>
                <Sel opts={tp.A} val={m.playerA} usedSet={usedA} onChange={v=>updField(m.id,'playerA',v)}/>
              </div>
              <div style={{textAlign:'center',fontSize:11,color:C.mid,paddingTop:10,fontWeight:600}}>vs</div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:TCOL.B,marginBottom:6}}>{TNAME.B}</div>
                <Sel opts={tp.B} val={m.playerB} usedSet={usedB} onChange={v=>updField(m.id,'playerB',v)}/>
              </div>
            </div>
          )}
        </div>
      ))}
      <Btn label={saving?'Saving…':'Save pairings'} primary full onClick={onSave} disabled={saving}/>
    </div>
  );
}

// ── More (admin) ──────────────────────────────────────────
function More({activeYear,allYears,players,courses,pairings,setPairings,scores,setupDone,onSetup,onStartYear,onSwitchYear,onEndTournament,onSaveMatches,savingPairings}: {
  activeYear:number|null; allYears:number[]; players:Player[]; courses:Course[];
  pairings:Pairing[]; setPairings:(p:Pairing[])=>void; scores:Record<string,(number|null)[]>;
  setupDone:boolean; onSetup:()=>void; onStartYear:(y:number)=>void;
  onSwitchYear:(y:number)=>void; onEndTournament:()=>void;
  onSaveMatches:(day:number)=>Promise<void>; savingPairings:boolean;
}) {
  const [matchDay, setMatchDay] = useState<number|null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showPwdPrompt, setShowPwdPrompt] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState(false);

  const tryUnlock = () => {
    if(pwdInput === 'Z@rminae2009') {
      setAdminUnlocked(true);
      setShowPwdPrompt(false);
      setPwdInput('');
      setPwdError(false);
      onSetup();
    } else {
      setPwdError(true);
      setPwdInput('');
    }
  };

  const handleSetupClick = () => {
    if(adminUnlocked) { onSetup(); return; }
    setShowPwdPrompt(true);
    setPwdError(false);
    setPwdInput('');
  };

  if(matchDay!==null) return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
        <button onClick={()=>setMatchDay(null)} style={{background:'none',border:'none',cursor:'pointer',color:C.mid,fontSize:14,padding:0}}>← More</button>
        <span style={{fontSize:15,fontWeight:700,color:C.dark}}>Day {matchDay} · Set matches</span>
      </div>
      <div style={{...card,background:C.dark,border:'none',padding:'0.75rem 1rem',marginBottom:'1rem'}}>
        <div style={{fontSize:11,color:C.gold,fontWeight:600,letterSpacing:'0.08em',marginBottom:2}}>DAY {matchDay} · {DAY_FMT[matchDay].toUpperCase()}</div>
        <div style={{fontSize:14,fontWeight:600,color:C.white}}>
          {courses.find(c=>c.day===matchDay)?.name||'Course TBC'}
        </div>
      </div>
      <PairingsEditor day={matchDay} pairings={pairings} setPairings={setPairings} players={players}
        onSave={()=>onSaveMatches(matchDay)} saving={savingPairings}/>
    </div>
  );

  return (
    <div>
      <div style={{fontSize:16,fontWeight:700,color:C.dark,marginBottom:'1.25rem'}}>More</div>

      {/* Set matches */}
      {setupDone&&activeYear&&(
        <div style={card}>
          <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.08em',marginBottom:10}}>SET MATCHES</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[1,2,3].map(d=>{
              const dm=pairings.filter(p=>p.day===d);
              const setPaired=d<3
                ?dm.filter(m=>m.teamA?.[0]&&m.teamB?.[0]).length
                :dm.filter(m=>m.playerA&&m.playerB).length;
              const total=d<3?5:10;
              const done=setPaired===total;
              return (
                <button key={d} onClick={()=>setMatchDay(d)}
                  style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderRadius:10,border:`1.5px solid ${done?C.pakGreen+'44':C.border}`,background:done?C.pakLight:C.white,cursor:'pointer',textAlign:'left'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:C.dark}}>Day {d} · {DAY_FMT[d]}</div>
                    <div style={{fontSize:11,color:C.mid,marginTop:2}}>{courses.find(c=>c.day===d)?.name||'Course TBC'}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:12,fontWeight:600,color:done?C.pakGreen:setPaired>0?C.gold:C.mid}}>{setPaired}/{total} set</div>
                    <div style={{fontSize:10,color:C.mid,marginTop:2}}>→</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Current tournament */}
      {activeYear&&(
        <div style={card}>
          <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.08em',marginBottom:10}}>CURRENT TOURNAMENT · {activeYear}</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <Btn label={adminUnlocked ? "Edit setup ✓" : "Edit setup 🔒"} onClick={handleSetupClick} style={{flex:1}}/>
            {showPwdPrompt&&(
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',zIndex:100}}>
                <div style={{background:C.white,borderRadius:16,padding:'1.5rem',width:'100%',maxWidth:360}}>
                  <div style={{fontSize:15,fontWeight:700,color:C.dark,marginBottom:4}}>Admin access required</div>
                  <div style={{fontSize:13,color:C.mid,marginBottom:'1.25rem'}}>Enter the admin password to edit setup.</div>
                  <label style={lbl}>Password</label>
                  <input style={{...inp,marginBottom:12}} type="password" value={pwdInput} placeholder="Enter password"
                    onChange={e=>{setPwdInput(e.target.value);setPwdError(false);}}
                    onKeyDown={e=>e.key==='Enter'&&tryUnlock()}
                    autoFocus/>
                  {pwdError&&<div style={{fontSize:12,color:C.red,marginBottom:10,background:C.redLight,padding:'8px 12px',borderRadius:8,fontWeight:500}}>Incorrect password</div>}
                  <div style={{display:'flex',gap:8}}>
                    <Btn label="Cancel" onClick={()=>{setShowPwdPrompt(false);setPwdInput('');setPwdError(false);}}/>
                    <Btn label="Unlock →" primary onClick={tryUnlock}/>
                  </div>
                </div>
              </div>
            )}
            {setupDone&&<Btn label="End tournament" danger onClick={onEndTournament} style={{flex:1}}/>}
          </div>
        </div>
      )}

      {/* Year management */}
      <div style={card}>
        <div style={{fontSize:11,fontWeight:700,color:C.mid,letterSpacing:'0.08em',marginBottom:10}}>TOURNAMENT YEARS</div>
        {allYears.map(y=>(
          <div key={y} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:14,fontWeight:y===activeYear?700:400,color:y===activeYear?C.dark:C.mid}}>{y}{y===activeYear?' (active)':''}</span>
            {y!==activeYear&&<Btn label="Switch" small onClick={()=>onSwitchYear(y)}/>}
          </div>
        ))}
        {!allYears.includes(2026)&&(
          <div style={{paddingTop:10}}>
            <Btn label="Start 2026 tournament" primary full onClick={()=>onStartYear(2026)}/>
          </div>
        )}
        <div style={{paddingTop:10}}>
          <Btn label="New tournament year" full onClick={()=>{const y=parseInt(prompt('Enter year:')||'0');if(y>2020&&y<2100)onStartYear(y);}}/>
        </div>
      </div>

      {/* About */}
      <div style={{...card,textAlign:'center'}}>
        <div style={{display:'flex',justifyContent:'center',marginBottom:8}}><Shield size={40}/></div>
        <div style={{fontSize:13,fontWeight:700,color:C.dark}}>Jinnah-Attlee Shield</div>
        <div style={{fontSize:11,color:C.mid,marginTop:4}}>Annual golf tournament · Pakistan vs England</div>
      </div>
    </div>
  );
}

// ── End tournament modal ──────────────────────────────────
function EndTournamentModal({year,players,courses,pairings,scores,onClose,onComplete}: {
  year:number; players:Player[]; courses:Course[]; pairings:Pairing[];
  scores:Record<string,(number|null)[]>; onClose:()=>void; onComplete:()=>void;
}) {
  const [pwd,setPwd]=useState('');
  const [venue,setVenue]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const nameOf=(pid:string)=>players.find(p=>p.id===pid)?.name||'?';
  const dayPts=(day:number)=>{
    let a=0,b=0;
    const course=courses.find(c=>c.day===day)!;
    pairings.filter(m=>m.day===day).forEach(m=>{const res=getResults(day,m,players,course,scores);const pts=matchPts(matchStat(res));a+=pts.A;b+=pts.B;});
    return{A:a,B:b};
  };
  const d={1:dayPts(1),2:dayPts(2),3:dayPts(3)};
  const totA=d[1].A+d[2].A+d[3].A, totB=d[1].B+d[2].B+d[3].B;
  const winner=totA>totB?'Pakistan':totB>totA?'England':null;
  const tied=totA===totB;
  const matchRecords:MatchRecord[]=[];
  [1,2,3].forEach(day=>{
    const course=courses.find(c=>c.day===day)!;
    pairings.filter(m=>m.day===day).forEach(m=>{
      const paired=day<3?!!(m.teamA?.[0]&&m.teamB?.[0]):!!(m.playerA&&m.playerB);
      if(!paired) return;
      const res=getResults(day,m,players,course,scores);
      const s=matchStat(res); const pts=matchPts(s);
      const lA=day<3?`${nameOf(m.teamA[0])} & ${nameOf(m.teamA[1])}`:nameOf(m.playerA);
      const lB=day<3?`${nameOf(m.teamB[0])} & ${nameOf(m.teamB[1])}`:nameOf(m.playerB);
      matchRecords.push({day,labelA:lA,labelB:lB,result:s.pl===0?'—':statLabel(s),ptsA:pts.A,ptsB:pts.B});
    });
  });
  const submit=async()=>{
    if(!venue.trim()){setError('Please enter the venue');return;}
    setSubmitting(true);setError('');
    const res=await fetch('/api/end-tournament',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd,year,winner,tied,scoreA:totA,scoreB:totB,venue:venue.trim(),matches:matchRecords})});
    const data=await res.json();
    if(!res.ok){setError(data.error||'Failed');setSubmitting(false);return;}
    setSubmitting(false); onComplete();
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',zIndex:100}}>
      <div style={{background:C.white,borderRadius:16,padding:'1.5rem',width:'100%',maxWidth:400}}>
        <div style={{fontSize:16,fontWeight:700,color:C.dark,marginBottom:4}}>End tournament · {year}</div>
        <div style={{fontSize:13,color:C.mid,marginBottom:'1.25rem'}}>This permanently saves all results to history. Cannot be undone.</div>
        <div style={{background:tied?'#F3F4F6':winner==='Pakistan'?C.pakLight:C.engLight,borderRadius:12,padding:'1rem',textAlign:'center',marginBottom:'1rem',border:`1px solid ${tied?C.border:winner==='Pakistan'?C.pakGreen+'33':C.engNavy+'33'}`}}>
          <div style={{fontSize:11,color:C.mid,marginBottom:8,fontWeight:600}}>FINAL RESULT</div>
          <div style={{display:'flex',justifyContent:'center',alignItems:'baseline',gap:16}}>
            <div><div style={{fontSize:11,color:TCOL.A,fontWeight:600}}>{TNAME.A}</div><div style={{fontSize:40,fontWeight:800,color:TCOL.A}}>{fmtPt(totA)}</div></div>
            <div style={{fontSize:20,color:C.mid}}>–</div>
            <div><div style={{fontSize:11,color:TCOL.B,fontWeight:600}}>{TNAME.B}</div><div style={{fontSize:40,fontWeight:800,color:TCOL.B}}>{fmtPt(totB)}</div></div>
          </div>
          <div style={{fontSize:14,fontWeight:700,marginTop:8,color:tied?C.mid:winner==='Pakistan'?C.pakGreen:C.engNavy}}>
            {tied?'Match tied':`${winner} win`}
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <label style={lbl}>Venue</label>
          <input style={inp} value={venue} placeholder="e.g. Quinta do Lago, Portugal" onChange={e=>setVenue(e.target.value)}/>
        </div>
        <div style={{marginBottom:'1.25rem'}}>
          <label style={lbl}>Admin password</label>
          <input style={inp} type="password" value={pwd} placeholder="Enter password" onChange={e=>setPwd(e.target.value)}/>
        </div>
        {error&&<div style={{fontSize:12,color:C.red,marginBottom:10,background:C.redLight,padding:'8px 12px',borderRadius:8,fontWeight:500}}>{error}</div>}
        <div style={{display:'flex',gap:8}}>
          <Btn label="Cancel" onClick={onClose}/>
          <Btn label={submitting?'Saving…':'Confirm & save →'} primary onClick={submit} disabled={submitting}/>
        </div>
      </div>
    </div>
  );
}

// ── Day 4 ─────────────────────────────────────────────────
function Day4View({players,courses,scores,onSave}: {
  players:Player[]; courses:Course[]; scores:Record<string,(number|null)[]>;
  onSave:(key:string,holes:(number|null)[])=>Promise<void>;
}) {
  const [selPid,setSelPid]=useState<string|null>(null);
  const course=courses.find(c=>c.day===4)!;
  const tee=activeTeeOf(course);
  if(selPid) return <Day4Card pid={selPid} players={players} course={course} scores={scores} onSave={onSave} onBack={()=>setSelPid(null)}/>;
  return (
    <div>
      <div style={{background:C.dark,borderRadius:12,padding:'1rem',marginBottom:'1rem',color:C.white}}>
        <div style={{fontSize:11,color:C.gold,fontWeight:600,letterSpacing:'0.08em',marginBottom:4}}>DAY 4 · INDIVIDUAL</div>
        <div style={{fontSize:17,fontWeight:700}}>{course.name||'Course TBC'}</div>
        {tee.name&&<div style={{fontSize:12,color:'#4B5563',marginTop:2}}>{tee.name} tees · Par {tee.par} · Slope {tee.slope} / CR {tee.cr}</div>}
        <div style={{marginTop:8,fontSize:12,color:C.gold,background:'rgba(200,168,75,0.1)',padding:'6px 10px',borderRadius:8,display:'inline-block'}}>Format TBC on day · No team points</div>
      </div>
      {(['A','B'] as const).map(tid=>(
        <div key={tid} style={{marginBottom:'1.25rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:'0.5rem'}}>
            <div style={{width:4,height:20,background:TCOL[tid],borderRadius:2}}/>
            <span style={{fontSize:13,fontWeight:700,color:TCOL[tid]}}>{TNAME[tid]}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8}}>
            {players.filter(p=>p.teamId===tid).map(p=>{
              const key=`d4_${p.id}`;
              const played=(scores[key]||[]).filter(s=>s!=null).length;
              const ph=p.hi!==null&&tee.cr?calcPH(Number(p.hi),tee.slope,Number(tee.cr),tee.par):null;
              return (
                <button key={p.id} onClick={()=>setSelPid(p.id)}
                  style={{padding:'12px',borderRadius:10,border:`1.5px solid ${played>0?TCOL[tid]+'33':C.border}`,background:played>0?TLIGHT[tid]:C.white,cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.dark,marginBottom:4}}>{p.name||p.id}</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <TeamPill tid={tid}/>
                    <span style={{fontSize:11,color:played>0?TCOL[tid]:C.mid,fontWeight:played>0?600:400}}>
                      {played>0?`${played} holes`:ph!==null?`PH ${ph}`:'—'}
                    </span>
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

function Day4Card({pid,players,course,scores,onSave,onBack}: {
  pid:string; players:Player[]; course:Course;
  scores:Record<string,(number|null)[]>;
  onSave:(key:string,holes:(number|null)[])=>Promise<void>; onBack:()=>void;
}) {
  const player=players.find(p=>p.id===pid)!;
  const tee=activeTeeOf(course);
  const ph=player?.hi!==null&&tee.cr?calcPH(Number(player.hi),tee.slope,Number(tee.cr),tee.par):null;
  const key=`d4_${pid}`;
  const {trigger,saveState}=useAutoSave(onSave);
  const [localScores,setLocalScores]=useState<(number|null)[]>(scores[key]?[...scores[key]]:Array(18).fill(null));

  const setScore=(i:number,val:string)=>{
    const v=val===''?null:Math.max(1,parseInt(val));
    setLocalScores(prev=>{const a=[...prev];a[i]=v;trigger(key,a);return a;});
  };

  const raw=localScores;
  const parTot=tee.holes.reduce((a,h)=>a+h.par,0);
  const tot=raw.reduce((a:number,s)=>s!=null?a+(s as number):a,0);
  const netTot=ph!==null?raw.reduce((a:number,s,i)=>s!=null?a+(s as number)-shotsOnHole(ph,tee.holes[i].si):a,0):null;

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:C.mid,fontSize:14,padding:0}}>← Back</button>
        <span style={{fontSize:13,color:C.mid}}>Day 4 scorecard</span>
        <div style={{marginLeft:'auto'}}><SaveIndicator state={saveState[key]||'idle'}/></div>
      </div>
      <div style={{...card,background:TLIGHT[player?.teamId],border:`1px solid ${TCOL[player?.teamId]}33`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:C.dark}}>{player?.name||'Player'}</div>
            <div style={{marginTop:4}}><TeamPill tid={player?.teamId} size="md"/></div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:10,color:C.mid,fontWeight:500}}>PLAYING HCP</div>
            <div style={{fontSize:28,fontWeight:700,color:TCOL[player?.teamId]}}>{ph??'—'}</div>
            <div style={{fontSize:11,color:C.mid}}>H.I. {player?.hi??'—'}</div>
          </div>
        </div>
      </div>

      {[{label:'Front 9',start:0,end:9},{label:'Back 9',start:9,end:18}].map(({label,start,end})=>{
        const sHoles=tee.holes.slice(start,end);
        const gross=sHoles.reduce((a,_,i)=>{const s=raw[start+i];return s!=null?a+(s as number):a;},0);
        const filled=sHoles.every((_,i)=>raw[start+i]!=null);
        const sPar=sHoles.reduce((a,h)=>a+h.par,0);
        return (
          <div key={label} style={{...card,padding:0,overflow:'hidden',marginBottom:'1rem'}}>
            <div style={{background:C.dark,padding:'8px 12px',display:'grid',
              gridTemplateColumns:ph!==null?'70px 28px 24px 1fr 1fr':'70px 28px 24px 1fr',
              gap:4,alignItems:'center'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.gold}}>{label}</div>
              <div style={{fontSize:10,color:'#4B5563',textAlign:'center'}}>Par</div>
              <div style={{fontSize:10,color:'#4B5563',textAlign:'center'}}>SI</div>
              <div style={{fontSize:10,color:TCOL[player?.teamId],textAlign:'center',fontWeight:600}}>Gross</div>
              {ph!==null&&<div style={{fontSize:10,color:'#4B5563',textAlign:'center'}}>Net</div>}
            </div>
            {sHoles.map((hole,idx)=>{
              const hi=start+idx;
              const s=raw[hi] as number|null;
              const net=s!=null&&ph!==null?s-shotsOnHole(ph,hole.si):null;
              const diff=s!=null?s-hole.par:null;
              const netDiff=net!==null?net-hole.par:null;
              const bg=diff==null?'transparent':diff<=-2?C.engNavy:diff===-1?C.pakGreen:diff===0?'transparent':diff===1?'#EF4444':'#991B1B';
              const fc=diff==null||diff===0?C.dark:C.white;
              const br=diff!=null&&diff<=-1?'50%':'6px';
              const shots=ph!==null?shotsOnHole(ph,hole.si):0;
              return (
                <div key={hi} style={{display:'grid',
                  gridTemplateColumns:ph!==null?'70px 28px 24px 1fr 1fr':'70px 28px 24px 1fr',
                  gap:4,alignItems:'center',background:idx%2===0?C.white:'#F9FAFB',
                  borderTop:`1px solid ${C.border}`,minHeight:48,padding:'2px 4px'}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.dark,paddingLeft:8,display:'flex',alignItems:'center',gap:4}}>
                    H{hi+1}
                    {shots>0&&<span style={{fontSize:8,color:TCOL[player?.teamId],fontWeight:700}}>{shots>1?`+${shots}`:'+'}▸</span>}
                  </div>
                  <div style={{fontSize:12,color:C.mid,textAlign:'center'}}>{hole.par}</div>
                  <div style={{fontSize:11,color:'#4B5563',textAlign:'center'}}>{hole.si}</div>
                  <div style={{display:'flex',justifyContent:'center',padding:'4px'}}>
                    <input type="number" inputMode="numeric" min={1} max={15} value={s??''} onChange={e=>setScore(hi,e.target.value)}
                      style={{width:42,height:38,textAlign:'center',border:`1.5px solid ${diff!=null&&diff!==0?bg:C.border}`,borderRadius:br,fontSize:16,fontWeight:700,background:bg,color:fc,padding:0,outline:'none'}}/>
                  </div>
                  {ph!==null&&<div style={{textAlign:'center',fontSize:13,fontWeight:netDiff!==0?600:400,color:netDiff!=null&&netDiff<0?C.pakGreen:netDiff!=null&&netDiff>0?C.red:C.mid}}>{net!==null?net:'—'}</div>}
                </div>
              );
            })}
            <div style={{display:'grid',
              gridTemplateColumns:ph!==null?'70px 28px 24px 1fr 1fr':'70px 28px 24px 1fr',
              gap:4,background:'#F3F4F6',borderTop:`2px solid ${C.border}`,padding:'6px 4px',alignItems:'center'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.mid,paddingLeft:8}}>{start===0?'Out':'In'}</div>
              <div style={{fontSize:11,fontWeight:600,color:C.mid,textAlign:'center'}}>{sPar}</div>
              <div/>
              <div style={{textAlign:'center',fontSize:14,fontWeight:700,color:filled?C.dark:'#D1D5DB'}}>{filled?gross:'—'}</div>
              {ph!==null&&<div style={{textAlign:'center',fontSize:13,color:C.mid}}>{filled?gross-sHoles.reduce((a,_,i)=>a+shotsOnHole(ph,sHoles[i].si),0):'—'}</div>}
            </div>
          </div>
        );
      })}

      {tot>0&&(
        <div style={{...card,background:C.goldLight,border:`1px solid ${C.gold}44`}}>
          <div style={{fontSize:11,fontWeight:700,color:C.gold,letterSpacing:'0.08em',marginBottom:10}}>TOTALS</div>
          <div style={{display:'flex',gap:8}}>
            {[
              {lbl:'Out',val:raw.slice(0,9).reduce((a:number,s)=>s!=null?a+(s as number):a,0),filled:raw.slice(0,9).every(s=>s!=null),diff:null as number|null},
              {lbl:'In',val:raw.slice(9).reduce((a:number,s)=>s!=null?a+(s as number):a,0),filled:raw.slice(9).every(s=>s!=null),diff:null as number|null},
              {lbl:'Gross',val:tot,filled:true,diff:tot-parTot},
              ...(netTot!==null?[{lbl:'Net',val:netTot,filled:true,diff:netTot-parTot}]:[]),
            ].map(({lbl,val,filled,diff})=>(
              <div key={lbl} style={{flex:1,background:C.white,borderRadius:10,padding:'0.6rem',textAlign:'center',border:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.mid,marginBottom:3,fontWeight:500}}>{lbl}</div>
                <div style={{fontSize:20,fontWeight:700,color:filled?C.dark:'#D1D5DB'}}>{filled?val:'—'}</div>
                {diff!==null&&filled&&<div style={{fontSize:10,color:diff<0?C.pakGreen:diff>0?C.red:C.mid,marginTop:2,fontWeight:600}}>{diff>0?`+${diff}`:diff===0?'E':diff}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────
export default function App() {
  const [ready,setReady]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [activeYear,setActiveYear]=useState<number|null>(null);
  const [allYears,setAllYears]=useState<number[]>([]);
  const [completedTournaments,setCompletedTournaments]=useState<CompletedTournament[]>([]);
  const [setupDone,setSetupDone]=useState(false);
  const [players,setPlayers]=useState<Player[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [pairings,setPairings]=useState<Pairing[]>([]);
  const [scores,setScores]=useState<Record<string,(number|null)[]>>({});
  const [nav,setNav]=useState<'home'|'today'|'scores'|'more'|'setup'|'d4'>('home');
  const [activeDay,setActiveDay]=useState(1);
  const [scoringMatch,setScoringMatch]=useState<{day:number;mid:string}|null>(null);
  const [scoringCard,setScoringCard]=useState<{day:number;pid:string}|null>(null);
  const [savingPairings,setSavingPairings]=useState(false);
  const [showEndModal,setShowEndModal]=useState(false);

  const fetchJson=async(url:string)=>{const r=await fetch(url);if(!r.ok)throw new Error(`${url} → ${r.status}`);return r.json();};

  const loadYear=async(year:number)=>{
    const [pl,co,pa,sc]=await Promise.all([
      fetchJson(`/api/players?year=${year}`),
      fetchJson(`/api/courses?year=${year}`),
      fetchJson(`/api/pairings?year=${year}`),
      fetchJson(`/api/scores?year=${year}`),
    ]);
    setPlayers(pl); setCourses(co); setPairings(pa); setScores(sc);
    setSetupDone(pl.some((p:Player)=>p.name!==''));
    setReady(true);
  };

  const loadIndex=useCallback(async()=>{
    setLoadError(null);
    try {
      const [res,completed]=await Promise.all([fetchJson('/api/setup'),fetchJson('/api/completed')]);
      const dbYears=new Set((completed as CompletedTournament[]).map(r=>r.year));
      const merged=[...SEED_HISTORY.filter(s=>!dbYears.has(s.year)),...(completed as CompletedTournament[])].sort((a,b)=>b.year-a.year);
      setCompletedTournaments(merged);
      setAllYears(res.years||[]);
      if(res.activeYear){setActiveYear(res.activeYear);await loadYear(res.activeYear);}
      else setReady(true);
    } catch(e:unknown){setLoadError(e instanceof Error?e.message:String(e));}
  },[]);

  useEffect(()=>{loadIndex();},[loadIndex]);

  const startYear=async(year:number)=>{
    setReady(false);
    await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year})});
    setActiveYear(year);
    setAllYears(prev=>prev.includes(year)?prev:[...prev,year].sort((a,b)=>b-a));
    await loadYear(year);
    setNav('setup');
  };
  const switchYear=async(year:number)=>{
    setReady(false);
    await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year})});
    setActiveYear(year);
    await loadYear(year);
    setNav('home');
  };
  const saveScore=async(key:string,holes:(number|null)[])=>{
    if(!activeYear) return;
    await fetch('/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:activeYear,key,holes})});
    setScores(prev=>({...prev,[key]:holes}));
  };
  const savePairings=async(day:number)=>{
    if(!activeYear) return;
    setSavingPairings(true);
    const dm=pairings.filter(p=>p.day===day);
    await fetch('/api/pairings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:activeYear,pairings:dm})});
    setSavingPairings(false);
  };
  const handleEndComplete=async()=>{
    setShowEndModal(false);
    const completed=await fetchJson('/api/completed');
    const dbYears=new Set((completed as CompletedTournament[]).map((r:CompletedTournament)=>r.year));
    const merged=[...SEED_HISTORY.filter(s=>!dbYears.has(s.year)),...(completed as CompletedTournament[])].sort((a:CompletedTournament,b:CompletedTournament)=>b.year-a.year);
    setCompletedTournaments(merged);
    setNav('home');
  };

  if(loadError) return (
    <div style={{maxWidth:480,margin:'0 auto',padding:'2rem 1rem'}}>
      <div style={{background:C.redLight,border:`1px solid ${C.red}44`,borderRadius:12,padding:'1.25rem'}}>
        <div style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:8}}>Failed to load</div>
        <div style={{fontSize:12,color:C.mid,fontFamily:'monospace',background:'#F9FAFB',padding:'0.75rem',borderRadius:8,marginBottom:'1rem',wordBreak:'break-all' as const,whiteSpace:'pre-wrap' as const}}>{loadError}</div>
        <Btn label="Retry" primary onClick={loadIndex}/>
      </div>
    </div>
  );
  if(!ready) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',flexDirection:'column',gap:12}}>
      <Shield size={48}/>
      <div style={{fontSize:13,color:C.mid}}>Loading…</div>
    </div>
  );

  // Sub-views that overlay the main nav
  if(scoringMatch) return (
    <div style={{maxWidth:480,margin:'0 auto',padding:'0 1rem 5rem'}}>
      <div style={{paddingTop:'0.75rem',paddingBottom:'0.75rem',marginBottom:'0.75rem'}}>
        <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:'0.08em'}}>JINNAH-ATTLEE SHIELD · {activeYear}</div>
      </div>
      <ScoreEntry day={scoringMatch.day} matchId={scoringMatch.mid} pairings={pairings} players={players}
        course={courses.find(c=>c.day===scoringMatch.day)!} scores={scores} onSave={saveScore}
        onBack={()=>setScoringMatch(null)}/>
    </div>
  );
  if(scoringCard) return (
    <div style={{maxWidth:480,margin:'0 auto',padding:'0 1rem 5rem'}}>
      <div style={{paddingTop:'0.75rem',paddingBottom:'0.75rem',marginBottom:'0.75rem'}}>
        <div style={{fontSize:11,color:C.gold,fontWeight:700,letterSpacing:'0.08em'}}>JINNAH-ATTLEE SHIELD · {activeYear}</div>
      </div>
      <Scorecard day={scoringCard.day} pid={scoringCard.pid} players={players}
        course={courses.find(c=>c.day===scoringCard.day)!} scores={scores} onBack={()=>setScoringCard(null)}/>
    </div>
  );


  // Main nav
  const DAYS=[1,2,3,4];
  return (
    <div style={{maxWidth:480,margin:'0 auto',paddingBottom:'5rem'}}>
      {/* Header */}
      <div style={{background:C.dark,padding:'0.75rem 1rem',position:'sticky',top:0,zIndex:20,borderBottom:`1px solid rgba(255,255,255,0.08)`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <Shield size={28}/>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:C.white,lineHeight:1}}>Jinnah-Attlee Shield</div>
              {activeYear&&<div style={{fontSize:10,color:C.gold}}>{activeYear}</div>}
            </div>
          </div>
          {setupDone&&(
            <div style={{display:'flex',gap:2}}>
              {DAYS.map(d=>(
                <button key={d} onClick={()=>{if(d===4){setNav('d4');}else{setActiveDay(d);setNav('today');}}}
                  style={{padding:'5px 10px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                    border:(nav==='today'&&activeDay===d)||(nav==='d4'&&d===4)?'none':'1px solid rgba(255,255,255,0.15)',
                    background:(nav==='today'&&activeDay===d)||(nav==='d4'&&d===4)?C.gold:'transparent',
                    color:(nav==='today'&&activeDay===d)||(nav==='d4'&&d===4)?C.dark:'#E5E7EB'}}>
                  D{d}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{padding:'0 1rem'}}>
        <div style={{height:'1rem'}}/>
        {nav==='home'&&<Home setupDone={setupDone} activeYear={activeYear} allYears={allYears} completedTournaments={completedTournaments}
        liveScore={setupDone&&courses.length>0?(()=>{
          const d=activeDay||1; const course=courses.find(c=>c.day===d);
          if(!course) return null;
          let a=0,b=0,hp=0;
          pairings.filter(m=>m.day===d).forEach(m=>{
            const res=getResults(d,m,players,course,scores);
            if(d===2){const{A,B}=d2TotalPts(res);a+=A;b+=B;}
            else{const pts=matchPts(matchStat(res));a+=pts.A;b+=pts.B;}
            const played=res.filter(r=>r!=null).length; if(played>hp)hp=played;
          });
          return{A:a,B:b,holesPlayed:hp};
        })():null}
        onStartYear={startYear} onSwitchYear={switchYear} onSetup={()=>setNav('setup')} onPlay={()=>{setActiveDay(1);setNav('today');}}/>}
        {nav==='today'&&setupDone&&<Today day={activeDay} players={players} courses={courses} pairings={pairings} scores={scores} onSelectMatch={mid=>setScoringMatch({day:activeDay,mid})} onSelectCard={pid=>setScoringCard({day:activeDay,pid})}/>}
        {nav==='scores'&&setupDone&&<Leaderboard players={players} courses={courses} pairings={pairings} scores={scores} onEndTournament={()=>setShowEndModal(true)}/>}
        {nav==='d4'&&setupDone&&<Day4View players={players} courses={courses} scores={scores} onSave={saveScore}/>}
        {nav==='more'&&<More activeYear={activeYear} allYears={allYears} players={players} courses={courses} pairings={pairings} setPairings={setPairings} scores={scores} setupDone={setupDone} onSetup={()=>setNav('setup')} onStartYear={startYear} onSwitchYear={switchYear} onEndTournament={()=>setShowEndModal(true)} onSaveMatches={savePairings} savingPairings={savingPairings}/>}
        {nav==='setup'&&activeYear&&<Setup onBack={()=>setNav('home')} year={activeYear} onDone={()=>{setSetupDone(true);loadYear(activeYear);setNav('today');}} initPlayers={players} initCourses={courses} alreadyDone={setupDone}/>}
      </div>

      {/* Bottom nav */}
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:C.white,borderTop:`1px solid ${C.border}`,display:'flex',zIndex:20,maxWidth:480,margin:'0 auto'}}>
        {[
          {k:'home' as const,icon:'⌂',label:'Home'},
          {k:'today' as const,icon:'⛳',label:'Today'},
          {k:'scores' as const,icon:'◉',label:'Live'},
          {k:'more' as const,icon:'···',label:'More'},
        ].map(({k,icon,label})=>{
          const active=nav===k||(k==='today'&&nav==='today');
          const showPairingBtn=k==='today'&&active&&setupDone;
          return (
            <div key={k} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
              <button onClick={()=>{if(k==='today'&&!activeDay)setActiveDay(1);setNav(k);}}
                style={{flex:1,width:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'8px 4px 4px',background:'none',border:'none',cursor:'pointer',gap:2}}>
                <span style={{fontSize:18,color:active?C.dark:'#9CA3AF'}}>{icon}</span>
                <span style={{fontSize:9,fontWeight:active?700:400,color:active?C.dark:'#9CA3AF',letterSpacing:'0.02em'}}>{label}</span>
              </button>

            </div>
          );
        })}
      </div>

      {showEndModal&&activeYear&&<EndTournamentModal year={activeYear} players={players} courses={courses} pairings={pairings} scores={scores} onClose={()=>setShowEndModal(false)} onComplete={handleEndComplete}/>}
    </div>
  );
}
