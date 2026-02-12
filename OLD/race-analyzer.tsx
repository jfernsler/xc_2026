import { useState, useMemo, useRef } from "react";
import _ from "lodash";

const NORTH=["Crescenta Valley High School","Newbury Park High School","Heritage Oak School MTN Bike Team","Conejo Composite East","Antelope Valley Composite","Santa Clarita Valley Composite Private","Santa Clarita Valley Composite Public","Orcutt Mountain Bike Composite","Santa Monica Mountains Composite","Saugus High School","St. Francis High School","Tehachapi Composite MTN Bike Team"];
const CENTRAL=["Foothill Composite","Glendora MTB","Woodcrest Christian High School","North Orange County Composite","Yucaipa High School","Claremont High School","Claremont Composite","Damien High School","Foothill High School","San Gabriel Mountains Composite","El Modena High School","Santa Clarita Valley Composite Private","Independent Central"];
const SOUTH=["Murrieta Valley High School","Temecula Valley High School","Vista Murrieta High School","Murrieta Mesa High School","Temescal Canyon High School","North County Composite","Great Oak High School","Independent South"];
const RM={};NORTH.forEach(t=>RM[t.toUpperCase()]="North");CENTRAL.forEach(t=>RM[t.toUpperCase()]="Central");SOUTH.forEach(t=>RM[t.toUpperCase()]="South");
const SP={varsity:575,jv2:540,jv1:500,freshman:500,ms:500};

function rp(place,cat="varsity"){const s=SP[cat.toLowerCase()]||500;if(place<1)return 0;let p=s,d=10,c=1,m=1;for(let i=2;i<=place;i++){p-=d;c++;if(c>m){d=Math.max(d-1,1);m++;c=1;}}return Math.max(p,0);}
function pt(s){if(!s||typeof s!=="string")return null;s=s.trim();if(!s||s.toUpperCase()==="DNF"||s.toUpperCase()==="DNS")return null;const p=s.split(":");let r=0;if(p.length===3)r=parseFloat(p[0])*3600+parseFloat(p[1])*60+parseFloat(p[2]);else if(p.length===2)r=parseFloat(p[0])*60+parseFloat(p[1]);else r=parseFloat(p[0]);return isNaN(r)?null:r;}
function ft(s){if(s==null)return"--";const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=(s%60).toFixed(1);return h>0?`${h}:${String(m).padStart(2,"0")}:${sc.padStart(4,"0")}`:`${m}:${sc.padStart(4,"0")}`;}
function fd(s){if(s==null)return"--";return(s>=0?"+":"-")+ft(Math.abs(s));}
function dc(c){if(!c)return"freshman";const l=c.toLowerCase();if(l.includes("varsity"))return"varsity";if(l.includes("jv2")||l.includes("jv 2"))return"jv2";if(l.includes("jv1")||l.includes("jv 1"))return"jv1";return"freshman";}

function parseCSV(text){
  const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);if(!lines.length)return[];
  let si=0;if(lines[0].toLowerCase().includes("race")&&lines[0].toLowerCase().includes("name"))si=1;
  const rows=[];
  for(let i=si;i<lines.length;i++){const c=lines[i].split(",");if(c.length<10)continue;
    const grade=(c[1]||"").trim().toLowerCase(),catRaw=(c[2]||"").trim(),cat=grade==="ms"?"ms":dc(catRaw),team=(c[6]||"").trim();
    rows.push({id:`${c[0]}-${c[3]}-${c[4]}-${i}`,race:parseInt(c[0])||1,grade,category:cat,categoryRaw:catRaw,
      gender:catRaw.toLowerCase().includes("girl")?"girls":"boys",place:parseInt(c[3])||999,
      number:(c[4]||"").trim(),name:(c[5]||"").trim(),team,teamUpper:team.toUpperCase(),
      region:RM[team.toUpperCase()]||"Other",lapsCompleted:(c[8]||"").trim(),
      lap1:pt(c[9]),lap2:pt(c[10]),lap3:pt(c[11]),totalTime:pt(c[14]),penalty:(c[13]||"").trim()});}
  return rows;
}

function computeTeamScore(riders, placeOverrides={}){
  const scored=riders.filter(r=>r.team&&r.totalTime!=null).map(r=>{
    const pl=placeOverrides[r.id]!=null?placeOverrides[r.id]:r.place;
    return{...r,pts:rp(pl,r.category),effPlace:pl};
  }).filter(r=>r.pts>0);
  const boys=_.sortBy(scored.filter(r=>r.gender==="boys"),r=>-r.pts);
  const girls=_.sortBy(scored.filter(r=>r.gender==="girls"),r=>-r.pts);
  let best={total:0,roster:[],bc:0,gc:0};
  for(let nb=0;nb<=Math.min(8,boys.length,6);nb++){
    const ng=Math.min(8-nb,girls.length,6);
    const pick=[...boys.slice(0,nb),...girls.slice(0,ng)];
    const total=_.sumBy(pick,"pts");
    if(total>best.total)best={total,roster:pick,bc:nb,gc:ng};
  }
  return best;
}

function allTeamScores(data,overrides={}){
  const hs=data.filter(r=>r.grade==="hs"&&r.team);
  return _.sortBy(Object.entries(_.groupBy(hs,"team")).map(([team,riders])=>{
    const res=computeTeamScore(riders,overrides);
    return{team,region:RM[team.toUpperCase()]||"Other",total:res.total,roster:res.roster,bc:res.bc,gc:res.gc,riderCount:riders.length,rosterIds:new Set(res.roster.map(r=>r.id))};
  }),r=>-r.total);
}

