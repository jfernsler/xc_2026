import { useState, useMemo, useRef } from "react";
import _ from "lodash";

const NORTH=["Crescenta Valley High School","Newbury Park High School","Heritage Oak School MTN Bike Team","Conejo Composite East","Antelope Valley Composite","Santa Clarita Valley Composite Private","Santa Clarita Valley Composite Public","Orcutt Mountain Bike Composite","Santa Monica Mountains Composite","Saugus High School","St. Francis High School","Tehachapi Composite MTN Bike Team"];
const CENTRAL=["Foothill Composite","Glendora MTB","Woodcrest Christian High School","North Orange County Composite","Yucaipa High School","Claremont High School","Claremont Composite","Damien High School","Foothill High School","San Gabriel Mountains Composite","El Modena High School","Santa Clarita Valley Composite Private","Independent Central"];
const SOUTH=["Murrieta Valley High School","Temecula Valley High School","Vista Murrieta High School","Murrieta Mesa High School","Temescal Canyon High School","North County Composite","Great Oak High School","Independent South"];
const RM={};
NORTH.forEach(t=>{RM[t.toUpperCase()]="North";});
CENTRAL.forEach(t=>{RM[t.toUpperCase()]="Central";});
SOUTH.forEach(t=>{RM[t.toUpperCase()]="South";});
const SP={varsity:575,jv2:540,jv1:500,freshman:500,ms:500};

function rp(place,cat){
  const s=SP[(cat||"freshman").toLowerCase()]||500;
  if(place<1)return 0;
  let p=s,d=10,c=1,m=1;
  for(let i=2;i<=place;i++){p-=d;c++;if(c>m){d=Math.max(d-1,1);m++;c=1;}}
  return Math.max(p,0);
}

function pt(s){
  if(!s||typeof s!=="string")return null;
  s=s.trim();
  if(!s||s.toUpperCase()==="DNF"||s.toUpperCase()==="DNS")return null;
  const p=s.split(":");
  let r=0;
  if(p.length===3)r=parseFloat(p[0])*3600+parseFloat(p[1])*60+parseFloat(p[2]);
  else if(p.length===2)r=parseFloat(p[0])*60+parseFloat(p[1]);
  else r=parseFloat(p[0]);
  return isNaN(r)?null:r;
}

function ft(s){
  if(s==null)return"--";
  const h=Math.floor(s/3600);
  const m=Math.floor((s%3600)/60);
  const sc=(s%60).toFixed(1);
  if(h>0)return h+":"+String(m).padStart(2,"0")+":"+sc.padStart(4,"0");
  return m+":"+sc.padStart(4,"0");
}

function fd(s){
  if(s==null)return"--";
  return(s>=0?"+":"-")+ft(Math.abs(s));
}

function dc(c){
  if(!c)return"freshman";
  const l=c.toLowerCase();
  if(l.includes("varsity"))return"varsity";
  if(l.includes("jv2")||l.includes("jv 2"))return"jv2";
  if(l.includes("jv1")||l.includes("jv 1"))return"jv1";
  return"freshman";
}

function parseCSV(text){
  const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
  if(!lines.length)return[];
  let si=0;
  if(lines[0].toLowerCase().includes("race")&&lines[0].toLowerCase().includes("name"))si=1;
  const rows=[];
  for(let i=si;i<lines.length;i++){
    const c=lines[i].split(",");
    if(c.length<10)continue;
    const grade=(c[1]||"").trim().toLowerCase();
    const catRaw=(c[2]||"").trim();
    const cat=grade==="ms"?"ms":dc(catRaw);
    const team=(c[6]||"").trim();
    rows.push({
      id:c[0]+"-"+c[3]+"-"+c[4]+"-"+i,
      race:parseInt(c[0])||1,grade:grade,category:cat,categoryRaw:catRaw,
      gender:catRaw.toLowerCase().includes("girl")?"girls":"boys",
      place:parseInt(c[3])||999,
      number:(c[4]||"").trim(),name:(c[5]||"").trim(),
      team:team,teamUpper:team.toUpperCase(),
      region:RM[team.toUpperCase()]||"Other",
      lapsCompleted:(c[8]||"").trim(),
      lap1:pt(c[9]),lap2:pt(c[10]),lap3:pt(c[11]),
      totalTime:pt(c[14]),penalty:(c[13]||"").trim()
    });
  }
  return rows;
}

function computeTeamScore(riders,ov){
  if(!ov)ov={};
  const scored=riders.filter(function(r){return r.team&&r.totalTime!=null;}).map(function(r){
    const pl=ov[r.id]!=null?ov[r.id]:r.place;
    return Object.assign({},r,{pts:rp(pl,r.category),effPlace:pl});
  }).filter(function(r){return r.pts>0;});
  const boys=_.sortBy(scored.filter(function(r){return r.gender==="boys";}),function(r){return -r.pts;});
  const girls=_.sortBy(scored.filter(function(r){return r.gender==="girls";}),function(r){return -r.pts;});
  let best={total:0,roster:[],bc:0,gc:0};
  for(let nb=0;nb<=Math.min(8,boys.length,6);nb++){
    const ng=Math.min(8-nb,girls.length,6);
    const pick=boys.slice(0,nb).concat(girls.slice(0,ng));
    const total=_.sumBy(pick,"pts");
    if(total>best.total)best={total:total,roster:pick,bc:nb,gc:ng};
  }
  return best;
}

function allTS(data,ov){
  if(!ov)ov={};
  const hs=data.filter(function(r){return r.grade==="hs"&&r.team;});
  const groups=_.groupBy(hs,"team");
  return _.sortBy(Object.entries(groups).map(function(entry){
    const team=entry[0];
    const riders=entry[1];
    const res=computeTeamScore(riders,ov);
    const ids=new Set(res.roster.map(function(r){return r.id;}));
    return{team:team,region:RM[team.toUpperCase()]||"Other",total:res.total,roster:res.roster,bc:res.bc,gc:res.gc,riderCount:riders.length,rosterIds:ids};
  }),function(r){return -r.total;});
}

