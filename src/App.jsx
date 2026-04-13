import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const USERS = ["Josh", "AJ"];
const DAY_KEYS = ["Upper A", "Lower A", "Upper B", "Lower B", "Accessory"];
const TRACK = [
  { key: "reps",     label: "Reps",     ph: "e.g. 10" },
  { key: "laps",     label: "Laps",     ph: "e.g. 3" },
  { key: "time",     label: "Time",     ph: "e.g. 45 sec" },
  { key: "distance", label: "Distance", ph: "e.g. turf length" },
];
const EX_TYPES = [
  { key: "compound",     label: "Compound" },
  { key: "isolation",   label: "Isolation" },
  { key: "carries",     label: "Carries / Distance" },
  { key: "plyometric",  label: "Plyometric / Power" },
  { key: "conditioning",label: "Cardio / Conditioning" },
];
const DAY_META = {
  "Upper A":   { day: "Mon",     sub: "Chest Priority" },
  "Lower A":   { day: "Tue",     sub: "Athletic" },
  "Upper B":   { day: "Wed",     sub: "Shoulder Priority" },
  "Lower B":   { day: "Thu",     sub: "Athletic · Power" },
  "Accessory": { day: "Fri/Sat", sub: "Solo · Accessory" },
};
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const TODAY = () => { const d = new Date(); return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const TODAYFMT = () => { const d = new Date(); return `${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
const fmtDate = str => {
  if (!str) return null;
  const [m,d,y] = str.split("/");
  const dt = new Date(2000+parseInt(y), parseInt(m)-1, parseInt(d));
  return `${DAYS[dt.getDay()]} ${m}/${d}/${y}`;
};
const copy = x => JSON.parse(JSON.stringify(x));
const uid = () => `ex_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
const roundTo = (n, step) => Math.round(n / step) * step;

// ── Calculation helpers ─────────────────────────────────────────────────────

// Epley formula with RIR adjustment
const calc1RM = (weight, reps, rir = 1) => {
  const w = parseFloat(weight), r = parseFloat(reps), ri = parseFloat(rir) ?? 1;
  if (!w || !r || w <= 0 || r <= 0) return null;
  const eff = r + ri;
  if (eff <= 1) return Math.round(w);
  return Math.round(w * (1 + eff / 30));
};

const parseRepRange = target => {
  if (!target) return null;
  const m = target.match(/(\d+)[–\-—](\d+)/);
  if (m) return { min: parseInt(m[1]), max: parseInt(m[2]) };
  const s = target.match(/^(\d+)$/);
  if (s) return { min: parseInt(s[1]), max: parseInt(s[1]) };
  return null;
};

// Set 2 suggestion — rep range is the contract.
//
// Projects set 2 reps at same weight (RIR-based fatigue drop).
// If projected reps fall BELOW range.min, drop weight to keep set 2 in range.
//
// Weight reduction uses practical fatigue %, NOT Epley inverse.
// Epley tells you what weight gives X reps FRESH — useless here since
// you're fatigued from set 1. Two compounding factors:
//   · How close to failure set 1 was (lower RIR → more fatigue → bigger drop)
//   · How many reps short of range.min the projection falls (more shortfall → bigger drop)
const calcSet2Suggestion = (weight, reps, rir, target) => {
  const w = parseFloat(weight), r = parseFloat(reps);
  if (!w || !r || r < 1) return null;
  const ri = (rir === null || rir === undefined) ? 1 : parseFloat(rir);

  const drop = ri <= 2 ? 2 : ri === 3 ? 1 : 0;
  const projectedReps = Math.round(r - drop);
  const range = parseRepRange(target);

  if (range && projectedReps < range.min) {
    const shortfall = range.min - projectedReps;
    // Base fatigue drop by how close to failure set 1 was
    const baseDrop = ri <= 0 ? 0.08 : ri <= 1 ? 0.04 : ri <= 2 ? 0.02 : 0.01;
    // Additional drop per rep short of range min
    const shortfallDrop = shortfall * 0.02;
    const totalDrop = Math.min(baseDrop + shortfallDrop, 0.20);
    const suggestedWeight = roundTo(w * (1 - totalDrop), 2.5);
    return { weight: suggestedWeight, reps: range.min, belowRange: true };
  }

  if (projectedReps < 1) return null;
  return { weight: w, reps: projectedReps, belowRange: false };
};

const calcNextSession = (weight, reps, target, exType) => {
  const range = parseRepRange(target);
  if (!range || !weight || !reps) return null;
  const w = parseFloat(weight), r = parseFloat(reps);
  if (r < range.max) return null;
  const newWeight = roundTo(w * 1.05, 2.5);
  return { weight: newWeight, reps: range.min, note: `Hit top of range (${range.max} reps) — ready to add weight` };
};

const PCTS = [95, 90, 85, 80, 75, 70, 65];

// ── Default Program ─────────────────────────────────────────────────────────

const DEFAULT_PROGRAM = {
  "Upper A": { label: "Upper A", subtitle: "Chest Priority", cardio: "15–20 min", goal: "hypertrophy", exercises: [
    { id:"UA1", name:"Incline Smith Machine Press",         sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"Lead movement, chest priority",      exType:"compound" },
    { id:"UA2", name:"Single Arm Lat Pulldown",             sets:2, hasDrop:false, trackingType:"reps", target:"10–12 ea",   notes:"Diagonal pull, controlled",          exType:"compound" },
    { id:"UA3", name:"DB Flat Press",                       sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"Wrist neutral, modify if needed",    exType:"compound" },
    { id:"UA4", name:"Bent Over Barbell Row",               sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"Standard mid back path",             exType:"compound" },
    { id:"UA5", name:"Cable Lateral Raise",                 sets:2, hasDrop:true,  trackingType:"reps", target:"12–15 ea",   notes:"Single arm, 50% drop on set 2",      exType:"isolation" },
    { id:"UA6", name:"Straight Bar Cable Tricep Pushdown",  sets:2, hasDrop:true,  trackingType:"reps", target:"10–15",      notes:"50% drop on set 2",                  exType:"isolation" },
    { id:"UA7", name:"Standing DB Bicep Curl",              sets:3, hasDrop:false, trackingType:"reps", target:"10–12",      notes:"Stay pain free",                     exType:"isolation" },
  ]},
  "Lower A": { label: "Lower A", subtitle: "Athletic", cardio: null, goal: "athletic", exercises: [
    { id:"LA1", name:"Trap Bar Deadlift",   sets:2, hasDrop:false, trackingType:"reps",     target:"6–10",              notes:"Explosive intent on the way up",         exType:"compound" },
    { id:"LA2", name:"Walking Lunges",      sets:3, hasDrop:false, trackingType:"laps",     target:"3",                 notes:"To end and back = 1 lap",                exType:"compound" },
    { id:"LA3", name:"Leg Extension",       sets:2, hasDrop:false, trackingType:"reps",     target:"12–15",             notes:"Controlled",                             exType:"isolation" },
    { id:"LA4", name:"Sled Pull + Push",    sets:2, hasDrop:false, trackingType:"distance", target:"Turf length",       notes:"Pull down, push back = 1 set",           exType:"carries" },
    { id:"LA5", name:"Suitcase Carry",      sets:2, hasDrop:false, trackingType:"distance", target:"Turf length ea side",notes:"Left hand down, right hand back",       exType:"carries" },
    { id:"LA6", name:"Abs",                 sets:3, hasDrop:false, trackingType:"reps",     target:"—",                 notes:"Your choice",                            exType:"conditioning" },
  ]},
  "Upper B": { label: "Upper B", subtitle: "Shoulder Priority", cardio: "15–20 min", goal: "hypertrophy", exercises: [
    { id:"UB1", name:"Smith Machine Shoulder Press",        sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"Lead movement",                      exType:"compound" },
    { id:"UB2", name:"Supported Bent Over DB Row",          sets:2, hasDrop:false, trackingType:"reps", target:"10–12 ea",   notes:"One hand on bench",                  exType:"compound" },
    { id:"UB3", name:"DB Lateral Raise",                    sets:2, hasDrop:true,  trackingType:"reps", target:"12–15",      notes:"50% drop on set 2",                  exType:"isolation" },
    { id:"UB4", name:"Straight Bar Lat Pulldown",           sets:2, hasDrop:false, trackingType:"reps", target:"10–12",      notes:"Full stretch at top",                exType:"compound" },
    { id:"UB5", name:"Overhead DB Tricep Extension",        sets:2, hasDrop:true,  trackingType:"reps", target:"10–12 ea",   notes:"Single arm, 50% drop",               exType:"isolation" },
    { id:"UB6", name:"Machine Preacher Curl",               sets:3, hasDrop:false, trackingType:"reps", target:"10–12",      notes:"Light, stay pain free",              exType:"isolation" },
  ]},
  "Lower B": { label: "Lower B", subtitle: "Athletic · Power Focus", cardio: null, goal: "athletic", exercises: [
    { id:"LB1", name:"Plyometric Complex",      sets:2, hasDrop:false, trackingType:"reps",     target:"3–5 loops",   notes:"Box jump → lateral bound → broad jump",  exType:"plyometric" },
    { id:"LB2", name:"Conventional Deadlift",   sets:2, hasDrop:false, trackingType:"reps",     target:"5–8",         notes:"Power intent",                           exType:"compound" },
    { id:"LB3", name:"Bulgarian Split Squat",   sets:2, hasDrop:false, trackingType:"reps",     target:"8–10 ea",     notes:"Bodyweight or light DB",                 exType:"compound" },
    { id:"LB4", name:"Seated Hamstring Curl",   sets:2, hasDrop:false, trackingType:"reps",     target:"10–12",       notes:"Controlled, full range",                 exType:"isolation" },
    { id:"LB5", name:"Farmers Carry",           sets:2, hasDrop:false, trackingType:"distance", target:"Turf length", notes:"Both hands, heavy",                      exType:"carries" },
    { id:"LB6", name:"Hanging Leg Raise",       sets:3, hasDrop:false, trackingType:"reps",     target:"10–15",       notes:"No swinging",                            exType:"conditioning" },
  ]},
  "Accessory": { label: "Accessory", subtitle: "Accessory · Injury Phase", cardio: null, goal: "hypertrophy", exercises: [
    { id:"AC1", name:"DB Lateral Raise",                          sets:2, hasDrop:true,  trackingType:"reps", target:"12–15", notes:"50% drop",             exType:"isolation" },
    { id:"AC2", name:"Cable Rear Delt Fly",                       sets:2, hasDrop:true,  trackingType:"reps", target:"12–15", notes:"Light, 50% drop",      exType:"isolation" },
    { id:"AC3", name:"JM Press / Overhead DB Tricep Extension",   sets:2, hasDrop:true,  trackingType:"reps", target:"10–12", notes:"Pain free position",   exType:"isolation" },
    { id:"AC4", name:"Hammer Curl Variation",                     sets:3, hasDrop:false, trackingType:"reps", target:"10–12", notes:"Whatever angle works", exType:"isolation" },
  ]},
};

// ── Shared styles ───────────────────────────────────────────────────────────

const inp = {
  background:"#f8f8f8", border:"1px solid #e8e8e8", borderRadius:7,
  padding:"7px 9px", color:"#0a0a0a", fontSize:13, fontFamily:"Barlow,sans-serif",
  outline:"none", width:"100%", boxSizing:"border-box",
};

// ── Small reusable components ───────────────────────────────────────────────

function Tag({ children, color, bg }) {
  return (
    <span style={{ background:bg, color, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 7px", fontSize:9, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase" }}>
      {children}
    </span>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
      <div onClick={onToggle} style={{ width:34, height:19, borderRadius:10, background:on?"#ea580c":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s", flexShrink:0 }}>
        <div style={{ position:"absolute", top:2.5, left:on?15:2.5, width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
      </div>
      <span style={{ fontSize:12, color:"#888", fontWeight:600 }}>{label}</span>
    </label>
  );
}

function makeRows(ex) {
  return Array.from({ length: ex.hasDrop ? ex.sets + 1 : ex.sets }, () => ({ bw:false, weight:"", perf:"", rir:null }));
}

// ── Firebase helpers ────────────────────────────────────────────────────────

async function fbLoadSessions(user, dayKey) {
  try {
    const snap = await getDoc(doc(db, "sessions", `${user}_${dayKey}`));
    return snap.exists() ? (snap.data().sessions || []) : [];
  } catch { return []; }
}
async function fbSaveSessions(user, dayKey, sessions) {
  try { await setDoc(doc(db, "sessions", `${user}_${dayKey}`), { sessions }); } catch(e) { console.error(e); }
}
async function fbLoadDraft(user, dayKey) {
  try {
    const snap = await getDoc(doc(db, "drafts", `${user}_${dayKey}`));
    return snap.exists() ? (snap.data().draft || {}) : {};
  } catch { return {}; }
}
async function fbSaveDraft(user, dayKey, draft) {
  try { await setDoc(doc(db, "drafts", `${user}_${dayKey}`), { draft }); } catch(e) { console.error(e); }
}
async function fbClearDraft(user, dayKey) {
  try { await setDoc(doc(db, "drafts", `${user}_${dayKey}`), { draft: {} }); } catch(e) { console.error(e); }
}
async function fbLoadProgram(user) {
  try {
    const snap = await getDoc(doc(db, "programs", user));
    return snap.exists() ? snap.data().program : copy(DEFAULT_PROGRAM);
  } catch { return copy(DEFAULT_PROGRAM); }
}
async function fbSaveProgram(user, program) {
  try { await setDoc(doc(db, "programs", user), { program }); } catch(e) { console.error(e); }
}
async function fbLoadSettings(user) {
  try {
    const snap = await getDoc(doc(db, "settings", user));
    return snap.exists() ? snap.data() : { showRIR: true };
  } catch { return { showRIR: true }; }
}
async function fbSaveSettings(user, settings) {
  try { await setDoc(doc(db, "settings", user), settings); } catch(e) { console.error(e); }
}

// ── Analysis Screen ─────────────────────────────────────────────────────────

function AnalysisScreen({ ex, sessions, onBack }) {
  const isCompound   = ex.exType === "compound";
  const isIsolation  = ex.exType === "isolation";
  const isCarries    = ex.exType === "carries";
  const isPlyometric = ex.exType === "plyometric";
  const showPercentages = !ex.exType || isCompound || isIsolation;

  const numericSets = [];
  sessions.forEach(s => {
    const e = s.entries?.[ex.id];
    if (!e?.sets) return;
    e.sets.forEach(set => {
      if (!set.bw && set.weight && set.perf) {
        numericSets.push({ date:s.date, weight:parseFloat(set.weight), reps:parseFloat(set.perf), rir:set.rir != null ? parseFloat(set.rir) : 1 });
      }
    });
  });

  let bestSet = null, best1RM = 0;
  numericSets.forEach(s => {
    const orm = calc1RM(s.weight, s.reps, s.rir);
    if (orm && orm > best1RM) { best1RM = orm; bestSet = s; }
  });

  const nextSession = bestSet ? calcNextSession(bestSet.weight, bestSet.reps, ex.target, ex.exType) : null;
  const recent = sessions.slice(-5).reverse();

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", minHeight:"100dvh", background:"#f5f5f5" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff", position:"sticky", top:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:16, fontWeight:900, color:"#0a0a0a" }}>Performance Analysis</div>
          <div style={{ fontSize:11, color:"#bbb" }}>{ex.name} · <span style={{ textTransform:"capitalize" }}>{ex.exType || "—"}</span></div>
        </div>
      </div>

      <div style={{ flex:1, padding:16, overflowY:"auto" }}>
        {!bestSet ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#bbb" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#888", marginBottom:8 }}>No data yet</div>
            <div style={{ fontSize:13 }}>Log {ex.name} with weight and reps to see your analysis.</div>
          </div>
        ) : (
          <>
            {/* Best set */}
            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>All-time best set</div>
              <div style={{ fontSize:26, fontWeight:900, color:"#0a0a0a", marginBottom:4 }}>{bestSet.weight}lbs × {bestSet.reps} reps</div>
              <div style={{ fontSize:11, color:"#bbb" }}>RIR {bestSet.rir} · {fmtDate(bestSet.date) || bestSet.date}</div>
            </div>

            {/* Percentage table with 1RM as prominent top row */}
            {showPercentages && best1RM && (
              <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Working weight targets</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {/* 1RM — full width, dark, prominent */}
                  <div style={{ gridColumn:"1/-1", background:"#0a0a0a", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:13, color:"#aaa", fontWeight:700 }}>Est. 1RM · 100%</span>
                    <span style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{best1RM}lbs</span>
                  </div>
                  {PCTS.map(pct => (
                    <div key={pct} style={{ background:"#f5f5f5", borderRadius:10, padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:13, color:"#888", fontWeight:700 }}>{pct}%</span>
                      <span style={{ fontSize:15, fontWeight:800, color:"#0a0a0a" }}>{Math.round(best1RM * pct / 100)}lbs</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progressive overload target */}
            {nextSession && (
              <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#1d4ed8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Next session target</div>
                <div style={{ fontSize:24, fontWeight:900, color:"#1d4ed8", marginBottom:4 }}>{nextSession.weight}lbs × {nextSession.reps} reps</div>
                <div style={{ fontSize:11, color:"#3b82f6" }}>{nextSession.note}</div>
              </div>
            )}

            {/* Carries note */}
            {isCarries && (
              <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Carries progression</div>
                <div style={{ fontSize:14, color:"#0a0a0a", fontWeight:600, marginBottom:4 }}>Best: {bestSet.weight}lbs for {bestSet.reps} {ex.trackingType}</div>
                <div style={{ fontSize:11, color:"#bbb" }}>Progress by adding 5–10lbs or an extra length</div>
              </div>
            )}

            {/* Plyometric note */}
            {isPlyometric && (
              <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Volume tracking</div>
                <div style={{ fontSize:14, color:"#0a0a0a", fontWeight:600, marginBottom:4 }}>Best: {bestSet.reps} {ex.trackingType}</div>
                <div style={{ fontSize:11, color:"#bbb" }}>Focus on quality and explosiveness over load</div>
              </div>
            )}

            {/* Recent sessions */}
            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Recent sessions</div>
              {recent.map((s, i) => {
                const e = s.entries?.[ex.id];
                if (!e?.sets) return null;
                const top = e.sets
                  .filter(st => st.weight && st.perf && !st.bw)
                  .sort((a,b) => parseFloat(b.weight)*parseFloat(b.perf) - parseFloat(a.weight)*parseFloat(a.perf))[0];
                if (!top) return null;
                const orm = isCompound ? calc1RM(top.weight, top.perf, top.rir != null ? top.rir : 1) : null;
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i < recent.length-1 ? "1px solid #f0f0f0" : "none" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>{top.weight}lbs × {top.perf}</div>
                      <div style={{ fontSize:11, color:"#bbb" }}>{top.rir != null ? `RIR ${top.rir} · ` : ""}{fmtDate(s.date) || s.date}</div>
                    </div>
                    {orm && <span style={{ fontSize:12, color:"#888", fontWeight:700 }}>~{orm} 1RM</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Set Row ─────────────────────────────────────────────────────────────────
// Keeps the smoother swipe implementation from the live app
// Adds RIR buttons + set 2 suggestion from the new features

function SetRow({ s, i, isDrop, track, readOnly, onUpdate, onDelete, showRIR, suggestion }) {
  const rowBg     = isDrop ? "#fffbeb" : "#f8f8f8";
  const rowBorder = isDrop ? "1px solid #fde68a" : "1px solid #e8e8e8";
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(null);
  const DELETE_W = 72;
  const isReps = track.key === "reps";

  const onTouchStart = e => {
    if (readOnly) return;
    startX.current = e.touches[0].clientX;
    setSwiping(true);
  };
  const onTouchMove = e => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -DELETE_W));
  };
  const onTouchEnd = () => {
    setSwiping(false);
    setOffset(prev => (prev < -DELETE_W / 2 ? -DELETE_W : 0));
    startX.current = null;
  };

  // Grid changes based on whether RIR is shown
  const gridCols = isReps && showRIR ? "20px 1fr 1fr 52px 56px" : "20px 1fr 1fr 56px";

  return (
    <div style={{ marginBottom: suggestion ? 2 : 6 }}>
      <div style={{ position:"relative", overflow:"hidden" }}>
        {/* Red DELETE button behind the row */}
        {!readOnly && (
          <div style={{ position:"absolute", right:0, top:0, bottom:0, width:DELETE_W, background:"#ef4444", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <button onClick={() => { setOffset(0); onDelete(); }} style={{ background:"none", border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%", height:"100%", fontFamily:"inherit" }}>DELETE</button>
          </div>
        )}

        {/* Swipeable row */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ transform:`translateX(${offset}px)`, transition:swiping?"none":"transform 0.2s ease", background:"#fff" }}
        >
          <div style={{ display:"grid", gridTemplateColumns:gridCols, gap:"0 6px", alignItems:"center", padding:"6px 0" }}>
            <div style={{ fontSize:isDrop?10:12, color:isDrop?"#92400e":"#888", fontWeight:isDrop?700:400 }}>{isDrop ? "↓" : i+1}</div>

            <div style={{ display:"flex", gap:4 }}>
              <button onClick={() => onUpdate("bw", !s.bw)} style={{ padding:"4px 6px", fontSize:11, fontWeight:800, background:s.bw?"#2563eb":"#f8f8f8", color:s.bw?"#fff":"#888", border:`1.5px solid ${s.bw?"#2563eb":"#e8e8e8"}`, borderRadius:5, cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>BW</button>
              {!s.bw && <input disabled={readOnly} value={s.weight} onChange={e=>onUpdate("weight",e.target.value)} placeholder="lbs" style={{ ...inp, padding:"5px 7px", fontSize:12, background:rowBg, border:rowBorder }} />}
            </div>

            <input disabled={readOnly} value={s.perf} onChange={e=>onUpdate("perf",e.target.value)} placeholder={track.ph} style={{ ...inp, padding:"5px 7px", fontSize:12, background:rowBg, border:rowBorder }} />

            {/* RIR dropdown */}
            {isReps && showRIR && (
              <select
                disabled={readOnly}
                value={s.rir === null || s.rir === undefined ? "" : String(s.rir)}
                onChange={e => onUpdate("rir", e.target.value === "" ? null : parseInt(e.target.value))}
                style={{ ...inp, padding:"5px 3px", fontSize:12, background:s.rir != null ? "#0a0a0a" : "#f8f8f8", color:s.rir != null ? "#fff" : "#999", border:`1px solid ${s.rir != null ? "#0a0a0a" : "#e8e8e8"}`, cursor:"pointer", borderRadius:6, textAlign:"center", appearance:"none", WebkitAppearance:"none" }}
              >
                <option value="">RIR</option>
                <option value="0">0</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5+</option>
              </select>
            )}

            <div style={{ fontSize:11, textAlign:"right", paddingLeft:2, color:s._prevIsSub?"#f59e0b":"#bbb", fontWeight:s._prevIsSub?700:400 }}>
              {(!s._prev || s._prev==="—") ? "—" : s._prevIsSub ? `↻ ${s._prev}` : s._prev}
            </div>
          </div>
        </div>
      </div>

      {/* Set 2 suggestion banner */}
      {suggestion && (
        <div style={{ background:suggestion.belowRange?"#fffbeb":"#f0fdf4", borderRadius:"0 0 7px 7px", padding:"5px 10px", fontSize:11, color:suggestion.belowRange?"#92400e":"#15803d", fontWeight:600 }}>
          {suggestion.belowRange
            ? `↓ Set ${i+2}: drop to ~${suggestion.weight}lbs × ${suggestion.reps} reps to stay in range`
            : `Set ${i+2} target: ~${suggestion.weight}lbs × ${suggestion.reps} reps`
          }
        </div>
      )}
    </div>
  );
}

// ── Exercise Log Row ────────────────────────────────────────────────────────

function ExerciseLogRow({ ex, entry, prevEntry, onChange, readOnly, sessions, onViewAnalysis, showRIR }) {
  const [open, setOpen] = useState(false);
  const track    = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  const sets     = entry?.sets || makeRows(ex);
  const isSub    = entry?.isSub || false;
  const subName  = entry?.subName || "";
  const logged   = sets.some(s => s.bw || s.weight || s.perf);
  const prevSets = prevEntry?.sets || [];
  const prevIsSub   = prevEntry?.isSub || false;
  const prevSubName = prevEntry?.subName || "";

  // PR detection — skip if either session was a sub (different exercises = incomparable numbers)
  const hasPR = !isSub && !prevIsSub && prevEntry && sets.some(s => s.weight && s.perf && !s.bw) && (() => {
    const cur  = Math.max(...sets.map(s => (parseFloat(s.weight)||0) * (parseFloat(s.perf)||0)));
    const prev = Math.max(...(prevEntry.sets||[]).map(s => (parseFloat(s.weight)||0) * (parseFloat(s.perf)||0)));
    return cur > prev && prev > 0;
  })();

  // Detect if any working set hit the top of the target rep range → flag to add weight
  const repRange = parseRepRange(ex.target);
  const toppedRange = !isSub && track.key === "reps" && repRange && sets.some(s => !s.bw && s.perf && parseFloat(s.perf) >= repRange.max);
  const bestSetWeight = (() => {
    if (!toppedRange || !repRange) return null;
    const ws = sets.filter(s => !s.bw && s.weight && s.perf && parseFloat(s.perf) >= repRange.max);
    return ws.length ? Math.max(...ws.map(s => parseFloat(s.weight))) : null;
  })();
  const suggestedNextWeight = bestSetWeight ? roundTo(bestSetWeight * 1.05, 2.5) : null;

  // Mark _prevIsSub on each set so SetRow can colour the LAST column amber
  const enrichedSets = sets.map((s, i) => {
    if (!prevSets[i]) return { ...s, _prev:"—", _prevIsSub:false };
    const raw = prevSets[i].bw ? `BW×${prevSets[i].perf||"—"}` : `${prevSets[i].weight||"—"}×${prevSets[i].perf||"—"}`;
    return { ...s, _prev:raw, _prevIsSub:prevIsSub };
  });

  const showAnalysisBtn = ((!ex.exType || ex.exType === "compound") || ex.exType === "isolation" || ex.exType === "carries" || ex.exType === "plyometric") && track.key === "reps";

  const updSet = (i, f, v) => {
    const n = sets.map((s,idx) => idx===i ? {...s,[f]:v} : s);
    onChange({...entry, sets:n});
  };
  const addSet = () => onChange({...entry, sets:[...sets, {bw:false, weight:"", perf:"", rir:null}]});
  const delSet = i => onChange({...entry, sets:sets.filter((_,idx) => idx!==i)});

  const getSuggestion = i => {
    if (track.key !== "reps") return null;
    const isDrop = ex.hasDrop && i === ex.sets;
    // No suggestion from drop set or the last working set (nothing follows)
    if (isDrop || i >= ex.sets - 1) return null;
    const s = sets[i];
    if (!s || !s.weight || !s.perf || s.bw) return null;
    return calcSet2Suggestion(s.weight, s.perf, s.rir, ex.target);
  };

  const isReps = track.key === "reps";
  const gridCols = isReps && showRIR ? "20px 1fr 1fr 52px 56px" : "20px 1fr 1fr 56px";
  const headers  = ["#", "WEIGHT", track.label.toUpperCase(), isReps && showRIR && "RIR", "LAST"].filter(Boolean);

  return (
    <div style={{ background:"#fff", border:`1.5px solid ${open?"#33333333":"#e8e8e8"}`, borderRadius:12, marginBottom:8, overflow:"hidden" }}>
      <div onClick={() => setOpen(o=>!o)} style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 14px", cursor:"pointer" }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:logged?"#16a34a":"#e8e8e8", flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:14, fontWeight:700, color:"#0a0a0a" }}>{ex.name}</span>
            {hasPR && <Tag color="#16a34a" bg="#dcfce7">PR</Tag>}
            {isSub && <Tag color="#ea580c" bg="#fff7ed">Sub</Tag>}
            {!isSub && prevIsSub && <Tag color="#f59e0b" bg="#fffbeb">Last: sub</Tag>}
            {toppedRange && <Tag color="#2563eb" bg="#eff6ff">↑ Add weight</Tag>}
          </div>
          <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>{ex.sets} sets{ex.hasDrop?" + drop":""} · {ex.target} {track.label.toLowerCase()}</div>
          {prevIsSub && prevSubName && !open && (
            <div style={{ fontSize:10, color:"#f59e0b", marginTop:3, fontWeight:600 }}>↻ Last session: {prevSubName}</div>
          )}
          {toppedRange && !open && (
            <div style={{ fontSize:10, color:"#2563eb", marginTop:3, fontWeight:600 }}>
              Hit {repRange.max} reps — go heavier next session{suggestedNextWeight ? ` (~${suggestedNextWeight}lbs, round to nearest increment)` : ""}
            </div>
          )}
        </div>
        <span style={{ color:"#bbb", fontSize:18 }}>{open ? "−" : "+"}</span>
      </div>

      {open && (
        <div style={{ padding:"0 14px 14px", borderTop:"1px solid #e8e8e8" }}>
          {ex.notes && <div style={{ fontSize:11, color:"#bbb", margin:"10px 0 10px", fontStyle:"italic" }}>{ex.notes}</div>}

          {/* Topped rep range banner */}
          {toppedRange && (
            <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#1d4ed8", marginBottom:3 }}>↑ You hit the top of your rep range ({repRange.max} reps)</div>
              <div style={{ fontSize:11, color:"#3b82f6", marginBottom:suggestedNextWeight?4:0 }}>Increase the weight next session — you've earned it.</div>
              {suggestedNextWeight && (
                <div style={{ fontSize:11, color:"#1d4ed8", fontWeight:700 }}>Rough target: ~{suggestedNextWeight}lbs (+5%) · Round to your nearest available increment</div>
              )}
            </div>
          )}

          {/* Banner when last session was a substitution */}
          {prevIsSub && (
            <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"8px 12px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#92400e", marginBottom:2 }}>↻ Last session was a substitution</div>
              {prevSubName
                ? <div style={{ fontSize:11, color:"#92400e" }}>You did <strong>{prevSubName}</strong> instead — numbers below are from that exercise, not {ex.name}</div>
                : <div style={{ fontSize:11, color:"#92400e" }}>Numbers below are from a different exercise, not {ex.name}</div>
              }
            </div>
          )}

          {!readOnly && (
            <div style={{ marginBottom:12 }}>
              <Toggle on={isSub} onToggle={() => onChange({...entry, sets, isSub:!isSub, subName:""})} label="Mark as substitution" />
              {isSub && (
                <input value={subName} onChange={e=>onChange({...entry, sets, isSub:true, subName:e.target.value})} placeholder="What did you do instead? e.g. DB Shoulder Press" style={{ ...inp, marginTop:8, fontSize:12 }} />
              )}
            </div>
          )}
          {readOnly && isSub && subName && (
            <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:7, padding:"6px 10px", fontSize:12, color:"#ea580c", marginBottom:10 }}>
              Sub: {subName}
            </div>
          )}

          {/* Column headers */}
          <div style={{ display:"grid", gridTemplateColumns:gridCols, gap:"0 6px", marginBottom:6 }}>
            {headers.map(h => (
              <div key={h} style={{ fontSize:10, color:"#bbb", fontWeight:700, marginBottom:4 }}>{h}</div>
            ))}
          </div>

          {enrichedSets.map((s, i) => {
            const isDrop   = ex.hasDrop && i === ex.sets;
            const suggestion = !isDrop ? getSuggestion(i) : null;
            return (
              <SetRow key={i} s={s} i={i} isDrop={isDrop} track={track} readOnly={readOnly}
                showRIR={showRIR}
                suggestion={suggestion}
                onUpdate={(f,v) => updSet(i,f,v)}
                onDelete={() => delSet(i)}
              />
            );
          })}

          {ex.hasDrop && (
            <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:7, padding:"6px 10px", fontSize:11, color:"#92400e", marginBottom:8 }}>
              ↓ Drop set = 50% weight, go to failure
            </div>
          )}

          {!readOnly && (
            <button onClick={addSet} style={{ width:"100%", padding:8, background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:8, color:"#bbb", fontSize:12, fontFamily:"inherit", fontWeight:600, cursor:"pointer", marginBottom:8 }}>
              + Add set
            </button>
          )}

          {showAnalysisBtn && (
            <button onClick={onViewAnalysis} style={{ width:"100%", padding:10, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, color:"#15803d", fontSize:12, fontFamily:"inherit", fontWeight:700, cursor:"pointer", marginBottom:8 }}>
              📊 Performance Analysis & Targets →
            </button>
          )}

          {!readOnly && (
            <textarea value={entry?.note||""} onChange={e=>onChange({...entry, sets, note:e.target.value})} placeholder="Session note..." rows={2} style={{ ...inp, resize:"none", fontFamily:"inherit", fontSize:12 }} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Workout Screen ──────────────────────────────────────────────────────────

function WorkoutScreen({ user, readOnly, program, onBack, otherUser, onViewOther, initDay, showRIR }) {
  const [activeDay, setActiveDay] = useState(initDay);
  const [sessions, setSessions] = useState([]);
  const [current, setCurrent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [analysisEx, setAnalysisEx] = useState(null);
  const autoSaveTimer = useRef(null);
  const curDay     = program[activeDay];
  const lastSession = sessions[sessions.length-1] || null;

  useEffect(() => {
    setLoading(true); setCurrent({});
    Promise.all([fbLoadSessions(user, activeDay), fbLoadDraft(user, activeDay)]).then(([s, draft]) => {
      setSessions(s);
      if (Object.keys(draft).length > 0) setCurrent(draft);
      setLoading(false);
    });
  }, [user, activeDay]);

  const handleChange = useCallback((exId, val) => {
    setCurrent(c => {
      const next = {...c, [exId]:val};
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        await fbSaveDraft(user, activeDay, next);
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 1500);
      }, 800);
      return next;
    });
    setSaved(false);
  }, [user, activeDay]);

  const getPrev = id => { for (let i=sessions.length-1;i>=0;i--) { const e=sessions[i]?.entries?.[id]; if(e)return e; } return null; };

  const handleSave = async () => {
    setSaving(true);
    const next = [...sessions, { date:TODAY(), entries:current }];
    await fbSaveSessions(user, activeDay, next);
    await fbClearDraft(user, activeDay);
    setSessions(next); setCurrent({});
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Show analysis screen when tapped
  if (analysisEx) return <AnalysisScreen ex={analysisEx} sessions={sessions} onBack={() => setAnalysisEx(null)} />;

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", height:"100dvh" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <span style={{ fontSize:15, fontWeight:800, color:"#0a0a0a" }}>{user}</span>
              {readOnly && <Tag color="#ea580c" bg="#fff7ed">Viewing</Tag>}
            </div>
            <div style={{ fontSize:10, color:"#bbb" }}>Phase 1 · Athletic Hypertrophy</div>
          </div>
        </div>
        <button onClick={onViewOther} style={{ background:"#f5f5f5", border:"1.5px solid #e8e8e8", borderRadius:7, color:"#888", fontSize:11, fontFamily:"inherit", fontWeight:700, padding:"5px 11px", cursor:"pointer" }}>
          {readOnly ? `Back to ${otherUser}` : `View ${otherUser}`}
        </button>
      </div>

      {/* Day tabs */}
      <div style={{ display:"flex", gap:6, padding:"9px 14px", overflowX:"auto", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        {DAY_KEYS.map(dk => (
          <button key={dk} onClick={() => setActiveDay(dk)} style={{ background:activeDay===dk?"#0a0a0a":"#f5f5f5", color:activeDay===dk?"#fff":"#888", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, padding:"5px 12px", fontSize:11, fontFamily:"inherit", fontWeight:activeDay===dk?700:500, cursor:"pointer", whiteSpace:"nowrap" }}>{dk}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 16px", background:"#f5f5f5" }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
            <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.08em", textTransform:"uppercase" }}>{curDay.subtitle}</div>
            {curDay.goal && (
              <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4, letterSpacing:"0.06em", textTransform:"uppercase",
                background:curDay.goal==="hypertrophy"?"#f0fdf4":"#eff6ff",
                color:curDay.goal==="hypertrophy"?"#15803d":"#1d4ed8",
                border:`1px solid ${curDay.goal==="hypertrophy"?"#bbf7d0":"#bfdbfe"}` }}>
                {curDay.goal === "hypertrophy" ? "Hypertrophy" : "Athletic"}
              </span>
            )}
          </div>
          <div style={{ fontSize:22, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.03em" }}>{curDay.label}</div>
          <div style={{ display:"flex", gap:12, marginTop:5, flexWrap:"wrap" }}>
            {lastSession && <div style={{ fontSize:11, color:"#bbb" }}>Last: <span style={{ color:"#888", fontWeight:600 }}>{fmtDate(lastSession.date)}</span></div>}
            <div style={{ fontSize:11, color:"#bbb" }}>Today: <span style={{ color:"#888", fontWeight:600 }}>{TODAYFMT()}</span></div>
          </div>
          {autoSaved && <div style={{ fontSize:10, color:"#16a34a", marginTop:4 }}>● Draft saved</div>}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", color:"#bbb", padding:40, fontSize:13 }}>Loading...</div>
        ) : curDay.exercises.map(ex => (
          <ExerciseLogRow key={ex.id} ex={ex}
            entry={readOnly ? (lastSession?.entries?.[ex.id]||null) : (current[ex.id]||null)}
            prevEntry={readOnly ? null : getPrev(ex.id)}
            onChange={readOnly ? ()=>{} : val=>handleChange(ex.id, val)}
            readOnly={readOnly}
            sessions={sessions}
            showRIR={showRIR}
            onViewAnalysis={() => setAnalysisEx(ex)}
          />
        ))}

        {curDay.cardio && (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#15803d", fontWeight:600, marginBottom:8 }}>
            🏃 Cardio — {curDay.cardio}
          </div>
        )}
      </div>

      {/* Save button */}
      {!readOnly && (
        <div style={{ padding:"12px 14px 16px", background:"#fff", borderTop:"1px solid #e8e8e8", flexShrink:0 }}>
          <button onClick={handleSave} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:saving?"wait":"pointer", letterSpacing:"0.06em" }}>
            {saving ? "SAVING..." : saved ? "✓ SESSION SAVED" : "LOG SESSION"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Settings Screen ─────────────────────────────────────────────────────────

function SettingsScreen({ userSettings, onUpdate, onBack }) {
  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", minHeight:"100dvh", background:"#f5f5f5" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Settings</div>
      </div>
      <div style={{ padding:16 }}>
        {USERS.map(u => (
          <div key={u} style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
            <div style={{ fontSize:15, fontWeight:800, color:"#0a0a0a", marginBottom:14 }}>{u}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>Show RIR selector</div>
                <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Reps in reserve on each set</div>
              </div>
              <div onClick={() => onUpdate(u, "showRIR", !userSettings[u]?.showRIR)} style={{ width:44, height:24, borderRadius:12, background:userSettings[u]?.showRIR?"#16a34a":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s" }}>
                <div style={{ position:"absolute", top:3, left:userSettings[u]?.showRIR?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Editor: Exercise Row ────────────────────────────────────────────────────

function EditorExRow({ ex, onUpdate, onDelete, onGripStart, elRef, isDragging }) {
  const [open, setOpen] = useState(false);
  const track = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  return (
    <div ref={elRef} style={{ background:isDragging?"#eff6ff":"#fff", border:`1.5px solid ${isDragging?"#2563eb":"#e8e8e8"}`, borderRadius:10, marginBottom:7, overflow:"hidden", opacity:isDragging?0.85:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 12px" }}>
        <div onMouseDown={e=>onGripStart(ex.id,e)} onTouchStart={e=>onGripStart(ex.id,e)} style={{ cursor:"grab", color:"#ccc", fontSize:18, padding:"2px 4px", flexShrink:0, userSelect:"none", touchAction:"none" }}>⠿</div>
        <div style={{ flex:1, fontSize:13, fontWeight:700, color:"#0a0a0a" }}>{ex.name || <span style={{ color:"#bbb", fontStyle:"italic", fontWeight:400 }}>Unnamed</span>}</div>
        <div style={{ fontSize:11, color:"#bbb", flexShrink:0 }}>{ex.sets}s · {track.label}</div>
        <button onClick={() => setOpen(o=>!o)} style={{ background:"none", border:"none", fontSize:14, cursor:"pointer", padding:"0 4px" }}>{open?"−":"✏️"}</button>
        <button onClick={onDelete} style={{ background:"none", border:"1px solid #e8e8e8", borderRadius:6, color:"#bbb", width:26, height:26, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>×</button>
      </div>
      {open && (
        <div style={{ padding:"0 12px 12px", borderTop:"1px solid #e8e8e8" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>EXERCISE NAME</label>
              <input value={ex.name} onChange={e=>onUpdate({...ex, name:e.target.value})} style={inp} placeholder="Exercise name" />
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>SETS</label>
              <input type="number" min={1} max={10} value={ex.sets} onChange={e=>onUpdate({...ex, sets:parseInt(e.target.value)||1})} style={inp} />
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>TRACKED BY</label>
              <select value={ex.trackingType} onChange={e=>onUpdate({...ex, trackingType:e.target.value})} style={{ ...inp, cursor:"pointer" }}>
                {TRACK.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>EXERCISE TYPE</label>
              <select value={ex.exType || "compound"} onChange={e=>onUpdate({...ex, exType:e.target.value})} style={{ ...inp, cursor:"pointer" }}>
                {EX_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>TARGET {track.label.toUpperCase()}</label>
              <input value={ex.target} onChange={e=>onUpdate({...ex, target:e.target.value})} style={inp} placeholder="e.g. 8–12" />
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:8, gridColumn:"1/-1", cursor:"pointer" }}>
              <input type="checkbox" checked={ex.hasDrop} onChange={e=>onUpdate({...ex, hasDrop:e.target.checked})} style={{ width:15, height:15 }} />
              <span style={{ fontSize:12, color:"#888", fontWeight:600 }}>Include drop set</span>
            </label>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>NOTES</label>
              <textarea value={ex.notes} onChange={e=>onUpdate({...ex, notes:e.target.value})} rows={2} style={{ ...inp, resize:"none", fontFamily:"inherit", fontSize:12 }} placeholder="Cues or instructions..." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Exercise Modal ──────────────────────────────────────────────────────

function AddModal({ onAdd, onClose }) {
  const [step, setStep] = useState(0);
  const [ex, setEx] = useState({ id:uid(), name:"", sets:3, hasDrop:false, trackingType:"reps", exType:"compound", target:"", notes:"" });
  const track = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  const canNext = [ex.name.trim().length > 0, true, true, true, true];

  const steps = [
    // Step 0 — Name
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>What's the exercise called?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Type the full name</div>
      <input value={ex.name} onChange={e=>setEx(x=>({...x, name:e.target.value}))} placeholder="e.g. Cable Lateral Raise" style={inp} />
    </div>,
    // Step 1 — Exercise type
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>What type of exercise is it?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>This determines what analysis is shown</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {EX_TYPES.map(t => (
          <button key={t.key} onClick={() => setEx(x=>({...x, exType:t.key}))} style={{ padding:"11px 14px", textAlign:"left", background:ex.exType===t.key?"#0a0a0a":"#fff", color:ex.exType===t.key?"#fff":"#0a0a0a", border:`1.5px solid ${ex.exType===t.key?"#0a0a0a":"#e8e8e8"}`, borderRadius:10, fontFamily:"inherit", cursor:"pointer", fontSize:13, fontWeight:700 }}>{t.label}</button>
        ))}
      </div>
    </div>,
    // Step 2 — Sets
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>How many sets?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Working sets only</div>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setEx(x=>({...x, sets:n}))} style={{ width:46, height:46, borderRadius:10, background:ex.sets===n?"#0a0a0a":"#f5f5f5", color:ex.sets===n?"#fff":"#0a0a0a", border:`1.5px solid ${ex.sets===n?"#0a0a0a":"#e8e8e8"}`, fontSize:17, fontWeight:800, fontFamily:"inherit", cursor:"pointer" }}>{n}</button>
        ))}
      </div>
      <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
        <input type="checkbox" checked={ex.hasDrop} onChange={e=>setEx(x=>({...x, hasDrop:e.target.checked}))} style={{ width:15, height:15 }} />
        <span style={{ fontSize:13, color:"#888", fontWeight:600 }}>Include a drop set</span>
      </label>
    </div>,
    // Step 3 — Tracking type
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>How is it tracked?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>What do you count per set?</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {TRACK.map(t => (
          <button key={t.key} onClick={() => setEx(x=>({...x, trackingType:t.key}))} style={{ padding:"11px 14px", textAlign:"left", background:ex.trackingType===t.key?"#0a0a0a":"#fff", color:ex.trackingType===t.key?"#fff":"#0a0a0a", border:`1.5px solid ${ex.trackingType===t.key?"#0a0a0a":"#e8e8e8"}`, borderRadius:10, fontFamily:"inherit", cursor:"pointer", fontSize:13, fontWeight:700 }}>
            {t.label}<span style={{ fontSize:11, fontWeight:400, marginLeft:8, opacity:0.6 }}>{t.ph}</span>
          </button>
        ))}
      </div>
    </div>,
    // Step 4 — Target + notes
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>Set the target</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Goal per set</div>
      <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>TARGET {track.label.toUpperCase()}</label>
      <input value={ex.target} onChange={e=>setEx(x=>({...x, target:e.target.value}))} placeholder={track.ph} style={{ ...inp, marginBottom:12 }} />
      <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:4 }}>NOTES (optional)</label>
      <textarea value={ex.notes} onChange={e=>setEx(x=>({...x, notes:e.target.value}))} placeholder="Any cues..." rows={2} style={{ ...inp, resize:"none", fontFamily:"inherit", fontSize:12 }} />
    </div>,
  ];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"flex-end", zIndex:50 }}>
      <div style={{ background:"#fff", borderRadius:"18px 18px 0 0", padding:"22px 18px 28px", width:"100%" }}>
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {steps.map((_,i) => <div key={i} style={{ height:5, borderRadius:3, background:i<=step?"#0a0a0a":"#e8e8e8", flex:i===step?2:1, transition:"all .2s" }} />)}
        </div>
        {steps[step]}
        <div style={{ display:"flex", gap:10, marginTop:18 }}>
          <button onClick={step===0?onClose:()=>setStep(s=>s-1)} style={{ padding:"11px 18px", background:"#f5f5f5", border:"1.5px solid #e8e8e8", borderRadius:10, color:"#888", fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            {step===0 ? "Cancel" : "← Back"}
          </button>
          {step < steps.length-1
            ? <button onClick={() => canNext[step] && setStep(s=>s+1)} style={{ flex:1, padding:11, background:canNext[step]?"#0a0a0a":"#e8e8e8", color:"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>Next →</button>
            : <button onClick={() => onAdd(ex)} style={{ flex:1, padding:11, background:"#16a34a", color:"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>Add Exercise ✓</button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Editor Screen ───────────────────────────────────────────────────────────

function EditorScreen({ programs, onSave, onBack, currentUser }) {
  const [scope, setScope] = useState("both");
  const [activeDay, setActiveDay] = useState("Upper A");
  const [prog, setProg] = useState(() => copy(programs[currentUser]));
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const refs = useRef({});
  const exs    = prog[activeDay].exercises;
  const setExs = useCallback(n => setProg(p => ({...p, [activeDay]:{...p[activeDay], exercises:n}})), [activeDay]);

  useEffect(() => {
    if (!dragId) return;
    const move = cy => { let f=exs.length-1; for(let i=0;i<exs.length;i++){const el=refs.current[exs[i].id];if(!el)continue;const r=el.getBoundingClientRect();if(cy<r.top+r.height/2){f=i;break;}} setOverIdx(f); };
    const mm  = e => move(e.clientY);
    const tm  = e => { e.preventDefault(); move(e.touches[0].clientY); };
    const end = () => {
      if (dragId!==null && overIdx!==null) {
        const from = exs.findIndex(x=>x.id===dragId);
        if (from!==-1 && from!==overIdx) { const n=[...exs]; const[item]=n.splice(from,1); n.splice(overIdx,0,item); setExs(n); }
      }
      setDragId(null); setOverIdx(null);
    };
    window.addEventListener("mousemove",mm); window.addEventListener("touchmove",tm,{passive:false}); window.addEventListener("mouseup",end); window.addEventListener("touchend",end);
    return () => { window.removeEventListener("mousemove",mm); window.removeEventListener("touchmove",tm); window.removeEventListener("mouseup",end); window.removeEventListener("touchend",end); };
  }, [dragId, overIdx, exs, setExs]);

  const display = dragId ? (() => {
    const from = exs.findIndex(x=>x.id===dragId);
    if (from===-1 || overIdx===null || from===overIdx) return exs;
    const n=[...exs]; const[item]=n.splice(from,1); n.splice(overIdx,0,item); return n;
  })() : exs;

  const doSave = async () => {
    setSaving(true);
    const targets = scope==="both" ? USERS : [scope];
    await Promise.all(targets.map(u => fbSaveProgram(u, prog)));
    onSave(targets, prog);
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); onBack(); }, 900);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", fontFamily:"Barlow,sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Edit Program</div>
          <div style={{ fontSize:11, color:"#bbb" }}>Hold ⠿ to drag · tap ✏️ to edit</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px", paddingBottom:100 }}>
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
          <div style={{ fontSize:10, fontWeight:700, color:"#15803d", marginBottom:8, letterSpacing:"0.08em", textTransform:"uppercase" }}>Apply changes to</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {[{k:"both",l:"Both Josh & AJ"},{k:"Josh",l:"Josh only"},{k:"AJ",l:"AJ only"}].map(s => (
              <button key={s.k} onClick={()=>setScope(s.k)} style={{ padding:"6px 12px", background:scope===s.k?"#15803d":"#fff", color:scope===s.k?"#fff":"#15803d", border:`1.5px solid ${scope===s.k?"#15803d":"#bbf7d0"}`, borderRadius:7, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>{s.l}</button>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:12 }}>
          {DAY_KEYS.map(dk => <button key={dk} onClick={()=>setActiveDay(dk)} style={{ background:activeDay===dk?"#0a0a0a":"#f5f5f5", color:activeDay===dk?"#fff":"#888", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, padding:"5px 12px", fontSize:11, fontFamily:"inherit", fontWeight:activeDay===dk?700:500, cursor:"pointer", whiteSpace:"nowrap" }}>{dk}</button>)}
        </div>

        <div style={{ fontSize:11, color:"#bbb", marginBottom:10, fontStyle:"italic" }}>{prog[activeDay].label}</div>

        {display.map(ex => (
          <EditorExRow key={ex.id} ex={ex}
            onUpdate={u => setExs(exs.map(e => e.id===ex.id ? u : e))}
            onDelete={() => setExs(exs.filter(e => e.id!==ex.id))}
            onGripStart={setDragId}
            elRef={el => refs.current[ex.id]=el}
            isDragging={dragId===ex.id}
          />
        ))}
        <button onClick={()=>setShowAdd(true)} style={{ width:"100%", padding:11, background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:10, color:"#bbb", fontSize:12, fontFamily:"inherit", fontWeight:600, cursor:"pointer", marginTop:4 }}>+ Add exercise</button>
      </div>

      <div style={{ borderTop:"1px solid #e8e8e8", padding:"12px 14px 16px", background:"#fff", flexShrink:0 }}>
        <button onClick={doSave} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:"pointer", letterSpacing:"0.06em" }}>
          {saving ? "SAVING..." : saved ? "✓ SAVED!" : `SAVE — ${scope==="both"?"Both Josh & AJ":scope}`}
        </button>
      </div>

      {showAdd && <AddModal onAdd={ex=>{setExs([...exs,ex]);setShowAdd(false);}} onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

// ── App Root ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("select");
  const [user, setUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [activeDay, setActiveDay] = useState("Upper A");
  const [programs, setPrograms] = useState({ Josh:copy(DEFAULT_PROGRAM), AJ:copy(DEFAULT_PROGRAM) });
  const [loadingProgram, setLoadingProgram] = useState(false);
  const [userSettings, setUserSettings] = useState({ Josh:{showRIR:true}, AJ:{showRIR:true} });

  const currentUser = viewingUser || user;
  const isReadOnly  = !!viewingUser;
  const otherUser   = USERS.find(u => u !== user);

  useEffect(() => {
    if (!currentUser) return;
    setLoadingProgram(true);
    Promise.all([fbLoadProgram(currentUser), fbLoadSettings(currentUser)]).then(([p, s]) => {
      setPrograms(prev => ({...prev, [currentUser]:p}));
      setUserSettings(prev => ({...prev, [currentUser]:s}));
      setLoadingProgram(false);
    });
  }, [currentUser]);

  const handleSaveProgram = (targets, prog) => setPrograms(prev => { const n={...prev}; targets.forEach(u=>{n[u]=copy(prog);}); return n; });

  const handleUpdateSetting = async (u, key, val) => {
    const next = {...userSettings[u], [key]:val};
    setUserSettings(prev => ({...prev, [u]:next}));
    await fbSaveSettings(u, next);
  };

  // ── Select screen
  if (screen === "select") return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ width:"100%", maxWidth:340 }}>
        <div style={{ marginBottom:40 }}>
          <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:10 }}>Phase 1</div>
          <div style={{ fontSize:34, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em", lineHeight:1.05 }}>Athletic<br />Hypertrophy<br />Split</div>
          <div style={{ fontSize:13, color:"#bbb", marginTop:10 }}>Upper · Lower · Upper · Lower + Solo</div>
        </div>
        <div style={{ fontSize:10, color:"#bbb", marginBottom:12, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700 }}>Who's logging?</div>
        {USERS.map(u => (
          <button key={u} onClick={()=>{setUser(u);setViewingUser(null);setScreen("dayselect");}} style={{ display:"block", width:"100%", marginBottom:10, padding:"15px 18px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, color:"#0a0a0a", fontSize:16, fontWeight:700, fontFamily:"inherit", cursor:"pointer", textAlign:"left" }}>{u}</button>
        ))}
        <button onClick={()=>setScreen("settings")} style={{ display:"block", width:"100%", marginTop:8, padding:"12px 18px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:12, color:"#bbb", fontSize:12, fontWeight:600, fontFamily:"inherit", cursor:"pointer", textAlign:"left" }}>⚙️  Settings</button>
      </div>
    </div>
  );

  // ── Settings screen
  if (screen === "settings") return (
    <div style={{ height:"100dvh" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <SettingsScreen userSettings={userSettings} onUpdate={handleUpdateSetting} onBack={()=>setScreen("select")} />
    </div>
  );

  // ── Day select screen
  if (screen === "dayselect") return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", padding:"36px 20px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ maxWidth:340, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:28 }}>
          <button onClick={()=>setScreen("select")} style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
          <div>
            <div style={{ fontSize:19, fontWeight:900, color:"#0a0a0a" }}>{user}</div>
            <div style={{ fontSize:11, color:"#bbb" }}>Select today's workout</div>
          </div>
        </div>
        {DAY_KEYS.map(dk => (
          <button key={dk} onClick={()=>{setActiveDay(dk);setScreen("workout");}} style={{ display:"block", width:"100%", marginBottom:10, padding:"13px 16px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
            <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>{dk}</div>
            <div style={{ fontSize:12, color:"#bbb", marginTop:2 }}>{DAY_META[dk].day} · {DAY_META[dk].sub}</div>
          </button>
        ))}
        <button onClick={()=>setScreen("editor")} style={{ display:"block", width:"100%", marginTop:14, padding:"11px 16px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:12, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:"#bbb", fontSize:12, fontWeight:600 }}>✏️  Edit program</button>
      </div>
    </div>
  );

  // ── Editor screen
  if (screen === "editor") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <EditorScreen programs={programs} currentUser={user} onSave={handleSaveProgram} onBack={()=>setScreen("dayselect")} />
    </div>
  );

  // ── Workout screen
  return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      {loadingProgram ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", color:"#bbb" }}>Loading...</div>
      ) : (
        <WorkoutScreen
          user={currentUser}
          readOnly={isReadOnly}
          program={programs[currentUser] || DEFAULT_PROGRAM}
          showRIR={userSettings[currentUser]?.showRIR !== false}
          onBack={()=>{setScreen("dayselect");setViewingUser(null);}}
          otherUser={otherUser}
          onViewOther={()=>isReadOnly?setViewingUser(null):setViewingUser(otherUser)}
          initDay={activeDay}
        />
      )}
    </div>
  );
}