const rc=r=>r==="North"?"text-blue-400":r==="Central"?"text-amber-400":r==="South"?"text-green-400":"text-gray-500";
const rcBar=r=>r==="North"?"bg-blue-500":r==="Central"?"bg-amber-500":r==="South"?"bg-green-500":"bg-gray-500";

function GapChart({riders,hl}){
  const v=(riders||[]).filter(r=>r.totalTime!=null);if(v.length<2)return null;
  const ld=v[0].totalTime,mx=v[v.length-1].totalTime-ld;if(mx<=0)return null;
  return(<div className="mt-1 mb-2"><div className="space-y-0.5">{v.slice(0,25).map(r=>{
    const gap=r.totalTime-ld,pct=(gap/mx)*100,h=hl&&r.team===hl;
    return(<div key={r.id} className={`flex items-center gap-1 text-xs ${h?"bg-indigo-950/60 rounded":""}`}>
      <span className="w-5 text-right text-gray-600">{r.place}</span>
      <span className={`w-24 truncate ${h?"text-indigo-300 font-bold":"text-gray-400"}`}>{r.name}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded relative">
        <div className={`h-3 rounded ${h?"bg-indigo-500":rcBar(r.region)} opacity-70`} style={{width:`${Math.max(pct,0.5)}%`}}/>
        <span className="absolute right-1 top-0 text-[9px] text-gray-500 leading-3">{fd(gap)}</span>
      </div></div>);})}</div></div>);
}

function LapAnalysis({riders,hl}){
  const wl=(riders||[]).filter(r=>r.lap1!=null&&r.lap2!=null);if(!wl.length)return null;
  const con=wl.map(r=>{const laps=[r.lap1,r.lap2,r.lap3].filter(l=>l!=null);if(laps.length<2)return null;const avg=_.mean(laps);return{...r,laps,avg,variance:_.mean(laps.map(l=>Math.abs(l-avg)))};}).filter(Boolean);
  const HN=({r})=><span className={`w-24 truncate ${hl&&r.team===hl?"text-indigo-300 font-bold":""}`}>{r.name}</span>;
  return(<div className="mt-2 space-y-2 text-xs">
    <div><div className="font-semibold text-gray-500 mb-0.5">🎯 Consistent</div>{_.sortBy(con,"variance").slice(0,6).map((r,i)=>(<div key={i} className="flex gap-2"><span className="text-gray-600 w-4">{i+1}.</span><HN r={r}/><span className="text-gray-500">±{r.variance.toFixed(1)}s</span></div>))}</div>
    <div><div className="font-semibold text-gray-500 mb-0.5">📉 Fade</div>{_.sortBy(wl.map(r=>({...r,fade:r.lap2-r.lap1})),r=>-r.fade).slice(0,4).map((r,i)=>(<div key={i} className="flex gap-2"><span className="text-gray-600 w-4">{i+1}.</span><HN r={r}/><span className="text-red-400">+{ft(r.fade)}</span></div>))}</div>
    <div><div className="font-semibold text-gray-500 mb-0.5">📈 Neg Split</div>{_.sortBy(wl.map(r=>({...r,split:r.lap1-r.lap2})),r=>-r.split).slice(0,4).map((r,i)=>(<div key={i} className="flex gap-2"><span className="text-gray-600 w-4">{i+1}.</span><HN r={r}/><span className="text-green-400">-{ft(r.split)}</span></div>))}</div>
  </div>);
}

// Overtake Planner
function findOvertakeMoves(rawData, targetTeam, rivalTeam, threshold, scenarioData){
  const overrides={};
  Object.values(scenarioData).flat().forEach(r=>{overrides[r.id]=r.scenarioPlace;});
  const scores=allTeamScores(rawData,overrides);
  const targetScore=scores.find(t=>t.team===targetTeam);
  const rivalScore=scores.find(t=>t.team===rivalTeam);
  if(!targetScore||!rivalScore)return{gap:0,moves:[],targetPts:0,rivalPts:0};
  const gap=rivalScore.total-targetScore.total;

  const hs=rawData.filter(r=>r.grade==="hs"&&r.totalTime!=null);
  const byCat=_.groupBy(hs,"categoryRaw");
  const moves=[];

  Object.entries(byCat).forEach(([cat,riders])=>{
    const sorted=_.sortBy(riders.map(r=>{
      const ov=overrides[r.id];return ov!=null?{...r,place:ov}:r;
    }),"place");

    for(let i=0;i<sorted.length;i++){
      const r=sorted[i];
      if(r.team!==targetTeam&&r.team!==rivalTeam)continue;

      // Look at adjacent swaps
      for(let j=0;j<sorted.length;j++){
        if(i===j)continue;
        const other=sorted[j];
        const timeGap=Math.abs(r.totalTime-other.totalTime);
        if(timeGap>threshold*3)continue; // generous search

        // What if r moves to j's position?
        if(r.team===targetTeam&&j<i){
          // target rider moves UP
          const oldPts=rp(r.place,r.category);
          const newPts=rp(other.place,r.category);
          const gain=newPts-oldPts;
          if(gain<=0)continue;
          // Check if displacing a rival rider
          let rivalLoss=0;
          for(let k=j;k<i;k++){
            if(sorted[k].team===rivalTeam){
              rivalLoss+=rp(sorted[k].place,sorted[k].category)-rp(sorted[k].place+1,sorted[k].category);
            }
          }
          // Check if this rider is/would be on scoring roster
          const netSwing=gain+rivalLoss;
          if(netSwing>0){
            moves.push({type:"advance",cat,rider:r,target:other,posFrom:r.place,posTo:other.place,
              timeNeeded:timeGap,gain,rivalLoss,netSwing,efficiency:netSwing/Math.max(timeGap,0.1),
              withinThreshold:timeGap<=threshold,team:targetTeam,positions:i-j});
          }
        }
        if(r.team===rivalTeam&&j>i){
          // rival rider falls (if someone passes them)
          // find target team riders just behind rival
          for(let k=i+1;k<=Math.min(i+5,sorted.length-1);k++){
            if(sorted[k].team===targetTeam){
              const tGap=sorted[k].totalTime-r.totalTime;
              if(tGap>threshold*2)break;
              const tGain=rp(r.place,sorted[k].category)-rp(sorted[k].place,sorted[k].category);
              const rLoss=rp(r.place,r.category)-rp(sorted[k].place,r.category);
              if(tGain+rLoss>0){
                moves.push({type:"overtake_rival",cat,rider:sorted[k],target:r,posFrom:sorted[k].place,posTo:r.place,
                  timeNeeded:tGap,gain:tGain,rivalLoss:rLoss,netSwing:tGain+rLoss,
                  efficiency:(tGain+rLoss)/Math.max(tGap,0.1),withinThreshold:tGap<=threshold,
                  team:targetTeam,positions:k-i});
              }
              break;
            }
          }
        }
      }
    }
  });

  const unique=_.uniqBy(_.sortBy(moves,m=>-m.efficiency),"rider.id");
  return{gap,moves:unique,targetPts:targetScore.total,rivalPts:rivalScore.total};
}