function findMoves(rawData,targetTeam,rivalTeam,overtakeThreshold,scenarioData){
  var ov={};
  Object.values(scenarioData).forEach(function(arr){arr.forEach(function(r){ov[r.id]=r.scenarioPlace;});});
  var scores=allTS(rawData,ov);
  var ts=scores.find(function(t){return t.team===targetTeam;});
  var rs=scores.find(function(t){return t.team===rivalTeam;});
  if(!ts||!rs)return{gap:0,moves:[],tp:0,rp2:0};
  var gap=rs.total-ts.total;
  var hs=rawData.filter(function(r){return r.grade==="hs"&&r.totalTime!=null;});
  var byCat=_.groupBy(hs,"categoryRaw");
  var moves=[];
  Object.entries(byCat).forEach(function(entry){
    var cat=entry[0];
    var riders=entry[1];
    var sorted=_.sortBy(riders.map(function(r){var o=ov[r.id];return o!=null?Object.assign({},r,{place:o}):r;}),"place");
    for(var i=0;i<sorted.length;i++){
      var r=sorted[i];
      if(r.team!==targetTeam&&r.team!==rivalTeam)continue;
      if(r.team===targetTeam){
        for(var j=0;j<i;j++){
          var above=sorted[j];
          var tg=r.totalTime-above.totalTime;
          if(tg>overtakeThreshold||tg<=0)continue;
          var oldPts=rp(r.place,r.category);
          var newPts=rp(above.place,r.category);
          var gain=newPts-oldPts;
          if(gain<=0)continue;
          var rivalLoss=0;
          for(var k=j;k<i;k++){if(sorted[k].team===rivalTeam)rivalLoss+=rp(sorted[k].place,sorted[k].category)-rp(sorted[k].place+1,sorted[k].category);}
          var net=gain+rivalLoss;
          if(net>0)moves.push({type:"advance",cat:cat,rider:r,target:above,posFrom:r.place,posTo:above.place,timeNeeded:tg,gain:gain,rivalLoss:rivalLoss,netSwing:net,efficiency:net/Math.max(tg,0.1),withinThreshold:tg<=overtakeThreshold,team:targetTeam,positions:i-j});
        }
      }
      if(r.team===rivalTeam){
        for(var k2=i+1;k2<sorted.length&&k2<=i+8;k2++){
          if(sorted[k2].team===targetTeam){
            var tGap=sorted[k2].totalTime-r.totalTime;
            if(tGap>overtakeThreshold||tGap<=0)break;
            var tGain=rp(r.place,sorted[k2].category)-rp(sorted[k2].place,sorted[k2].category);
            var rLoss=rp(r.place,r.category)-rp(sorted[k2].place,r.category);
            if(tGain+rLoss>0)moves.push({type:"overtake_rival",cat:cat,rider:sorted[k2],target:r,posFrom:sorted[k2].place,posTo:r.place,timeNeeded:tGap,gain:tGain,rivalLoss:rLoss,netSwing:tGain+rLoss,efficiency:(tGain+rLoss)/Math.max(tGap,0.1),withinThreshold:tGap<=overtakeThreshold,team:targetTeam,positions:k2-i});
            break;
          }
        }
      }
    }
  });
  var unique=_.uniqBy(_.sortBy(moves,function(m){return -m.efficiency;}),function(m){return m.rider.id+"-"+m.posTo;});
  return{gap:gap,moves:unique,tp:ts.total,rp2:rs.total};
}

var rc=function(r){return r==="North"?"text-blue-400":r==="Central"?"text-amber-400":r==="South"?"text-green-400":"text-gray-500";};
var rcBar=function(r){return r==="North"?"bg-blue-500":r==="Central"?"bg-amber-500":r==="South"?"bg-green-500":"bg-gray-500";};

function GapChart(props){
  var riders=props.riders;
  var hlTeam=props.hl;
  var v=(riders||[]).filter(function(r){return r.totalTime!=null;});
  if(v.length<2)return null;
  var ld=v[0].totalTime;
  var mx=v[v.length-1].totalTime-ld;
  if(mx<=0)return null;
  return(
    <div className="mt-1 mb-2">
      <div className="space-y-0.5">{v.slice(0,25).map(function(r){
        var gap=r.totalTime-ld;
        var pct=(gap/mx)*100;
        var h=hlTeam&&r.team===hlTeam;
        return(
          <div key={r.id} className={"flex items-center gap-1 text-xs "+(h?"bg-indigo-950/60 rounded":"")}>
            <span className="w-5 text-right text-gray-600">{r.place}</span>
            <span className={"w-24 truncate "+(h?"text-indigo-300 font-bold":"text-gray-400")}>{r.name}</span>
            <div className="flex-1 h-3 bg-gray-800 rounded relative">
              <div className={"h-3 rounded opacity-70 "+(h?"bg-indigo-500":rcBar(r.region))} style={{width:Math.max(pct,0.5)+"%"}}/>
              <span className="absolute right-1 top-0 text-gray-500" style={{fontSize:"9px",lineHeight:"12px"}}>{fd(gap)}</span>
            </div>
          </div>
        );
      })}</div>
    </div>
  );
}

function LapAnalysis(props){
  var riders=props.riders;
  var hlTeam=props.hl;
  var wl=(riders||[]).filter(function(r){return r.lap1!=null&&r.lap2!=null;});
  if(!wl.length)return null;
  var con=wl.map(function(r){
    var laps=[r.lap1,r.lap2,r.lap3].filter(function(l){return l!=null;});
    if(laps.length<2)return null;
    var avg=_.mean(laps);
    return Object.assign({},r,{laps:laps,avg:avg,variance:_.mean(laps.map(function(l){return Math.abs(l-avg);}))});
  }).filter(Boolean);
  var tight=_.sortBy(con,"variance").slice(0,6);
  var fade=_.sortBy(wl.map(function(r){return Object.assign({},r,{fade:r.lap2-r.lap1});}),function(r){return -r.fade;}).slice(0,4);
  var neg=_.sortBy(wl.map(function(r){return Object.assign({},r,{split:r.lap1-r.lap2});}),function(r){return -r.split;}).slice(0,4);
  var HN=function(r){return <span className={"w-24 truncate "+(hlTeam&&r.team===hlTeam?"text-indigo-300 font-bold":"")}>{r.name}</span>;};
  return(
    <div className="mt-2 space-y-2 text-xs">
      <div>
        <div className="font-semibold text-gray-500 mb-0.5">🎯 Consistent</div>
        {tight.map(function(r,i){return <div key={i} className="flex gap-2"><span className="text-gray-600 w-4">{i+1}.</span>{HN(r)}<span className="text-gray-500">±{r.variance.toFixed(1)}s</span></div>;})}
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-0.5">📉 Fade</div>
        {fade.map(function(r,i){return <div key={i} className="flex gap-2"><span className="text-gray-600 w-4">{i+1}.</span>{HN(r)}<span className="text-red-400">+{ft(r.fade)}</span></div>;})}
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-0.5">📈 Neg Split</div>
        {neg.map(function(r,i){return <div key={i} className="flex gap-2"><span className="text-gray-600 w-4">{i+1}.</span>{HN(r)}<span className="text-green-400">-{ft(r.split)}</span></div>;})}
      </div>
    </div>
  );
}