export default function App(){
  const[rawData,setRawData]=useState([]);
  const[tab,setTab]=useState("results");
  const[fR,setFR]=useState("All");
  const[fT,setFT]=useState("All");
  const[fC,setFC]=useState("All");
  const[fRace,setFRace]=useState("All");
  const[fG,setFG]=useState("All");
  const[threshold,setThreshold]=useState(30);
  const[hl,setHl]=useState(null);
  const[sCats,setSCats]=useState([]);
  const[sData,setSData]=useState({});
  const[sChanges,setSChanges]=useState([]);
  const[sRegion,setSRegion]=useState("All");
  // Overtake planner
  const[opTarget,setOpTarget]=useState("");
  const[opRival,setOpRival]=useState("");
  const[reportText,setReportText]=useState("");
  const fileRef=useRef();

  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setRawData(parseCSV(ev.target.result));setTab("results");};r.readAsText(f);};

  const gf=useMemo(()=>fG==="All"?rawData:rawData.filter(r=>r.grade===fG),[rawData,fG]);
  const teams=useMemo(()=>_.sortBy(_.uniq(gf.map(r=>r.team)).filter(Boolean)),[gf]);
  const cats=useMemo(()=>_.sortBy(_.uniq(gf.map(r=>r.categoryRaw)).filter(Boolean)),[gf]);
  const races=useMemo(()=>_.sortBy(_.uniq(gf.map(r=>r.race))),[gf]);
  const grades=useMemo(()=>_.sortBy(_.uniq(rawData.map(r=>r.grade)).filter(Boolean)),[rawData]);

  const filtered=useMemo(()=>{let d=gf;if(fR!=="All")d=d.filter(r=>r.region===fR);if(fT!=="All")d=d.filter(r=>r.team===fT);
    if(fC!=="All")d=d.filter(r=>r.categoryRaw===fC);if(fRace!=="All")d=d.filter(r=>r.race===parseInt(fRace));
    return _.sortBy(d,["race","categoryRaw","place"]);},[gf,fR,fT,fC,fRace]);

  // Compute scoring rosters with scenario overrides
  const scenOverrides=useMemo(()=>{const o={};Object.values(sData).flat().forEach(r=>{o[r.id]=r.scenarioPlace;});return o;},[sData]);
  const tScores=useMemo(()=>allTeamScores(rawData,scenOverrides),[rawData,scenOverrides]);
  const scoringIds=useMemo(()=>{const s=new Set();tScores.forEach(t=>t.rosterIds.forEach(id=>s.add(id)));return s;},[tScores]);
  const origScores=useMemo(()=>allTeamScores(rawData),[rawData]);
  const origScoreMap=useMemo(()=>{const m={};origScores.forEach(t=>{m[t.team]=t.total;});return m;},[origScores]);

  const toggleCat=cat=>{
    if(sCats.includes(cat)){setSCats(p=>p.filter(c=>c!==cat));setSData(p=>{const n={...p};delete n[cat];return n;});}
    else{const riders=rawData.filter(r=>r.categoryRaw===cat&&r.totalTime!=null);
      const sorted=_.sortBy(riders,"place").map((r,i)=>({...r,scenarioPlace:i+1,originalPlace:r.place,originalPoints:rp(r.place,r.category),scenarioPoints:rp(i+1,r.category)}));
      setSCats(p=>[...p,cat]);setSData(p=>({...p,[cat]:sorted}));}
  };

  const moveRider=(cat,idx,dir)=>{
    const riders=[...sData[cat]];const ti=idx+dir;if(ti<0||ti>=riders.length)return;
    const rider=riders[idx],disp=riders[ti];
    const tg=Math.abs((rider.totalTime||0)-(disp.totalTime||0));
    [riders[idx],riders[ti]]=[riders[ti],riders[idx]];
    riders.forEach((r,i)=>{r.scenarioPlace=i+1;r.scenarioPoints=rp(i+1,r.category);});
    setSData(p=>({...p,[cat]:riders}));
    setSChanges(p=>[...p,{category:cat,rider:rider.name,team:rider.team,from:rider.scenarioPlace-dir,to:rider.scenarioPlace,
      timeNeeded:tg,pointsDelta:rider.scenarioPoints-rider.originalPoints,
      displacedRider:disp.name,displacedTeam:disp.team,displacedDelta:disp.scenarioPoints-disp.originalPoints}]);
  };

  const resetScenario=()=>{setSCats([]);setSData({});setSChanges([]);};

  // Overtake planner results
  const opResults=useMemo(()=>{
    if(!opTarget||!opRival||opTarget===opRival)return null;
    return findOvertakeMoves(rawData,opTarget,opRival,threshold,sData);
  },[rawData,opTarget,opRival,threshold,sData]);

  const generateReport=()=>{
    const L=[];
    L.push("# Race Scenario Analysis Report");
    L.push(`Threshold: ${threshold}s | Categories: ${sCats.join(", ")}`);
    L.push(`\n## Changes (${sChanges.length}):`);
    sChanges.forEach((c,i)=>L.push(`${i+1}. [${c.category}] ${c.rider} (${c.team}) P${c.from}→P${c.to} | ${ft(c.timeNeeded)}${c.timeNeeded<=threshold?" ⚡":""} | ${c.pointsDelta>=0?"+":""}${c.pointsDelta}pts | Displaced: ${c.displacedRider} (${c.displacedTeam}) ${c.displacedDelta>=0?"+":""}${c.displacedDelta}pts`));
    L.push(`\n## Team Standings:`);
    let display=tScores;if(sRegion!=="All")display=display.filter(t=>t.region===sRegion);
    display.forEach((t,i)=>{const op=origScoreMap[t.team]||0;const d=t.total-op;
      L.push(`${i+1}. ${t.team} (${t.region}): ${t.total}pts${d?` (${d>0?"+":""}${d})`:""} [${t.bc}B+${t.gc}G]`);});
    L.push(`\n## Achievable Gains (≤${threshold}s):`);
    sCats.forEach(cat=>{const riders=sData[cat]||[];
      for(let i=1;i<riders.length;i++){const gap=riders[i].totalTime-riders[i-1].totalTime;
        const pg=rp(riders[i-1].scenarioPlace,riders[i].category)-rp(riders[i].scenarioPlace,riders[i].category);
        if(gap<=threshold&&gap>0&&pg>0)L.push(`- [${cat}] ${riders[i].name} (${riders[i].team}): ${gap.toFixed(1)}s→+${pg}pts`);}});
    if(opResults&&opTarget&&opRival){
      L.push(`\n## Overtake Plan: ${opTarget} vs ${opRival}`);
      L.push(`Gap: ${opResults.gap}pts (${opResults.targetPts} vs ${opResults.rivalPts})`);
      L.push(`Top moves by efficiency:`);
      opResults.moves.slice(0,15).forEach((m,i)=>L.push(`${i+1}. [${m.cat}] ${m.rider.name} P${m.posFrom}→P${m.posTo} | ${m.timeNeeded.toFixed(1)}s${m.withinThreshold?" ⚡":""} | +${m.gain}pts gain, rival -${m.rivalLoss}pts | net swing: ${m.netSwing}pts | efficiency: ${m.efficiency.toFixed(2)}pts/s`));
    }
    L.push(`\n---\nPaste into LLM with your team strategy goals.`);
    setReportText(L.join("\n"));setTab("report");
  };

  const isHL=r=>hl&&r.team===hl;
  const hlR=r=>isHL(r)?"bg-indigo-950/40":"";
  const hlN=r=>isHL(r)?"text-indigo-300 font-bold":"";
  const isScoring=r=>scoringIds.has(r.id);

  const HLBar=()=>(<div className="flex items-center gap-2 flex-wrap">
    <span className="text-xs text-gray-500">Highlight:</span>
    <select value={hl||""} onChange={e=>setHl(e.target.value||null)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white max-w-52">
      <option value="">None</option>{teams.map(t=><option key={t} value={t}>{t}</option>)}
    </select>
    {hl&&<><button onClick={()=>setHl(null)} className="text-xs text-gray-500 hover:text-gray-300">✕</button><span className="text-xs text-indigo-400">● {hl}</span></>}
  </div>);

  const Filters=()=>(<div className="space-y-2 mb-3">
    <div className="flex gap-2 flex-wrap items-center">
      <select value={fG} onChange={e=>setFG(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
        <option value="All">All Grades</option>{grades.map(g=><option key={g} value={g}>{g.toUpperCase()}</option>)}</select>
      <select value={fR} onChange={e=>setFR(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
        <option value="All">All Regions</option><option>North</option><option>Central</option><option>South</option><option>Other</option></select>
      <select value={fT} onChange={e=>setFT(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
        <option value="All">All Teams</option>{teams.map(t=><option key={t} value={t}>{t}</option>)}</select>
      <select value={fC} onChange={e=>setFC(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
        <option value="All">All Categories</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>
      {races.length>1&&<select value={fRace} onChange={e=>setFRace(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
        <option value="All">All Races</option>{races.map(r=><option key={r} value={r}>Race {r}</option>)}</select>}
    </div>
    <HLBar/>
  </div>);

  // Scoring indicator dot
  const ScoringDot=({r})=>isScoring(r)?<span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5" title="Scoring for team"/>:null;

  return(<div className="min-h-screen bg-gray-950 text-gray-100 p-3" style={{fontFamily:"system-ui,sans-serif"}}>
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-white">🚴 Race Scenario Analyzer</h1>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400">Threshold:<input type="number" value={threshold} onChange={e=>setThreshold(parseInt(e.target.value)||0)}
            className="ml-1 w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"/>s</label>
          <button onClick={()=>fileRef.current?.click()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium">Load CSV</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden"/>
        </div>
      </div>

      {rawData.length>0&&<div className="flex gap-1.5 mb-3 flex-wrap">
        {[["results","📊 Results"],["teams","🏆 Teams"],["scenario","🔀 Scenario"],["planner","🎯 Overtake"],["analysis","📈 Analysis"],["report","📋 Report"]].map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-3 py-1 rounded text-sm font-medium transition ${tab===k?"bg-indigo-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{v}</button>
        ))}
      </div>}

      {!rawData.length&&<div className="text-center py-20 text-gray-500"><p className="text-lg mb-2">Load a race CSV to begin</p></div>}

      {/* RESULTS */}
      {tab==="results"&&rawData.length>0&&<div><Filters/>
        {Object.entries(_.groupBy(filtered,"categoryRaw")).map(([cat,riders])=>(
          <div key={cat} className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-white">{cat} <span className="text-gray-500 font-normal text-xs">({riders.length})</span></h2>
              <button onClick={()=>{toggleCat(cat);setTab("scenario");}} className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded">🔀</button>
            </div>
            <GapChart riders={riders} hl={hl}/>
            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-gray-500 border-b border-gray-800">
              <th className="py-1 px-1 text-left">P</th><th className="py-1 px-1 text-left">Name</th><th className="py-1 px-1 text-left">Team</th>
              <th className="py-1 px-1 text-center">Rgn</th><th className="py-1 px-1 text-right">Pts</th><th className="py-1 px-1 text-right">L1</th>
              <th className="py-1 px-1 text-right">L2</th><th className="py-1 px-1 text-right">L3</th><th className="py-1 px-1 text-right">Total</th><th className="py-1 px-1 text-right">Gap</th>
            </tr></thead><tbody>{riders.map((r,i)=>{
              const pg=i>0&&riders[i-1].totalTime&&r.totalTime?r.totalTime-riders[i-1].totalTime:0;
              return(<tr key={r.id} className={`border-b border-gray-900 ${hlR(r)} hover:bg-gray-900/50`}>
                <td className="py-1 px-1 font-mono">{r.place}</td>
                <td className={`py-1 px-1 font-medium ${hlN(r)}`}><ScoringDot r={r}/>{r.name}</td>
                <td className={`py-1 px-1 max-w-32 truncate ${isHL(r)?"text-indigo-300":"text-gray-400"}`} title={r.team}>{r.team||"—"}</td>
                <td className={`py-1 px-1 text-center ${rc(r.region)}`}>{r.region[0]}</td>
                <td className="py-1 px-1 text-right font-mono">{rp(r.place,r.category)}</td>
                <td className="py-1 px-1 text-right font-mono text-gray-500">{ft(r.lap1)}</td>
                <td className="py-1 px-1 text-right font-mono text-gray-500">{ft(r.lap2)}</td>
                <td className="py-1 px-1 text-right font-mono text-gray-500">{ft(r.lap3)}</td>
                <td className="py-1 px-1 text-right font-mono font-medium">{ft(r.totalTime)}</td>
                <td className="py-1 px-1 text-right font-mono text-gray-600">{i>0&&pg>0?<span className={pg<=threshold?"text-yellow-400":""}>{pg.toFixed(1)}s</span>:""}</td>
              </tr>);})}</tbody></table></div></div>))}
      </div>}

      {/* TEAMS */}
      {tab==="teams"&&<div>
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <select value={fR} onChange={e=>setFR(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
            <option value="All">All Regions</option><option>North</option><option>Central</option><option>South</option><option>Other</option></select>
          <HLBar/>
        </div>
        <div className="text-xs text-gray-500 mb-3">Top 8 riders/team, max 6/gender. <span className="text-emerald-400">●</span> = scoring rider</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tScores.filter(t=>fR==="All"||t.region===fR).map((t,i)=>{const h=hl===t.team;
            return(<div key={t.team} className={`bg-gray-900 rounded p-3 border cursor-pointer transition ${h?"border-indigo-500 ring-1 ring-indigo-500/30":"border-gray-800 hover:border-gray-700"}`}
              onClick={()=>setHl(h?null:t.team)}>
              <div className="flex justify-between items-start">
                <div><span className="text-gray-600 text-xs">#{i+1}</span>
                  <h3 className={`text-sm font-bold leading-tight ${h?"text-indigo-300":""}`}>{t.team}</h3>
                  <span className={`text-xs ${rc(t.region)}`}>{t.region}</span></div>
                <div className="text-right"><div className="text-lg font-bold">{t.total}</div>
                  <div className="text-[10px] text-gray-500">{t.bc}B+{t.gc}G</div></div>
              </div>
              <div className="mt-2 text-[10px] text-gray-400 space-y-0.5">
                {_.sortBy(t.roster,r=>-r.pts).map((r,j)=>(<div key={j} className="flex justify-between">
                  <span className="truncate flex-1"><span className={r.gender==="girls"?"text-pink-400":"text-sky-400"}>{r.gender[0].toUpperCase()}</span> {r.name}</span>
                  <span className="ml-1 text-gray-600 truncate max-w-20">{r.categoryRaw}</span>
                  <span className="ml-1 font-mono">{r.pts}</span></div>))}
              </div>
            </div>);})}
        </div>
      </div>}

      {/* SCENARIO */}
      {tab==="scenario"&&<div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs text-gray-400">Categories:</span>
          {cats.map(c=>(<button key={c} onClick={()=>toggleCat(c)}
            className={`text-xs px-2 py-1 rounded transition ${sCats.includes(c)?"bg-purple-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{c}</button>))}
        </div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-400">Region:</span>
          {["All","North","Central","South"].map(r=>(<button key={r} onClick={()=>setSRegion(r)}
            className={`text-xs px-2 py-1 rounded ${sRegion===r?"bg-gray-600 text-white":"bg-gray-800 text-gray-500"}`}>{r}</button>))}
          <div className="flex-1"/><HLBar/>
          {sCats.length>0&&<>
            <button onClick={resetScenario} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded">Reset</button>
            <button onClick={generateReport} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded">📋 Report</button>
          </>}
        </div>

        {!sCats.length&&<div className="text-center py-10 text-gray-500">Select categories above</div>}

        {sCats.length>0&&<div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1 space-y-3">
            {/* Team leaderboard */}
            <div className="bg-gray-900 rounded border border-gray-800 p-3">
              <div className="text-xs font-bold text-gray-300 mb-2">🏆 Teams {sRegion!=="All"?`(${sRegion})`:""}</div>
              <div className="text-[10px] text-gray-600 mb-2"><span className="text-emerald-400">●</span> = scoring rider in tables</div>
              <div className="space-y-1">{(()=>{
                const display=sRegion!=="All"?tScores.filter(t=>t.region===sRegion):tScores;
                const origRank={};const origDisplay=sRegion!=="All"?origScores.filter(t=>t.region===sRegion):origScores;
                origDisplay.forEach((t,i)=>{origRank[t.team]=i+1;});
                return display.map((t,i)=>{
                  const or=origRank[t.team]||"—";const op=origScoreMap[t.team]||0;
                  const rkC=typeof or==="number"?or-(i+1):0;const ptD=t.total-op;const h=hl===t.team;
                  return(<div key={t.team} className={`flex items-center gap-1 text-xs p-1 rounded cursor-pointer transition ${h?"bg-indigo-950/80 border border-indigo-700":"hover:bg-gray-800"}`}
                    onClick={()=>setHl(h?null:t.team)}>
                    <span className="w-4 text-right font-bold text-gray-400">{i+1}</span>
                    {rkC!==0?<span className={`text-[10px] w-5 ${rkC>0?"text-green-400":"text-red-400"}`}>{rkC>0?"▲":"▼"}{Math.abs(rkC)}</span>:<span className="w-5"/>}
                    <span className={`flex-1 truncate ${h?"text-indigo-300 font-bold":rc(t.region)}`}>{t.team}</span>
                    <span className="font-mono font-bold">{t.total}</span>
                    {ptD!==0&&<span className={`font-mono text-[10px] ${ptD>0?"text-green-400":"text-red-400"}`}>{ptD>0?"+":""}{ptD}</span>}
                  </div>);
                });
              })()}</div>
            </div>

            {sChanges.length>0&&<div className="bg-gray-900 rounded border border-gray-800 p-2">
              <div className="flex justify-between mb-1"><span className="text-xs font-semibold text-gray-400">Log ({sChanges.length})</span>
                <button onClick={()=>setSChanges([])} className="text-[10px] text-gray-600 hover:text-gray-400">clear</button></div>
              <div className="text-[10px] space-y-0.5 max-h-40 overflow-y-auto">
                {sChanges.map((c,i)=>(<div key={i} className="flex gap-1 flex-wrap">
                  <span className="text-gray-600">#{i+1}</span>
                  <span className={c.timeNeeded<=threshold?"text-yellow-400":"text-gray-500"}>{ft(c.timeNeeded)}</span>
                  <span>{c.rider}</span><span className="text-gray-600">P{c.from}→P{c.to}</span>
                  <span className={c.pointsDelta>0?"text-green-400":c.pointsDelta<0?"text-red-400":"text-gray-600"}>{c.pointsDelta>0?"+":""}{c.pointsDelta}</span>
                </div>))}
              </div>
            </div>}
          </div>

          <div className="lg:col-span-3 space-y-4">
            {sCats.map(cat=>{const riders=sData[cat]||[];
              return(<div key={cat}>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-bold text-white">{cat}</h2>
                  <button onClick={()=>toggleCat(cat)} className="text-[10px] text-gray-500 hover:text-gray-300">✕</button>
                </div>
                <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-gray-500 border-b border-gray-800">
                  <th className="py-1 px-0.5 w-12">Mv</th><th className="py-1 px-0.5 text-left">P</th><th className="py-1 px-0.5 text-left">Og</th>
                  <th className="py-1 px-0.5 text-left">Name</th><th className="py-1 px-0.5 text-left">Team</th>
                  <th className="py-1 px-0.5 text-center">G</th><th className="py-1 px-0.5 text-right">Pts</th>
                  <th className="py-1 px-0.5 text-right">Og</th><th className="py-1 px-0.5 text-right">Δ</th>
                  <th className="py-1 px-0.5 text-right">Time</th><th className="py-1 px-0.5 text-right">Gap↑</th>
                </tr></thead><tbody>{riders.map((r,i)=>{
                  const delta=r.scenarioPoints-r.originalPoints;const moved=r.scenarioPlace!==r.originalPlace;
                  const ga=i>0&&riders[i-1].totalTime&&r.totalTime?r.totalTime-riders[i-1].totalTime:null;
                  const scoring=isScoring(r);
                  return(<tr key={r.id} className={`border-b border-gray-900 ${isHL(r)?"bg-indigo-950/40":moved?(delta>0?"bg-green-950/30":delta<0?"bg-red-950/30":"bg-yellow-950/20"):"hover:bg-gray-900/30"}`}>
                    <td className="py-0.5 px-0.5 text-center whitespace-nowrap">
                      <button onClick={()=>moveRider(cat,i,-1)} disabled={i===0} className="px-0.5 hover:text-white disabled:text-gray-800 text-gray-500">▲</button>
                      <button onClick={()=>moveRider(cat,i,1)} disabled={i===riders.length-1} className="px-0.5 hover:text-white disabled:text-gray-800 text-gray-500">▼</button>
                    </td>
                    <td className="py-0.5 px-0.5 font-mono font-bold">{r.scenarioPlace}</td>
                    <td className={`py-0.5 px-0.5 font-mono ${moved?"text-yellow-400":"text-gray-700"}`}>{r.originalPlace}</td>
                    <td className={`py-0.5 px-0.5 font-medium ${hlN(r)}`}>
                      {scoring&&<span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5" title="Scoring"/>}
                      {r.name}
                    </td>
                    <td className={`py-0.5 px-0.5 max-w-20 truncate ${isHL(r)?"text-indigo-300":rc(r.region)}`} title={r.team}>{r.team||"—"}</td>
                    <td className={`py-0.5 px-0.5 text-center ${r.gender==="girls"?"text-pink-400":"text-sky-400"}`}>{r.gender[0].toUpperCase()}</td>
                    <td className="py-0.5 px-0.5 text-right font-mono font-bold">{r.scenarioPoints}</td>
                    <td className="py-0.5 px-0.5 text-right font-mono text-gray-600">{r.originalPoints}</td>
                    <td className={`py-0.5 px-0.5 text-right font-mono font-bold ${delta>0?"text-green-400":delta<0?"text-red-400":"text-gray-700"}`}>{delta!==0?(delta>0?"+":"")+delta:"·"}</td>
                    <td className="py-0.5 px-0.5 text-right font-mono text-gray-400">{ft(r.totalTime)}</td>
                    <td className="py-0.5 px-0.5 text-right font-mono">{ga!=null&&ga>0?<span className={ga<=threshold?"text-yellow-400 font-bold":"text-gray-600"}>{ga.toFixed(1)}s</span>:""}</td>
                  </tr>);})}</tbody></table></div></div>);
            })}
          </div>
        </div>}
      </div>}

      {/* OVERTAKE PLANNER */}
      {tab==="planner"&&<div>
        <div className="bg-gray-900 rounded border border-gray-800 p-4 mb-4">
          <h2 className="text-sm font-bold text-white mb-3">🎯 Overtake Planner</h2>
          <p className="text-xs text-gray-400 mb-3">Select your team and the team you want to overtake. The planner finds the most efficient moves across all categories.</p>
          <div className="flex gap-3 flex-wrap items-end mb-3">
            <div><label className="text-xs text-gray-400 block mb-1">Your Team</label>
              <select value={opTarget} onChange={e=>{setOpTarget(e.target.value);setHl(e.target.value||null);}}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white min-w-48">
                <option value="">Select...</option>{teams.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="text-xs text-gray-400 block mb-1">Rival Team</label>
              <select value={opRival} onChange={e=>setOpRival(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white min-w-48">
                <option value="">Select...</option>{teams.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            <div className="text-xs text-gray-500">Threshold: {threshold}s</div>
          </div>

          {opResults&&<div>
            <div className={`flex items-center gap-4 p-3 rounded mb-4 ${opResults.gap>0?"bg-red-950/30 border border-red-900/50":"bg-green-950/30 border border-green-900/50"}`}>
              <div>
                <div className="text-xs text-gray-400">Point Gap</div>
                <div className={`text-2xl font-bold ${opResults.gap>0?"text-red-400":"text-green-400"}`}>{opResults.gap>0?"-":"+"}{ Math.abs(opResults.gap)}</div>
              </div>
              <div className="text-xs space-y-1">
                <div><span className="text-indigo-300">{opTarget}</span>: <span className="font-mono font-bold">{opResults.targetPts}</span></div>
                <div><span className="text-red-300">{opRival}</span>: <span className="font-mono font-bold">{opResults.rivalPts}</span></div>
              </div>
              {opResults.gap<=0&&<div className="text-green-400 text-sm font-bold">✓ Already ahead!</div>}
            </div>

            {opResults.moves.length>0&&<div>
              <h3 className="text-xs font-bold text-gray-300 mb-2">Recommended Moves (by efficiency: pts/second)</h3>
              <div className="text-[10px] text-gray-500 mb-2">
                <span className="text-emerald-400">●</span> = currently scoring | 
                <span className="text-yellow-400 ml-2">⚡</span> = within {threshold}s threshold |
                <span className="text-indigo-300 ml-2">◆</span> = your team |
                <span className="text-red-300 ml-2">◆</span> = rival
              </div>
              <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b border-gray-800">
                <th className="py-1 px-1 text-left">#</th><th className="py-1 px-1 text-left">Category</th>
                <th className="py-1 px-1 text-left">Rider</th><th className="py-1 px-1 text-left">Move</th>
                <th className="py-1 px-1 text-right">Time</th><th className="py-1 px-1 text-right">Gain</th>
                <th className="py-1 px-1 text-right">Rival Loss</th><th className="py-1 px-1 text-right">Net Swing</th>
                <th className="py-1 px-1 text-right">Eff</th>
              </tr></thead><tbody>
                {opResults.moves.slice(0,25).map((m,i)=>{
                  let cumSwing=0;opResults.moves.slice(0,i+1).forEach(x=>cumSwing+=x.netSwing);
                  const wouldOvertake=cumSwing>=opResults.gap&&opResults.gap>0;
                  return(<tr key={i} className={`border-b border-gray-900 ${m.withinThreshold?"bg-yellow-950/20":""} ${wouldOvertake&&!opResults.moves.slice(0,i).some((_,j)=>{let cs=0;opResults.moves.slice(0,j+1).forEach(x=>cs+=x.netSwing);return cs>=opResults.gap;})?"bg-green-950/40 border-l-2 border-green-500":""}`}>
                    <td className="py-1 px-1 text-gray-500">{i+1}</td>
                    <td className="py-1 px-1 text-gray-300">{m.cat}</td>
                    <td className="py-1 px-1">
                      {isScoring(m.rider)&&<span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5"/>}
                      <span className="text-indigo-300">{m.rider.name}</span>
                      {m.type==="overtake_rival"&&<span className="text-gray-500 ml-1">passes <span className="text-red-300">{m.target.name}</span></span>}
                    </td>
                    <td className="py-1 px-1 font-mono">P{m.posFrom}→P{m.posTo}</td>
                    <td className={`py-1 px-1 text-right font-mono ${m.withinThreshold?"text-yellow-400 font-bold":"text-gray-400"}`}>{m.timeNeeded.toFixed(1)}s{m.withinThreshold?" ⚡":""}</td>
                    <td className="py-1 px-1 text-right font-mono text-green-400">+{m.gain}</td>
                    <td className="py-1 px-1 text-right font-mono text-red-400">{m.rivalLoss>0?`-${m.rivalLoss}`:"0"}</td>
                    <td className="py-1 px-1 text-right font-mono font-bold text-white">{m.netSwing}</td>
                    <td className="py-1 px-1 text-right font-mono text-gray-400">{m.efficiency.toFixed(2)}</td>
                  </tr>);
                })}
              </tbody></table>

              {/* Cumulative analysis */}
              <div className="mt-4 bg-gray-800/50 rounded p-3">
                <h3 className="text-xs font-bold text-gray-300 mb-2">Cumulative Impact (if all moves executed top-down)</h3>
                <div className="space-y-1">{(()=>{
                  let cum=0;let overtaken=false;
                  return opResults.moves.slice(0,15).map((m,i)=>{
                    cum+=m.netSwing;const ot=cum>=opResults.gap&&opResults.gap>0&&!overtaken;
                    if(ot)overtaken=true;
                    return(<div key={i} className={`flex items-center gap-2 text-xs ${ot?"bg-green-950/60 rounded p-1":""}`}>
                      <span className="text-gray-500 w-4">{i+1}.</span>
                      <span className="w-24 truncate">{m.rider.name}</span>
                      <span className="font-mono text-gray-400">{m.timeNeeded.toFixed(1)}s</span>
                      <div className="flex-1 h-3 bg-gray-900 rounded relative">
                        <div className={`h-3 rounded ${cum>=opResults.gap?"bg-green-600":"bg-indigo-600"}`}
                          style={{width:`${Math.min((cum/(opResults.gap||1))*100,100)}%`}}/>
                      </div>
                      <span className="font-mono font-bold w-12 text-right">{cum>=opResults.gap?<span className="text-green-400">+{cum}</span>:<span>{cum}</span>}</span>
                      <span className="text-gray-600 w-12 text-right">/{opResults.gap}</span>
                      {ot&&<span className="text-green-400 font-bold text-[10px]">OVERTAKE!</span>}
                    </div>);
                  });
                })()}</div>
              </div>
            </div>}

            {opResults.moves.length===0&&opResults.gap>0&&<div className="text-center py-6 text-gray-500">
              No advantageous moves found. Try increasing the threshold or loading scenario categories first.</div>}
          </div>}
        </div>
      </div>}

      {/* ANALYSIS */}
      {tab==="analysis"&&rawData.length>0&&<div><Filters/>
        {Object.entries(_.groupBy(filtered,"categoryRaw")).map(([cat,riders])=>(
          <div key={cat} className="mb-5 bg-gray-900 rounded p-3 border border-gray-800">
            <h2 className="text-sm font-bold text-white mb-2">{cat}</h2>
            <div className="mb-2"><div className="text-xs font-semibold text-gray-500 mb-0.5">⚡ Achievable Gains (≤{threshold}s)</div>
              <div className="text-xs space-y-0.5">{(()=>{
                const sorted=_.sortBy(riders.filter(r=>r.totalTime!=null),"place");const opps=[];
                for(let i=1;i<sorted.length;i++){const gap=sorted[i].totalTime-sorted[i-1].totalTime;
                  const pg=rp(sorted[i-1].place,sorted[i].category)-rp(sorted[i].place,sorted[i].category);
                  if(gap<=threshold&&gap>0&&pg>0)opps.push({rider:sorted[i],above:sorted[i-1],gap,pg});}
                if(!opps.length)return<div className="text-gray-600">None</div>;
                return opps.map((o,i)=>(<div key={i} className={`flex gap-2 items-center flex-wrap ${isHL(o.rider)?"bg-indigo-950/40 rounded p-0.5":""}`}>
                  <span className="text-yellow-400 font-mono w-14">{o.gap.toFixed(1)}s</span>
                  <ScoringDot r={o.rider}/><span className={hlN(o.rider)}>{o.rider.name}</span>
                  <span className="text-gray-600">({o.rider.team})</span>
                  <span className="text-gray-500">→{o.above.name}</span><span className="text-green-400">+{o.pg}pts</span>
                </div>));})()}</div></div>
            <LapAnalysis riders={riders} hl={hl}/>
          </div>))}
      </div>}

      {/* REPORT */}
      {tab==="report"&&<div>
        {!reportText?<div className="text-center py-10 text-gray-500">Run a scenario or overtake plan, then generate report</div>:
        <div><div className="flex gap-2 mb-3">
          <button onClick={()=>navigator.clipboard.writeText(reportText)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm">📋 Copy</button>
          <button onClick={()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([reportText],{type:"text/markdown"}));a.download="race-analysis.md";a.click();}}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">💾 Download</button></div>
          <pre className="bg-gray-900 border border-gray-800 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-[70vh]">{reportText}</pre>
        </div>}
      </div>}
    </div>
  </div>);
}