export default function App(){
  const [rawData,setRawData]=useState([]);
  const [tab,setTab]=useState("results");
  const [fR,setFR]=useState("All");
  const [fT,setFT]=useState("All");
  const [fC,setFC]=useState("All");
  const [fRace,setFRace]=useState("All");
  const [fG,setFG]=useState("All");
  const [threshold,setThreshold]=useState(30);
  const [hl,setHl]=useState(null);
  const [sCats,setSCats]=useState([]);
  const [sData,setSData]=useState({});
  const [sRegion,setSRegion]=useState("All");
  const [opTarget,setOpTarget]=useState("");
  const [opRival,setOpRival]=useState("");
  const [opThreshold,setOpThreshold]=useState(10);
  const [selectedMoves,setSelectedMoves]=useState(new Set());
  const [reportText,setReportText]=useState("");
  const fileRef=useRef();

  var handleFile=function(e){
    var f=e.target.files[0];
    if(!f)return;
    var r=new FileReader();
    r.onload=function(ev){setRawData(parseCSV(ev.target.result));setTab("results");};
    r.readAsText(f);
  };

  var gf=useMemo(function(){return fG==="All"?rawData:rawData.filter(function(r){return r.grade===fG;});},[rawData,fG]);
  var teams=useMemo(function(){return _.sortBy(_.uniq(gf.map(function(r){return r.team;})).filter(Boolean));},[gf]);
  var cats=useMemo(function(){return _.sortBy(_.uniq(gf.map(function(r){return r.categoryRaw;})).filter(Boolean));},[gf]);
  var races=useMemo(function(){return _.sortBy(_.uniq(gf.map(function(r){return r.race;})));},[gf]);
  var grades=useMemo(function(){return _.sortBy(_.uniq(rawData.map(function(r){return r.grade;})).filter(Boolean));},[rawData]);

  var filtered=useMemo(function(){
    var d=gf;
    if(fR!=="All")d=d.filter(function(r){return r.region===fR;});
    if(fT!=="All")d=d.filter(function(r){return r.team===fT;});
    if(fC!=="All")d=d.filter(function(r){return r.categoryRaw===fC;});
    if(fRace!=="All")d=d.filter(function(r){return r.race===parseInt(fRace);});
    return _.sortBy(d,["race","categoryRaw","place"]);
  },[gf,fR,fT,fC,fRace]);

  var scenOv=useMemo(function(){
    var o={};
    Object.values(sData).forEach(function(arr){arr.forEach(function(r){o[r.id]=r.scenarioPlace;});});
    return o;
  },[sData]);

  var tScores=useMemo(function(){return allTS(rawData,scenOv);},[rawData,scenOv]);
  var scoringIds=useMemo(function(){var s=new Set();tScores.forEach(function(t){t.rosterIds.forEach(function(id){s.add(id);});});return s;},[tScores]);
  var origScores=useMemo(function(){return allTS(rawData);},[rawData]);
  var origMap=useMemo(function(){var m={};origScores.forEach(function(t){m[t.team]=t.total;});return m;},[origScores]);

  var toggleCat=function(cat){
    if(sCats.includes(cat)){
      setSCats(function(p){return p.filter(function(c){return c!==cat;});});
      setSData(function(p){var n=Object.assign({},p);delete n[cat];return n;});
    } else {
      var riders=rawData.filter(function(r){return r.categoryRaw===cat&&r.totalTime!=null;});
      var sorted=_.sortBy(riders,"place").map(function(r,i){
        return Object.assign({},r,{scenarioPlace:i+1,originalPlace:r.place,originalPoints:rp(r.place,r.category),scenarioPoints:rp(i+1,r.category)});
      });
      setSCats(function(p){return p.concat([cat]);});
      setSData(function(p){var n=Object.assign({},p);n[cat]=sorted;return n;});
    }
  };

  var moveRider=function(cat,idx,dir){
    var riders=sData[cat].slice();
    var ti=idx+dir;
    if(ti<0||ti>=riders.length)return;
    var tmp=riders[idx];
    riders[idx]=riders[ti];
    riders[ti]=tmp;
    riders.forEach(function(r,i){r.scenarioPlace=i+1;r.scenarioPoints=rp(i+1,r.category);});
    setSData(function(p){var n=Object.assign({},p);n[cat]=riders;return n;});
  };

  var resetScenario=function(){setSCats([]);setSData({});};

  var currentChanges=useMemo(function(){
    var changes=[];
    Object.entries(sData).forEach(function(entry){
      var cat=entry[0];
      var riders=entry[1];
      riders.forEach(function(r){
        if(r.scenarioPlace!==r.originalPlace){
          var makeup=null;
          if(r.scenarioPlace<r.originalPlace){
            var orig=rawData.filter(function(x){return x.categoryRaw===cat&&x.totalTime!=null;});
            var sorted=_.sortBy(orig,"place");
            var targetR=sorted[r.scenarioPlace-1];
            if(targetR&&r.totalTime)makeup=r.totalTime-targetR.totalTime;
          }
          changes.push({cat:cat,name:r.name,team:r.team,from:r.originalPlace,to:r.scenarioPlace,delta:r.scenarioPoints-r.originalPoints,makeup:makeup});
        }
      });
    });
    return changes;
  },[sData,rawData]);

  var opResults=useMemo(function(){
    if(!opTarget||!opRival||opTarget===opRival)return null;
    return findMoves(rawData,opTarget,opRival,opThreshold,sData);
  },[rawData,opTarget,opRival,opThreshold,sData]);

  var selectedSwing=useMemo(function(){
    if(!opResults)return 0;
    return opResults.moves.filter(function(_,i){return selectedMoves.has(i);}).reduce(function(s,m){return s+m.netSwing;},0);
  },[opResults,selectedMoves]);

  var toggleMove=function(i){
    setSelectedMoves(function(p){var n=new Set(p);if(n.has(i))n.delete(i);else n.add(i);return n;});
  };

  var sendToScenario=function(){
    if(!opResults)return;
    var selected=opResults.moves.filter(function(_,i){return selectedMoves.has(i);});
    if(!selected.length)return;
    var catMoves={};
    selected.forEach(function(m){if(!catMoves[m.cat])catMoves[m.cat]=[];catMoves[m.cat].push(m);});
    var newSData=Object.assign({},sData);
    var newSCats=sCats.slice();
    Object.entries(catMoves).forEach(function(entry){
      var cat=entry[0];
      var moves=entry[1];
      if(!newSCats.includes(cat)){
        var riders=rawData.filter(function(r){return r.categoryRaw===cat&&r.totalTime!=null;});
        var sorted=_.sortBy(riders,"place").map(function(r,i){
          return Object.assign({},r,{scenarioPlace:i+1,originalPlace:r.place,originalPoints:rp(r.place,r.category),scenarioPoints:rp(i+1,r.category)});
        });
        newSData[cat]=sorted;
        newSCats.push(cat);
      }
      var catRiders=newSData[cat].slice();
      moves.forEach(function(m){
        var fromIdx=catRiders.findIndex(function(r){return r.id===m.rider.id;});
        var toIdx=catRiders.findIndex(function(r){return r.scenarioPlace===m.posTo;});
        if(fromIdx<0||toIdx<0||fromIdx===toIdx)return;
        var moved=catRiders.splice(fromIdx,1)[0];
        catRiders.splice(toIdx,0,moved);
        catRiders.forEach(function(r,i){r.scenarioPlace=i+1;r.scenarioPoints=rp(i+1,r.category);});
      });
      newSData[cat]=catRiders;
    });
    setSCats(newSCats);
    setSData(newSData);
    setTab("scenario");
  };

  var generateReport=function(){
    var L=[];
    L.push("# Race Scenario Analysis Report");
    L.push("Threshold: "+threshold+"s | Overtake threshold: "+opThreshold+"s");
    if(sCats.length)L.push("Scenario categories: "+sCats.join(", "));
    if(currentChanges.length){
      L.push("\n## Scenario Changes ("+currentChanges.length+"):");
      currentChanges.forEach(function(c){
        L.push("- ["+c.cat+"] "+c.name+" ("+c.team+") P"+c.from+"->P"+c.to+" | "+(c.delta>=0?"+":"")+c.delta+"pts"+(c.makeup!=null?" | Makeup: "+c.makeup.toFixed(1)+"s":""));
      });
    }
    L.push("\n## Team Standings:");
    var display=tScores;
    if(sRegion!=="All")display=display.filter(function(t){return t.region===sRegion;});
    display.forEach(function(t,i){
      var op=origMap[t.team]||0;
      var d=t.total-op;
      L.push((i+1)+". "+t.team+" ("+t.region+"): "+t.total+"pts"+(d?" ("+(d>0?"+":"")+d+")":"")+" ["+t.bc+"B+"+t.gc+"G]");
    });
    if(opResults&&opTarget&&opRival){
      L.push("\n## Overtake Plan: "+opTarget+" vs "+opRival);
      L.push("Gap: "+opResults.gap+"pts ("+opResults.tp+" vs "+opResults.rp2+")");
      var sel=opResults.moves.filter(function(_,i){return selectedMoves.has(i);});
      if(sel.length){
        L.push("\nSelected moves ("+sel.length+"):");
        sel.forEach(function(m,i){L.push((i+1)+". ["+m.cat+"] "+m.rider.name+" P"+m.posFrom+"->P"+m.posTo+" | "+m.timeNeeded.toFixed(1)+"s | +"+m.gain+" gain, -"+m.rivalLoss+" rival | net "+m.netSwing);});
        L.push("Total selected swing: "+selectedSwing+"pts "+(selectedSwing>=opResults.gap?"OVERTAKE":"(gap: "+opResults.gap+")"));
      }
      L.push("\nAll ranked moves:");
      opResults.moves.slice(0,20).forEach(function(m,i){L.push((i+1)+". ["+m.cat+"] "+m.rider.name+" P"+m.posFrom+"->P"+m.posTo+" | "+m.timeNeeded.toFixed(1)+"s | net "+m.netSwing+"pts | eff "+m.efficiency.toFixed(2)+"pts/s");});
    }
    L.push("\n---\nPaste into LLM with team strategy goals.");
    setReportText(L.join("\n"));
    setTab("report");
  };

  var isHL=function(r){return hl&&r.team===hl;};
  var hlR=function(r){return isHL(r)?"bg-indigo-950/40":"";};
  var hlN=function(r){return isHL(r)?"text-indigo-300 font-bold":"";};
  var isSc=function(r){return scoringIds.has(r.id);};

  var ScoringDot=function(props){
    return isSc(props.r)?<span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5" title="Scoring"/>:null;
  };

  var HLBar=function(){return(
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">Highlight:</span>
      <select value={hl||""} onChange={function(e){setHl(e.target.value||null);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white max-w-48">
        <option value="">None</option>
        {teams.map(function(t){return <option key={t} value={t}>{t}</option>;})}
      </select>
      {hl&&<button onClick={function(){setHl(null);}} className="text-xs text-gray-500 hover:text-gray-300">✕</button>}
      {hl&&<span className="text-xs text-indigo-400">● {hl}</span>}
    </div>
  );};

  var FiltersComp=function(){return(
    <div className="space-y-2 mb-3">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={fG} onChange={function(e){setFG(e.target.value);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
          <option value="All">All Grades</option>
          {grades.map(function(g){return <option key={g} value={g}>{g.toUpperCase()}</option>;})}
        </select>
        <select value={fR} onChange={function(e){setFR(e.target.value);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
          <option value="All">All Regions</option><option>North</option><option>Central</option><option>South</option><option>Other</option>
        </select>
        <select value={fT} onChange={function(e){setFT(e.target.value);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
          <option value="All">All Teams</option>
          {teams.map(function(t){return <option key={t} value={t}>{t}</option>;})}
        </select>
        <select value={fC} onChange={function(e){setFC(e.target.value);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
          <option value="All">All Categories</option>
          {cats.map(function(c){return <option key={c} value={c}>{c}</option>;})}
        </select>
        {races.length>1&&<select value={fRace} onChange={function(e){setFRace(e.target.value);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
          <option value="All">All Races</option>
          {races.map(function(r){return <option key={r} value={r}>{"Race "+r}</option>;})}
        </select>}
      </div>
      <HLBar/>
    </div>
  );};

  var TABS=[["results","📊 Results"],["teams","🏆 Teams"],["planner","🎯 Overtake"],["scenario","🔀 Scenario"],["analysis","📈 Analysis"],["report","📋 Report"]];

  return(
    <div className="min-h-screen bg-gray-950 text-gray-100 p-3" style={{fontFamily:"system-ui,sans-serif"}}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-xl font-bold text-white">🚴 Race Scenario Analyzer</h1>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400">
              Threshold:
              <input type="number" value={threshold} onChange={function(e){setThreshold(parseInt(e.target.value)||0);}} className="ml-1 w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"/>s
            </label>
            <button onClick={function(){fileRef.current.click();}} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium">Load CSV</button>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden"/>
          </div>
        </div>

        {/* Tabs */}
        {rawData.length>0&&<div className="flex gap-1.5 mb-3 flex-wrap">
          {TABS.map(function(pair){
            var k=pair[0],v=pair[1];
            return <button key={k} onClick={function(){setTab(k);}} className={"px-3 py-1 rounded text-sm font-medium transition "+(tab===k?"bg-indigo-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700")}>{v}</button>;
          })}
        </div>}

        {!rawData.length&&<div className="text-center py-20 text-gray-500"><p className="text-lg mb-2">Load a race CSV to begin</p></div>}

        {/* ===== RESULTS ===== */}
        {tab==="results"&&rawData.length>0&&<div>
          <FiltersComp/>
          {Object.entries(_.groupBy(filtered,"categoryRaw")).map(function(entry){
            var cat=entry[0],riders=entry[1];
            return(
              <div key={cat} className="mb-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-white">{cat} <span className="text-gray-500 font-normal text-xs">({riders.length})</span></h2>
                  <button onClick={function(){toggleCat(cat);setTab("scenario");}} className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded">🔀</button>
                </div>
                <GapChart riders={riders} hl={hl}/>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b border-gray-800">
                    <th className="py-1 px-1 text-left">P</th><th className="py-1 px-1 text-left">Name</th><th className="py-1 px-1 text-left">Team</th>
                    <th className="py-1 px-1 text-center">Rgn</th><th className="py-1 px-1 text-right">Pts</th>
                    <th className="py-1 px-1 text-right">L1</th><th className="py-1 px-1 text-right">L2</th><th className="py-1 px-1 text-right">L3</th>
                    <th className="py-1 px-1 text-right">Total</th><th className="py-1 px-1 text-right">Gap</th>
                  </tr></thead><tbody>
                    {riders.map(function(r,i){
                      var pg=i>0&&riders[i-1].totalTime&&r.totalTime?r.totalTime-riders[i-1].totalTime:0;
                      return(
                        <tr key={r.id} className={"border-b border-gray-900 hover:bg-gray-900/50 "+hlR(r)}>
                          <td className="py-1 px-1 font-mono">{r.place}</td>
                          <td className={"py-1 px-1 font-medium "+hlN(r)}><ScoringDot r={r}/>{r.name}</td>
                          <td className={"py-1 px-1 max-w-32 truncate "+(isHL(r)?"text-indigo-300":"text-gray-400")} title={r.team}>{r.team||"—"}</td>
                          <td className={"py-1 px-1 text-center "+rc(r.region)}>{r.region[0]}</td>
                          <td className="py-1 px-1 text-right font-mono">{rp(r.place,r.category)}</td>
                          <td className="py-1 px-1 text-right font-mono text-gray-500">{ft(r.lap1)}</td>
                          <td className="py-1 px-1 text-right font-mono text-gray-500">{ft(r.lap2)}</td>
                          <td className="py-1 px-1 text-right font-mono text-gray-500">{ft(r.lap3)}</td>
                          <td className="py-1 px-1 text-right font-mono font-medium">{ft(r.totalTime)}</td>
                          <td className="py-1 px-1 text-right font-mono text-gray-600">{i>0&&pg>0?<span className={pg<=threshold?"text-yellow-400":""}>{pg.toFixed(1)}s</span>:""}</td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
              </div>
            );
          })}
        </div>}

        {/* ===== TEAMS ===== */}
        {tab==="teams"&&<div>
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <select value={fR} onChange={function(e){setFR(e.target.value);}} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
              <option value="All">All Regions</option><option>North</option><option>Central</option><option>South</option><option>Other</option>
            </select>
            <HLBar/>
          </div>
          <div className="text-xs text-gray-500 mb-3">Top 8/team, max 6/gender. <span className="text-emerald-400">●</span> = scoring</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tScores.filter(function(t){return fR==="All"||t.region===fR;}).map(function(t,i){
              var h=hl===t.team;
              return(
                <div key={t.team} onClick={function(){setHl(h?null:t.team);}}
                  className={"bg-gray-900 rounded p-3 border cursor-pointer transition "+(h?"border-indigo-500 ring-1 ring-indigo-500/30":"border-gray-800 hover:border-gray-700")}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-gray-600 text-xs">#{i+1}</span>
                      <h3 className={"text-sm font-bold leading-tight "+(h?"text-indigo-300":"")}>{t.team}</h3>
                      <span className={"text-xs "+rc(t.region)}>{t.region}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{t.total}</div>
                      <div style={{fontSize:"10px"}} className="text-gray-500">{t.bc}B+{t.gc}G</div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-0.5" style={{fontSize:"10px"}}>
                    {_.sortBy(t.roster,function(r){return -r.pts;}).map(function(r,j){
                      return(
                        <div key={j} className="flex justify-between text-gray-400">
                          <span className="truncate flex-1"><span className={r.gender==="girls"?"text-pink-400":"text-sky-400"}>{r.gender[0].toUpperCase()}</span> {r.name}</span>
                          <span className="ml-1 text-gray-600 truncate max-w-20">{r.categoryRaw}</span>
                          <span className="ml-1 font-mono">{r.pts}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>}

        {/* ===== OVERTAKE PLANNER ===== */}
        {tab==="planner"&&<div>
          <div className="bg-gray-900 rounded border border-gray-800 p-4 mb-4">
            <h2 className="text-sm font-bold text-white mb-3">🎯 Overtake Planner</h2>
            <div className="flex gap-3 flex-wrap items-end mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Your Team</label>
                <select value={opTarget} onChange={function(e){setOpTarget(e.target.value);setHl(e.target.value||null);setSelectedMoves(new Set());}}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white min-w-48">
                  <option value="">Select...</option>
                  {teams.map(function(t){return <option key={t} value={t}>{t}</option>;})}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Rival Team</label>
                <select value={opRival} onChange={function(e){setOpRival(e.target.value);setSelectedMoves(new Set());}}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white min-w-48">
                  <option value="">Select...</option>
                  {teams.map(function(t){return <option key={t} value={t}>{t}</option>;})}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Overtake Threshold</label>
                <div className="flex items-center gap-1">
                  <input type="number" value={opThreshold} onChange={function(e){setOpThreshold(parseInt(e.target.value)||0);}}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"/>
                  <span className="text-xs text-gray-500">s</span>
                </div>
              </div>
            </div>

            {opResults&&<div>
              <div className={"flex items-center gap-4 p-3 rounded mb-4 "+(opResults.gap>0?"bg-red-950/30 border border-red-900/50":"bg-green-950/30 border border-green-900/50")}>
                <div>
                  <div className="text-xs text-gray-400">Point Gap</div>
                  <div className={"text-2xl font-bold "+(opResults.gap>0?"text-red-400":"text-green-400")}>{opResults.gap>0?"-":"+"}{Math.abs(opResults.gap)}</div>
                </div>
                <div className="text-xs space-y-1">
                  <div><span className="text-indigo-300">{opTarget}</span>: <span className="font-mono font-bold">{opResults.tp}</span></div>
                  <div><span className="text-red-300">{opRival}</span>: <span className="font-mono font-bold">{opResults.rp2}</span></div>
                </div>
                {selectedMoves.size>0&&<div className="ml-auto text-right">
                  <div className="text-xs text-gray-400">Selected swing</div>
                  <div className={"text-xl font-bold "+(selectedSwing>=opResults.gap&&opResults.gap>0?"text-green-400":"text-yellow-400")}>+{selectedSwing}</div>
                  {selectedSwing>=opResults.gap&&opResults.gap>0&&<div className="text-green-400 text-xs font-bold">✓ OVERTAKE</div>}
                </div>}
                {opResults.gap<=0&&<div className="text-green-400 text-sm font-bold ml-auto">✓ Already ahead!</div>}
              </div>

              {selectedMoves.size>0&&<div className="flex gap-2 mb-3">
                <button onClick={sendToScenario} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium">🔀 Send to Scenario</button>
                <button onClick={function(){setSelectedMoves(new Set());}} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">Clear Selection ({selectedMoves.size})</button>
                <button onClick={generateReport} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm">📋 Report</button>
              </div>}

              {opResults.moves.length>0&&<div>
                <div className="text-xs text-gray-500 mb-2" style={{fontSize:"10px"}}>
                  Click rows to select. <span className="text-emerald-400">●</span> scoring
                  <span className="text-yellow-400 ml-2">⚡</span> within {opThreshold}s
                </div>
                <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b border-gray-800">
                  <th className="py-1 px-1 w-6"></th><th className="py-1 px-1 text-left">Category</th>
                  <th className="py-1 px-1 text-left">Rider</th><th className="py-1 px-1 text-left">Move</th>
                  <th className="py-1 px-1 text-right">Time</th><th className="py-1 px-1 text-right">Gain</th>
                  <th className="py-1 px-1 text-right">Rival</th><th className="py-1 px-1 text-right">Net</th>
                  <th className="py-1 px-1 text-right">Eff</th>
                </tr></thead><tbody>
                  {opResults.moves.map(function(m,i){
                    var sel=selectedMoves.has(i);
                    var hasSel=selectedMoves.size>0;
                    var dimmed=hasSel&&!sel;
                    return(
                      <tr key={i} onClick={function(){toggleMove(i);}}
                        className={"border-b border-gray-900 cursor-pointer transition "+(sel?"bg-indigo-950/60 border-l-2 border-indigo-500":dimmed?"opacity-30":"hover:bg-gray-800/50")}>
                        <td className="py-1 px-1 text-center">{sel?<span className="text-indigo-400">✓</span>:<span className="text-gray-700">○</span>}</td>
                        <td className="py-1 px-1 text-gray-300">{m.cat}</td>
                        <td className="py-1 px-1">
                          {isSc(m.rider)&&<span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5"/>}
                          <span className="text-indigo-300">{m.rider.name}</span>
                          {m.type==="overtake_rival"&&<span className="text-gray-500 ml-1">→<span className="text-red-300 ml-0.5">{m.target.name}</span></span>}
                        </td>
                        <td className="py-1 px-1 font-mono">P{m.posFrom}→P{m.posTo}</td>
                        <td className={"py-1 px-1 text-right font-mono "+(m.withinThreshold?"text-yellow-400 font-bold":"text-gray-400")}>{m.timeNeeded.toFixed(1)}s{m.withinThreshold?" ⚡":""}</td>
                        <td className="py-1 px-1 text-right font-mono text-green-400">+{m.gain}</td>
                        <td className="py-1 px-1 text-right font-mono text-red-400">{m.rivalLoss>0?"-"+m.rivalLoss:"0"}</td>
                        <td className="py-1 px-1 text-right font-mono font-bold text-white">{m.netSwing}</td>
                        <td className="py-1 px-1 text-right font-mono text-gray-400">{m.efficiency.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody></table>

                {selectedMoves.size>0&&<div className="mt-4 bg-gray-800/50 rounded p-3">
                  <h3 className="text-xs font-bold text-gray-300 mb-2">Selected Moves Impact</h3>
                  <div className="space-y-1">{(function(){
                    var cum=0;
                    var selMoves=opResults.moves.filter(function(_,i){return selectedMoves.has(i);});
                    return selMoves.map(function(m,i){
                      cum+=m.netSwing;
                      var ot=cum>=opResults.gap&&opResults.gap>0;
                      return(
                        <div key={i} className={"flex items-center gap-2 text-xs "+(ot?"bg-green-950/40 rounded p-1":"")}>
                          <span className="w-24 truncate">{m.rider.name}</span>
                          <span className="font-mono text-gray-400 w-12">{m.timeNeeded.toFixed(1)}s</span>
                          <div className="flex-1 h-3 bg-gray-900 rounded relative">
                            <div className={"h-3 rounded "+(cum>=opResults.gap?"bg-green-600":"bg-indigo-600")}
                              style={{width:(opResults.gap>0?Math.min((cum/opResults.gap)*100,100):100)+"%"}}/>
                          </div>
                          <span className="font-mono font-bold w-10 text-right">{cum>=0?"+":""}{cum}</span>
                          <span className="text-gray-600 w-10 text-right">/{opResults.gap}</span>
                          {ot&&<span className="text-green-400 font-bold" style={{fontSize:"10px"}}>✓</span>}
                        </div>
                      );
                    });
                  })()}</div>
                </div>}
              </div>}

              {opResults.moves.length===0&&opResults.gap>0&&<div className="text-center py-6 text-gray-500">
                No moves found within {opThreshold}s. Try increasing the overtake threshold.</div>}
            </div>}
          </div>
        </div>}

        {/* ===== SCENARIO ===== */}
        {tab==="scenario"&&<div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs text-gray-400">Categories:</span>
            {cats.map(function(c){
              return <button key={c} onClick={function(){toggleCat(c);}}
                className={"text-xs px-2 py-1 rounded transition "+(sCats.includes(c)?"bg-purple-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700")}>{c}</button>;
            })}
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-gray-400">Region:</span>
            {["All","North","Central","South"].map(function(r){
              return <button key={r} onClick={function(){setSRegion(r);}}
                className={"text-xs px-2 py-1 rounded "+(sRegion===r?"bg-gray-600 text-white":"bg-gray-800 text-gray-500")}>{r}</button>;
            })}
            <div className="flex-1"/>
            <HLBar/>
            {sCats.length>0&&<span>
              <button onClick={resetScenario} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded mr-1">Reset</button>
              <button onClick={generateReport} className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded">📋 Report</button>
            </span>}
          </div>

          {!sCats.length&&<div className="text-center py-10 text-gray-500">Select categories or use Overtake Planner → Send to Scenario</div>}

          {sCats.length>0&&<div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-1 space-y-3">
              {/* Team leaderboard */}
              <div className="bg-gray-900 rounded border border-gray-800 p-3">
                <div className="text-xs font-bold text-gray-300 mb-2">🏆 Teams {sRegion!=="All"?"("+sRegion+")":""}</div>
                <div className="mb-1" style={{fontSize:"10px"}}><span className="text-emerald-400">●</span><span className="text-gray-600"> = scoring rider</span></div>
                <div className="space-y-1">{(function(){
                  var display=sRegion!=="All"?tScores.filter(function(t){return t.region===sRegion;}):tScores;
                  var origDisplay=sRegion!=="All"?origScores.filter(function(t){return t.region===sRegion;}):origScores;
                  var origRank={};
                  origDisplay.forEach(function(t,i){origRank[t.team]=i+1;});
                  return display.map(function(t,i){
                    var or2=origRank[t.team]||999;
                    var op=origMap[t.team]||0;
                    var rkC=or2-(i+1);
                    var ptD=t.total-op;
                    var h=hl===t.team;
                    return(
                      <div key={t.team} onClick={function(){setHl(h?null:t.team);}}
                        className={"flex items-center gap-1 text-xs p-1 rounded cursor-pointer transition "+(h?"bg-indigo-950/80 border border-indigo-700":"hover:bg-gray-800")}>
                        <span className="w-4 text-right font-bold text-gray-400">{i+1}</span>
                        {rkC!==0?<span className={"w-5 "+(rkC>0?"text-green-400":"text-red-400")} style={{fontSize:"10px"}}>{rkC>0?"▲":"▼"}{Math.abs(rkC)}</span>:<span className="w-5"/>}
                        <span className={"flex-1 truncate "+(h?"text-indigo-300 font-bold":rc(t.region))}>{t.team}</span>
                        <span className="font-mono font-bold">{t.total}</span>
                        {ptD!==0&&<span className={"font-mono "+(ptD>0?"text-green-400":"text-red-400")} style={{fontSize:"10px"}}>{ptD>0?"+":""}{ptD}</span>}
                      </div>
                    );
                  });
                })()}</div>
              </div>

              {/* Current changes */}
              {currentChanges.length>0&&<div className="bg-gray-900 rounded border border-gray-800 p-2">
                <div className="text-xs font-semibold text-gray-400 mb-1">Changes ({currentChanges.length})</div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto" style={{fontSize:"10px"}}>
                  {currentChanges.map(function(c,i){
                    return(
                      <div key={i} className="flex gap-1 flex-wrap">
                        <span className="text-gray-600">[{c.cat.split(" ")[0]}]</span>
                        <span>{c.name}</span>
                        <span className="text-gray-500">P{c.from}→P{c.to}</span>
                        <span className={c.delta>0?"text-green-400":c.delta<0?"text-red-400":"text-gray-600"}>{c.delta>0?"+":""}{c.delta}pts</span>
                        {c.makeup!=null&&<span className="text-yellow-400">{c.makeup.toFixed(1)}s</span>}
                      </div>
                    );
                  })}
                </div>
              </div>}
            </div>

            {/* Category tables */}
            <div className="lg:col-span-3 space-y-4">
              {sCats.map(function(cat){
                var riders=sData[cat]||[];
                return(
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-sm font-bold text-white">{cat}</h2>
                      <button onClick={function(){toggleCat(cat);}} className="text-gray-500 hover:text-gray-300" style={{fontSize:"10px"}}>✕</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b border-gray-800">
                        <th className="py-1 px-0.5 w-12">Mv</th><th className="py-1 px-0.5 text-left">P</th><th className="py-1 px-0.5 text-left">Og</th>
                        <th className="py-1 px-0.5 text-left">Name</th><th className="py-1 px-0.5 text-left">Team</th>
                        <th className="py-1 px-0.5 text-center">G</th><th className="py-1 px-0.5 text-right">Pts</th>
                        <th className="py-1 px-0.5 text-right">Og</th><th className="py-1 px-0.5 text-right">Δ</th>
                        <th className="py-1 px-0.5 text-right">Time</th><th className="py-1 px-0.5 text-right">Gap↑</th>
                        <th className="py-1 px-0.5 text-right">Makeup</th>
                      </tr></thead><tbody>
                        {riders.map(function(r,i){
                          var delta=r.scenarioPoints-r.originalPoints;
                          var moved=r.scenarioPlace!==r.originalPlace;
                          var ga=i>0&&riders[i-1].totalTime&&r.totalTime?r.totalTime-riders[i-1].totalTime:null;
                          var makeup=null;
                          if(moved&&r.scenarioPlace<r.originalPlace){
                            var origR=rawData.filter(function(x){return x.categoryRaw===cat&&x.totalTime!=null;});
                            var origS=_.sortBy(origR,"place");
                            var tgtR=origS[r.scenarioPlace-1];
                            if(tgtR&&r.totalTime)makeup=r.totalTime-tgtR.totalTime;
                          }
                          var bgClass=isHL(r)?"bg-indigo-950/40":moved?(delta>0?"bg-green-950/30":delta<0?"bg-red-950/30":"bg-yellow-950/20"):"hover:bg-gray-900/30";
                          return(
                            <tr key={r.id} className={"border-b border-gray-900 "+bgClass}>
                              <td className="py-0.5 px-0.5 text-center whitespace-nowrap">
                                <button onClick={function(){moveRider(cat,i,-1);}} disabled={i===0} className="px-0.5 hover:text-white disabled:text-gray-800 text-gray-500">▲</button>
                                <button onClick={function(){moveRider(cat,i,1);}} disabled={i===riders.length-1} className="px-0.5 hover:text-white disabled:text-gray-800 text-gray-500">▼</button>
                              </td>
                              <td className="py-0.5 px-0.5 font-mono font-bold">{r.scenarioPlace}</td>
                              <td className={"py-0.5 px-0.5 font-mono "+(moved?"text-yellow-400":"text-gray-700")}>{r.originalPlace}</td>
                              <td className={"py-0.5 px-0.5 font-medium "+hlN(r)}><ScoringDot r={r}/>{r.name}</td>
                              <td className={"py-0.5 px-0.5 max-w-20 truncate "+(isHL(r)?"text-indigo-300":rc(r.region))} title={r.team}>{r.team||"—"}</td>
                              <td className={"py-0.5 px-0.5 text-center "+(r.gender==="girls"?"text-pink-400":"text-sky-400")}>{r.gender[0].toUpperCase()}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono font-bold">{r.scenarioPoints}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono text-gray-600">{r.originalPoints}</td>
                              <td className={"py-0.5 px-0.5 text-right font-mono font-bold "+(delta>0?"text-green-400":delta<0?"text-red-400":"text-gray-700")}>{delta!==0?(delta>0?"+":"")+delta:"·"}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono text-gray-400">{ft(r.totalTime)}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono">{ga!=null&&ga>0?<span className={ga<=threshold?"text-yellow-400 font-bold":"text-gray-600"}>{ga.toFixed(1)}s</span>:""}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono">{makeup!=null?<span className="text-orange-400">-{makeup.toFixed(1)}s</span>:""}</td>
                            </tr>
                          );
                        })}
                      </tbody></table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}
        </div>}

        {/* ===== ANALYSIS ===== */}
        {tab==="analysis"&&rawData.length>0&&<div>
          <FiltersComp/>
          {(function(){
            var grouped=Object.entries(_.groupBy(filtered,"categoryRaw"));
            if(!grouped.length)return <div className="text-center py-10 text-gray-500">No data matches filters.</div>;
            return grouped.map(function(entry){
              var cat=entry[0],riders=entry[1];
              var sorted=_.sortBy(riders.filter(function(r){return r.totalTime!=null;}),"place");
              var opps=[];
              var defensive=[];
              for(var i=1;i<sorted.length;i++){
                var gap2=sorted[i].totalTime-sorted[i-1].totalTime;
                var pg=rp(sorted[i-1].place,sorted[i].category)-rp(sorted[i].place,sorted[i].category);
                if(gap2<=threshold&&gap2>0&&pg>0)opps.push({rider:sorted[i],above:sorted[i-1],gap:gap2,pg:pg});
              }
              for(var j=0;j<sorted.length-1;j++){
                if(!isSc(sorted[j]))continue;
                var dGap=sorted[j+1].totalTime-sorted[j].totalTime;
                if(dGap<=threshold&&dGap>0){
                  var loss=rp(sorted[j].place,sorted[j].category)-rp(sorted[j].place+1,sorted[j].category);
                  defensive.push({rider:sorted[j],threat:sorted[j+1],gap:dGap,loss:loss});
                }
              }
              return(
                <div key={cat} className="mb-5 bg-gray-900 rounded p-3 border border-gray-800">
                  <h2 className="text-sm font-bold text-white mb-2">{cat}</h2>
                  {opps.length>0?<div className="mb-3">
                    <div className="text-xs font-semibold text-gray-500 mb-0.5">⚡ Achievable Gains (≤{threshold}s)</div>
                    <div className="text-xs space-y-0.5">{opps.map(function(o,i){
                      return(
                        <div key={i} className={"flex gap-2 items-center flex-wrap "+(isHL(o.rider)?"bg-indigo-950/40 rounded p-0.5":"")}>
                          <span className="text-yellow-400 font-mono w-14">{o.gap.toFixed(1)}s</span>
                          <ScoringDot r={o.rider}/>
                          <span className={hlN(o.rider)}>{o.rider.name}</span>
                          <span className="text-gray-600">({o.rider.team})</span>
                          <span className="text-gray-500">→{o.above.name}</span>
                          <span className="text-green-400">+{o.pg}pts</span>
                        </div>
                      );
                    })}</div>
                  </div>:<div className="text-xs text-gray-600 mb-2">No gains within {threshold}s</div>}
                  {defensive.length>0&&<div className="mb-3">
                    <div className="text-xs font-semibold text-red-400 mb-0.5" style={{opacity:0.7}}>🛡️ Defensive — Scoring Riders Under Threat</div>
                    <div className="text-xs space-y-0.5">{defensive.map(function(d,i){
                      return(
                        <div key={i} className={"flex gap-2 items-center flex-wrap "+(isHL(d.rider)?"bg-indigo-950/40 rounded p-0.5":"")}>
                          <span className="text-red-400 font-mono w-14">{d.gap.toFixed(1)}s</span>
                          <ScoringDot r={d.rider}/>
                          <span className={hlN(d.rider)}>{d.rider.name}</span>
                          <span className="text-gray-600">({d.rider.team})</span>
                          <span className="text-gray-500">← {d.threat.name} ({d.threat.team})</span>
                          <span className="text-red-400">-{d.loss}pts risk</span>
                        </div>
                      );
                    })}</div>
                  </div>}
                  <LapAnalysis riders={riders} hl={hl}/>
                </div>
              );
            });
          })()}
        </div>}

        {/* ===== REPORT ===== */}
        {tab==="report"&&<div>
          {!reportText?<div className="text-center py-10 text-gray-500">Run a scenario or overtake plan, then generate report</div>:
          <div>
            <div className="flex gap-2 mb-3">
              <button onClick={function(){navigator.clipboard.writeText(reportText);}} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm">📋 Copy</button>
              <button onClick={function(){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([reportText],{type:"text/markdown"}));a.download="race-analysis.md";a.click();}}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">💾 Download</button>
            </div>
            <pre className="bg-gray-900 border border-gray-800 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto" style={{maxHeight:"70vh"}}>{reportText}</pre>
          </div>}
        </div>}

      </div>
    </div>
  );
}