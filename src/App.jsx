import { useState, useRef, useEffect, useCallback } from "react";
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

const USERS = ["Josh", "AJ"];
// Returns the canonical USERS name if there's a case-insensitive match, otherwise returns name as-is
const canonicalName = n => USERS.find(u => u.toLowerCase() === n?.toLowerCase()) || n;
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
const newSplitId = () => `sp_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
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
    { id:"UA1", name:"Incline Smith Machine Press",         sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"",      exType:"compound" },
    { id:"UA2", name:"Single Arm Lat Pulldown",             sets:2, hasDrop:false, trackingType:"reps", target:"10–12 ea",   notes:"",  exType:"compound" },
    { id:"UA3", name:"DB Flat Press",                       sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"",  exType:"compound" },
    { id:"UA4", name:"Bent Over Barbell Row",               sets:2, hasDrop:false, trackingType:"reps", target:"8–12",       notes:"",  exType:"compound" },
    { id:"UA5", name:"Cable Lateral Raise",                 sets:2, hasDrop:true,  trackingType:"reps", target:"12–15 ea",   notes:"",  exType:"isolation" },
    { id:"UA6", name:"Straight Bar Cable Tricep Pushdown",  sets:2, hasDrop:true,  trackingType:"reps", target:"10–15",      notes:"",  exType:"isolation" },
    { id:"UA7", name:"Standing DB Bicep Curl",              sets:3, hasDrop:false, trackingType:"reps", target:"10–12",      notes:"",  exType:"isolation" },
  ]},
  "Lower A": { label: "Lower A", subtitle: "Athletic", cardio: null, goal: "athletic", exercises: [
    { id:"LA1", name:"Trap Bar Deadlift",   sets:2, hasDrop:false, trackingType:"reps",     target:"6–10",               notes:"", exType:"compound" },
    { id:"LA2", name:"Walking Lunges",      sets:3, hasDrop:false, trackingType:"laps",     target:"3",                  notes:"", exType:"compound" },
    { id:"LA3", name:"Leg Extension",       sets:2, hasDrop:false, trackingType:"reps",     target:"12–15",              notes:"", exType:"isolation" },
    { id:"LA4", name:"Sled Pull + Push",    sets:2, hasDrop:false, trackingType:"distance", target:"Turf length",        notes:"", exType:"carries" },
    { id:"LA5", name:"Suitcase Carry",      sets:2, hasDrop:false, trackingType:"distance", target:"Turf length ea side",notes:"", exType:"carries" },
    { id:"LA6", name:"Abs",                 sets:3, hasDrop:false, trackingType:"reps",     target:"—",                  notes:"", exType:"conditioning" },
  ]},
  "Upper B": { label: "Upper B", subtitle: "Shoulder Priority", cardio: "15–20 min", goal: "hypertrophy", exercises: [
    { id:"UB1", name:"Smith Machine Shoulder Press",        sets:2, hasDrop:false, trackingType:"reps", target:"8–12",     notes:"", exType:"compound" },
    { id:"UB2", name:"Supported Bent Over DB Row",          sets:2, hasDrop:false, trackingType:"reps", target:"10–12 ea", notes:"", exType:"compound" },
    { id:"UB3", name:"DB Lateral Raise",                    sets:2, hasDrop:true,  trackingType:"reps", target:"12–15",    notes:"", exType:"isolation" },
    { id:"UB4", name:"Straight Bar Lat Pulldown",           sets:2, hasDrop:false, trackingType:"reps", target:"10–12",    notes:"", exType:"compound" },
    { id:"UB5", name:"Overhead DB Tricep Extension",        sets:2, hasDrop:true,  trackingType:"reps", target:"10–12 ea", notes:"", exType:"isolation" },
    { id:"UB6", name:"Machine Preacher Curl",               sets:3, hasDrop:false, trackingType:"reps", target:"10–12",    notes:"", exType:"isolation" },
  ]},
  "Lower B": { label: "Lower B", subtitle: "Athletic · Power Focus", cardio: null, goal: "athletic", exercises: [
    { id:"LB1", name:"Plyometric Complex",      sets:2, hasDrop:false, trackingType:"reps",     target:"3–5 loops",   notes:"", exType:"plyometric" },
    { id:"LB2", name:"Conventional Deadlift",   sets:2, hasDrop:false, trackingType:"reps",     target:"5–8",         notes:"", exType:"compound" },
    { id:"LB3", name:"Bulgarian Split Squat",   sets:2, hasDrop:false, trackingType:"reps",     target:"8–10 ea",     notes:"", exType:"compound" },
    { id:"LB4", name:"Seated Hamstring Curl",   sets:2, hasDrop:false, trackingType:"reps",     target:"10–12",       notes:"", exType:"isolation" },
    { id:"LB5", name:"Farmers Carry",           sets:2, hasDrop:false, trackingType:"distance", target:"Turf length", notes:"", exType:"carries" },
    { id:"LB6", name:"Hanging Leg Raise",       sets:3, hasDrop:false, trackingType:"reps",     target:"10–15",       notes:"", exType:"conditioning" },
  ]},
  "Accessory": { label: "Accessory", subtitle: "Accessory · Injury Phase", cardio: null, goal: "hypertrophy", exercises: [
    { id:"AC1", name:"DB Lateral Raise",                          sets:2, hasDrop:true,  trackingType:"reps", target:"12–15", notes:"", exType:"isolation" },
    { id:"AC2", name:"Cable Rear Delt Fly",                       sets:2, hasDrop:true,  trackingType:"reps", target:"12–15", notes:"", exType:"isolation" },
    { id:"AC3", name:"JM Press / Overhead DB Tricep Extension",   sets:2, hasDrop:true,  trackingType:"reps", target:"10–12", notes:"", exType:"isolation" },
    { id:"AC4", name:"Hammer Curl Variation",                     sets:3, hasDrop:false, trackingType:"reps", target:"10–12", notes:"", exType:"isolation" },
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
  const base = ex.isSuperset
    ? { bw:false, weight:"", perf:"", rir:null, bw2:false, weight2:"", perf2:"" }
    : { bw:false, weight:"", perf:"", rir:null };
  return Array.from({ length: ex.hasDrop ? ex.sets + 1 : ex.sets }, () => ({ ...base }));
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
    if (!snap.exists()) return { draft: {}, savedAt: null };
    return { draft: snap.data().draft || {}, savedAt: snap.data().savedAt || null };
  } catch { return { draft: {}, savedAt: null }; }
}
async function fbSaveDraft(user, dayKey, draft) {
  try { await setDoc(doc(db, "drafts", `${user}_${dayKey}`), { draft, savedAt: Date.now() }); } catch(e) { console.error(e); }
}
async function fbClearDraft(user, dayKey) {
  try { await setDoc(doc(db, "drafts", `${user}_${dayKey}`), { draft: {} }); } catch(e) { console.error(e); }
}
function legacyToSplitsDoc(data) {
  const program = data.program || data;
  return {
    activeSplitId: "default",
    splits: [{ id: "default", name: "Athletic Hypertrophy Split", days: [...DAY_KEYS], program: copy(program) }]
  };
}
async function migrateExerciseNotes(userName, splitsDoc) {
  const flag = `stack_notes_migrated_${userName}`;
  if (localStorage.getItem(flag)) return splitsDoc;
  let changed = false;
  const newSplits = splitsDoc.splits.map(split => {
    const newProgram = {};
    for (const [dk, dayData] of Object.entries(split.program || {})) {
      const exercises = (dayData.exercises || []).map(ex => {
        if (ex.notes) { changed = true; return { ...ex, notes: "" }; }
        return ex;
      });
      newProgram[dk] = { ...dayData, exercises };
    }
    return { ...split, program: newProgram };
  });
  localStorage.setItem(flag, "1");
  if (!changed) return splitsDoc;
  const newDoc = { ...splitsDoc, splits: newSplits };
  await fbSaveSplits(userName, newDoc);
  return newDoc;
}

async function fbLoadSplits(user, isNewUser = false) {
  try {
    const snap = await getDoc(doc(db, "programs", user));
    if (!snap.exists()) return isNewUser ? { activeSplitId: null, splits: [] } : legacyToSplitsDoc({ program: copy(DEFAULT_PROGRAM) });
    const data = snap.data();
    return Array.isArray(data.splits) ? data : legacyToSplitsDoc(data);
  } catch { return isNewUser ? { activeSplitId: null, splits: [] } : legacyToSplitsDoc({ program: copy(DEFAULT_PROGRAM) }); }
}
async function fbSaveSplits(user, splitsDoc) {
  try { await setDoc(doc(db, "programs", user), splitsDoc); } catch(e) { console.error(e); }
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
async function fbLoadUserProfile(uid) {
  const local = localStorage.getItem("stack_user_name");
  if (local) return { name: local };
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      localStorage.setItem("stack_user_name", snap.data().name);
      return snap.data();
    }
    return null;
  } catch { return null; }
}
async function fbSaveUserProfile(uid, name) {
  localStorage.setItem("stack_user_name", name);
  try {
    await setDoc(doc(db, "users", uid), { name, createdAt: new Date().toISOString() });
  } catch(e) { console.error(e); }
}

// ── Relationships & Shared Sessions ─────────────────────────────────────────

async function fbLoadRelationships(user) {
  try {
    const q = query(collection(db, "relationships"), where("users", "array-contains", user));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function fbEnsureRelationship(rel) {
  // Idempotent — only creates if not already present for these users
  try {
    const q = query(collection(db, "relationships"), where("users", "array-contains", rel.users[0]));
    const snap = await getDocs(q);
    const exists = snap.docs.some(d => {
      const u = d.data().users || [];
      return rel.users.every(x => u.includes(x));
    });
    if (!exists) await addDoc(collection(db, "relationships"), { ...rel, createdAt: Date.now() });
  } catch(e) { console.error(e); }
}

async function fbCreateSharedSession(data) {
  try {
    const ref = await addDoc(collection(db, "sharedSessions"), { ...data, createdAt: Date.now() });
    return ref.id;
  } catch(e) { console.error(e); return null; }
}

async function fbUpdateSharedSession(id, updates) {
  try { await updateDoc(doc(db, "sharedSessions", id), updates); } catch(e) { console.error(e); }
}

// When copying a program to another user, remap exercise IDs to match their existing IDs by name.
// This keeps their session history connected even after a program overwrite.
function remapProgramIds(newProg, existingProg) {
  const result = {};
  for (const [dk, dayData] of Object.entries(newProg)) {
    const existingExs = (existingProg?.[dk]?.exercises) || [];
    const nameToId = {};
    existingExs.forEach(ex => { nameToId[ex.name.toLowerCase()] = ex.id; });
    const exercises = (dayData.exercises || []).map(ex => ({
      ...ex,
      id: nameToId[ex.name.toLowerCase()] || ex.id,
    }));
    result[dk] = { ...dayData, exercises };
  }
  return result;
}

async function fbShareSplitAsTemplate(fromUser, split, toUser) {
  try {
    const toDoc = await fbLoadSplits(canonicalName(toUser), !USERS.includes(canonicalName(toUser)));
    const id = newSplitId();
    const newSplit = { ...copy(split), id, name: `${split.name} (from ${fromUser})` };
    const updated = { ...toDoc, splits: [...toDoc.splits, newSplit] };
    await fbSaveSplits(canonicalName(toUser), updated);
  } catch(e) { console.error(e); }
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

// ── Performance Screen ───────────────────────────────────────────────────────

function PerformanceScreen({ user, program, onBack }) {
  const [tab, setTab] = useState("prs"); // "prs" | "calc"
  const [allSessions, setAllSessions] = useState({});
  const [loading, setLoading] = useState(true);
  const [calcWeight, setCalcWeight] = useState("");
  const [calcReps, setCalcReps] = useState("");

  useEffect(() => {
    setLoading(true);
    const dayKeys = Object.keys(program);
    Promise.all(dayKeys.map(dk => fbLoadSessions(user, dk).then(s => [dk, s]))).then(results => {
      const map = {};
      results.forEach(([dk, s]) => { map[dk] = s; });
      setAllSessions(map);
      setLoading(false);
    });
  }, [user, program]);

  // Build compound PR board
  const prs = [];
  Object.keys(program).forEach(dk => {
    const exercises = program[dk].exercises || [];
    const sessions = allSessions[dk] || [];
    exercises.forEach(ex => {
      const isCompound = ex.exType === "compound" || (!ex.exType && ex.trackingType === "reps");
      if (!isCompound) return;
      let bestSet = null, best1RM = 0;
      sessions.forEach(s => {
        const e = s.entries?.[ex.id];
        if (!e?.sets) return;
        e.sets.forEach(set => {
          if (!set.bw && set.weight && set.perf) {
            const orm = calc1RM(set.weight, set.perf, set.rir != null ? parseFloat(set.rir) : 1);
            if (orm && orm > best1RM) { best1RM = orm; bestSet = { ...set, date: s.date }; }
          }
        });
      });
      if (bestSet) prs.push({ name: ex.name, day: dk, bestSet, est1RM: best1RM });
    });
  });
  prs.sort((a, b) => b.est1RM - a.est1RM);

  const calcResult = calc1RM(calcWeight, calcReps, 1);

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", height:"100dvh", background:"#f5f5f5" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Performance</div>
          <div style={{ fontSize:11, color:"#bbb" }}>{user} · Analysis & Targets</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, padding:"10px 14px", background:"#fff", borderBottom:"1px solid #e8e8e8", flexShrink:0 }}>
        {[{k:"prs",l:"PR Board"},{k:"calc",l:"1RM Calculator"}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding:"6px 14px", background:tab===t.k?"#0a0a0a":"#f5f5f5", color:tab===t.k?"#fff":"#888", border:`1.5px solid ${tab===t.k?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>{t.l}</button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:16 }}>

        {/* ── PR Board ── */}
        {tab === "prs" && (
          loading ? (
            <div style={{ textAlign:"center", color:"#bbb", padding:40 }}>Loading...</div>
          ) : prs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"#bbb" }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🏋️</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#888", marginBottom:8 }}>No compound PRs yet</div>
              <div style={{ fontSize:13 }}>Log compound movements with weight + reps to see your PR board.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Compound lifts · Best estimated 1RM</div>
              {prs.map((pr, i) => (
                <div key={pr.name + pr.day} style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>{pr.name}</div>
                      <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>{pr.day} · {fmtDate(pr.bestSet.date) || pr.bestSet.date}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:11, color:"#bbb", marginBottom:2 }}>Est. 1RM</div>
                      <div style={{ fontSize:20, fontWeight:900, color:"#0a0a0a" }}>{pr.est1RM}<span style={{ fontSize:12, fontWeight:600, color:"#bbb" }}>lbs</span></div>
                    </div>
                  </div>
                  <div style={{ background:"#f5f5f5", borderRadius:8, padding:"8px 12px", fontSize:13, fontWeight:700, color:"#444" }}>
                    {pr.bestSet.weight}lbs × {pr.bestSet.perf} reps{pr.bestSet.rir != null ? ` · RIR ${pr.bestSet.rir}` : ""}
                  </div>
                  {/* Mini percentage row */}
                  <div style={{ display:"flex", gap:6, marginTop:10, overflowX:"auto" }}>
                    {[65,70,75,80,85,90,95].map(pct => (
                      <div key={pct} style={{ flexShrink:0, textAlign:"center", background:"#f5f5f5", borderRadius:8, padding:"6px 10px", minWidth:52 }}>
                        <div style={{ fontSize:9, color:"#bbb", fontWeight:700 }}>{pct}%</div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#0a0a0a" }}>{Math.round(pr.est1RM * pct / 100)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )
        )}

        {/* ── 1RM Calculator ── */}
        {tab === "calc" && (
          <div>
            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Enter a set</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
                <div>
                  <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:6 }}>WEIGHT (lbs)</label>
                  <input value={calcWeight} onChange={e=>setCalcWeight(e.target.value)} placeholder="e.g. 225" type="number" style={{ ...inp, fontSize:18, fontWeight:800, padding:"10px 12px" }} />
                </div>
                <div>
                  <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:6 }}>REPS</label>
                  <input value={calcReps} onChange={e=>setCalcReps(e.target.value)} placeholder="e.g. 7" type="number" style={{ ...inp, fontSize:18, fontWeight:800, padding:"10px 12px" }} />
                </div>
              </div>
              <div style={{ fontSize:10, color:"#bbb", marginTop:6 }}>Uses Epley formula · assumes ~1 rep in reserve</div>
            </div>

            {calcResult ? (
              <div>
                {/* 1RM result */}
                <div style={{ background:"#0a0a0a", borderRadius:14, padding:"16px 18px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:10, color:"#666", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Estimated 1RM</div>
                    <div style={{ fontSize:11, color:"#555" }}>{calcWeight}lbs × {calcReps} reps</div>
                  </div>
                  <div style={{ fontSize:36, fontWeight:900, color:"#fff" }}>{calcResult}<span style={{ fontSize:16, color:"#888" }}>lbs</span></div>
                </div>

                {/* Percentage table */}
                <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16 }}>
                  <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Working weight targets</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {[95,90,85,80,75,70,65].map(pct => (
                      <div key={pct} style={{ background:"#f5f5f5", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, color:"#888", fontWeight:700 }}>{pct}%</span>
                        <span style={{ fontSize:16, fontWeight:800, color:"#0a0a0a" }}>{Math.round(calcResult * pct / 100)}<span style={{ fontSize:11, color:"#bbb", fontWeight:600 }}>lbs</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"#bbb" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🧮</div>
                <div style={{ fontSize:13 }}>Enter a weight and reps above to calculate your estimated 1RM and percentage targets.</div>
              </div>
            )}
          </div>
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

            <div style={{ fontSize:11, textAlign:"right", paddingLeft:2, color:s._prevIsSub?"#f59e0b":"#bbb", fontWeight:s._prevIsSub?700:400, lineHeight:1.3 }}>
              {(!s._prev || s._prev==="—") ? "—" : s._prevIsSub ? `↻ ${s._prev}` : s._prev}
              {s._prevRir != null && <div style={{ fontSize:9, color:"#d1d5db", fontWeight:400 }}>@{s._prevRir === 5 ? "5+" : s._prevRir}</div>}
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
  const logged   = ex.isSuperset
    ? sets.some(s => s.weight || s.perf || s.weight2 || s.perf2)
    : sets.some(s => s.bw || s.weight || s.perf);
  const prevSets = prevEntry?.sets || [];
  const prevIsSub   = prevEntry?.isSub || false;
  const prevSubName = prevEntry?.subName || "";

  // PR detection — skip supersets and subs (incomparable numbers)
  const hasPR = !ex.isSuperset && !isSub && !prevIsSub && prevEntry && sets.some(s => s.weight && s.perf && !s.bw) && (() => {
    const cur  = Math.max(...sets.map(s => (parseFloat(s.weight)||0) * (parseFloat(s.perf)||0)));
    const prev = Math.max(...(prevEntry.sets||[]).map(s => (parseFloat(s.weight)||0) * (parseFloat(s.perf)||0)));
    return cur > prev && prev > 0;
  })();

  // Detect if any working set hit the top of the target rep range → flag to add weight
  const repRange = parseRepRange(ex.target);
  const toppedRange = !ex.isSuperset && !isSub && track.key === "reps" && repRange && sets.some(s => !s.bw && s.perf && parseFloat(s.perf) >= repRange.max);
  const bestSetWeight = (() => {
    if (!toppedRange || !repRange) return null;
    const ws = sets.filter(s => !s.bw && s.weight && s.perf && parseFloat(s.perf) >= repRange.max);
    return ws.length ? Math.max(...ws.map(s => parseFloat(s.weight))) : null;
  })();
  const suggestedNextWeight = bestSetWeight ? roundTo(bestSetWeight * 1.05, 2.5) : null;

  // Enrich sets with previous values — superset gets _prevA and _prevB separately
  const enrichedSets = sets.map((s, i) => {
    if (!prevSets[i]) return { ...s, _prev:"—", _prevA:"—", _prevB:"—", _prevIsSub:false, _prevRir:null };
    if (ex.isSuperset) {
      const pA = prevSets[i].bw  ? `BW×${prevSets[i].perf||"—"}`  : `${prevSets[i].weight||"—"}×${prevSets[i].perf||"—"}`;
      const pB = prevSets[i].bw2 ? `BW×${prevSets[i].perf2||"—"}` : `${prevSets[i].weight2||"—"}×${prevSets[i].perf2||"—"}`;
      return { ...s, _prev:pA, _prevA:pA, _prevB:pB, _prevIsSub:false, _prevRir:null };
    }
    const raw = prevSets[i].bw ? `BW×${prevSets[i].perf||"—"}` : `${prevSets[i].weight||"—"}×${prevSets[i].perf||"—"}`;
    const prevRir = prevSets[i].rir != null && prevSets[i].rir !== "" ? prevSets[i].rir : null;
    return { ...s, _prev:raw, _prevIsSub:prevIsSub, _prevRir:prevRir };
  });

  const showAnalysisBtn = ((!ex.exType || ex.exType === "compound") || ex.exType === "isolation" || ex.exType === "carries" || ex.exType === "plyometric") && track.key === "reps";

  const updSet = (i, f, v) => {
    const n = sets.map((s,idx) => idx===i ? {...s,[f]:v} : s);
    onChange({...entry, sets:n});
  };
  const addSet = () => {
    const newRow = ex.isSuperset
      ? {bw:false, weight:"", perf:"", rir:null, bw2:false, weight2:"", perf2:""}
      : {bw:false, weight:"", perf:"", rir:null};
    onChange({...entry, sets:[...sets, newRow]});
  };
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
          <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>
            {ex.isSuperset ? `${ex.sets} sets · Superset` : `${ex.sets} sets${ex.hasDrop?" + drop":""} · ${ex.target} ${track.label.toLowerCase()}`}
          </div>
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

          {/* Superset layout */}
          {ex.isSuperset ? (
            <>
              <div style={{ fontSize:11, color:"#888", marginBottom:12, lineHeight:1.7 }}>
                <span style={{ fontWeight:800, color:"#0a0a0a" }}>A</span> {ex.supersetNameA}&nbsp;&nbsp;·&nbsp;&nbsp;<span style={{ fontWeight:800, color:"#0a0a0a" }}>B</span> {ex.supersetNameB}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 1fr 56px", gap:"0 6px", marginBottom:4 }}>
                {["", "WEIGHT", "REPS", "LAST"].map(h => <div key={h} style={{ fontSize:10, color:"#bbb", fontWeight:700 }}>{h}</div>)}
              </div>
              {enrichedSets.map((s, i) => (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 1fr 56px", gap:"0 6px", alignItems:"center", marginBottom:4 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#0a0a0a" }}>{i+1}A</div>
                    <input disabled={readOnly} value={s.weight||""} onChange={e=>updSet(i,"weight",e.target.value)} placeholder="lbs" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <input disabled={readOnly} value={s.perf||""} onChange={e=>updSet(i,"perf",e.target.value)} placeholder="reps" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <div style={{ fontSize:11, textAlign:"right", color:"#bbb", paddingLeft:2 }}>{s._prevA||"—"}</div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"26px 1fr 1fr 56px", gap:"0 6px", alignItems:"center" }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#555" }}>{i+1}B</div>
                    <input disabled={readOnly} value={s.weight2||""} onChange={e=>updSet(i,"weight2",e.target.value)} placeholder="lbs" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <input disabled={readOnly} value={s.perf2||""} onChange={e=>updSet(i,"perf2",e.target.value)} placeholder="reps" style={{ ...inp, padding:"5px 7px", fontSize:12, background:"#f8f8f8", border:"1px solid #e8e8e8" }} />
                    <div style={{ fontSize:11, textAlign:"right", color:"#bbb", paddingLeft:2 }}>{s._prevB||"—"}</div>
                  </div>
                  {!readOnly && sets.length > 1 && (
                    <button onClick={() => delSet(i)} style={{ background:"none", border:"none", color:"#d0d0d0", fontSize:10, cursor:"pointer", padding:"3px 0 0", fontFamily:"inherit" }}>Remove set</button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
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
            </>
          )}

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

          {prevEntry?.note && (
            <div style={{ background:"#f9fafb", border:"1px solid #eeeeee", borderRadius:8, padding:"9px 11px", marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"#aaa", letterSpacing:"0.07em", marginBottom:4 }}>LAST SESSION NOTE</div>
              <div style={{ fontSize:12, color:"#555", lineHeight:1.55, fontStyle:"italic" }}>{prevEntry.note}</div>
            </div>
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

function WorkoutScreen({ user, readOnly, program, days, onBack, otherUser, onViewOther, initDay, showRIR, autoLog, autoLogHours, sharedSession, onSharedSave }) {
  const [activeDay, setActiveDay] = useState(initDay);
  const [sessions, setSessions] = useState([]);
  const [current, setCurrent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoLoggedMsg, setAutoLoggedMsg] = useState("");
  const [analysisEx, setAnalysisEx] = useState(null);
  const autoSaveTimer = useRef(null);
  const programDays = days?.length ? days : Object.keys(program);
  const curDay      = program[activeDay];
  const lastSession = sessions[sessions.length-1] || null;

  useEffect(() => {
    setLoading(true); setCurrent({});
    Promise.all([fbLoadSessions(user, activeDay), fbLoadDraft(user, activeDay)]).then(([s, { draft, savedAt }]) => {
      setSessions(s);
      const hasMeaningfulData = Object.values(draft).some(e => e?.sets?.some(s => s.weight || s.reps || s.laps));
      const thresholdMs = (autoLogHours || 4) * 3600000;
      const shouldAutoLog = !readOnly && autoLog !== false && savedAt && hasMeaningfulData && (Date.now() - savedAt) > thresholdMs;
      if (shouldAutoLog) {
        const d = new Date(savedAt);
        const dateStr = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
        const nextSessions = [...s, { date: dateStr, entries: draft }];
        fbSaveSessions(user, activeDay, nextSessions);
        fbClearDraft(user, activeDay);
        setSessions(nextSessions);
        const hoursAgo = Math.round((Date.now() - savedAt) / 3600000);
        setAutoLoggedMsg(`✓ Auto-logged ${activeDay} from ${hoursAgo}h ago`);
        setTimeout(() => setAutoLoggedMsg(""), 5000);
      } else {
        if (hasMeaningfulData) setCurrent(draft);
      }
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

  const getPrev = (id, name) => {
    // Direct ID match
    for (let i = sessions.length - 1; i >= 0; i--) {
      const e = sessions[i]?.entries?.[id];
      if (e) return e;
    }
    // Fallback: same-named exercise in the current day (catches re-added duplicates with new IDs)
    if (name && curDay) {
      const altIds = (curDay.exercises || []).filter(e => e.id !== id && e.name.toLowerCase() === name.toLowerCase()).map(e => e.id);
      for (const altId of altIds) {
        for (let i = sessions.length - 1; i >= 0; i--) {
          const e = sessions[i]?.entries?.[altId];
          if (e) return e;
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (sharedSession && onSharedSave) {
      onSharedSave(current, sessions, activeDay);
      return;
    }
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
          </div>
        </div>
        {otherUser && (
          <button onClick={onViewOther} style={{ background:"#f5f5f5", border:"1.5px solid #e8e8e8", borderRadius:7, color:"#888", fontSize:11, fontFamily:"inherit", fontWeight:700, padding:"5px 11px", cursor:"pointer" }}>
            {readOnly ? `Back to ${otherUser}` : `View ${otherUser}`}
          </button>
        )}
      </div>

      {/* Day tabs */}
      <div style={{ display:"flex", gap:6, padding:"9px 14px", overflowX:"auto", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        {programDays.map(dk => (
          <button key={dk} onClick={() => setActiveDay(dk)} style={{ background:activeDay===dk?"#0a0a0a":"#f5f5f5", color:activeDay===dk?"#fff":"#888", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, padding:"5px 12px", fontSize:11, fontFamily:"inherit", fontWeight:activeDay===dk?700:500, cursor:"pointer", whiteSpace:"nowrap" }}>{dk}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 16px", background:"#f5f5f5" }}>
        {!curDay ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#bbb" }}>
            <div style={{ fontSize:13 }}>Loading workout...</div>
          </div>
        ) : <>
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
          {autoLoggedMsg && <div style={{ fontSize:11, color:"#16a34a", fontWeight:700, marginTop:6, padding:"6px 10px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8 }}>{autoLoggedMsg}</div>}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", color:"#bbb", padding:40, fontSize:13 }}>Loading...</div>
        ) : curDay.exercises.map(ex => (
          <ExerciseLogRow key={ex.id} ex={ex}
            entry={readOnly ? (lastSession?.entries?.[ex.id]||null) : (current[ex.id]||null)}
            prevEntry={readOnly ? null : getPrev(ex.id, ex.name)}
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
        </>}
      </div>

      {/* Save button */}
      {!readOnly && (
        <div style={{ padding:"12px 14px 16px", background:"#fff", borderTop:"1px solid #e8e8e8", flexShrink:0 }}>
          {sharedSession && (
            <div style={{ fontSize:11, color:"#ea580c", fontWeight:700, textAlign:"center", marginBottom:8, letterSpacing:"0.04em" }}>
              SHARED SESSION · {sharedSession.initiator !== user ? `with ${sharedSession.initiator}` : "you started this"}
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":sharedSession?"#ea580c":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:saving?"wait":"pointer", letterSpacing:"0.06em" }}>
            {saving ? "SAVING..." : saved ? "✓ SESSION SAVED" : sharedSession ? "REVIEW & LOG SESSION" : "LOG SESSION"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Settings Screen ─────────────────────────────────────────────────────────

function SettingsScreen({ user, userSettings, onUpdate, onBack, onChangeName }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user) { setEditingName(false); return; }
    onChangeName(trimmed);
  };

  const handleSignOut = () => {
    localStorage.removeItem("stack_user_name");
    window.location.reload();
  };

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", minHeight:"100dvh", background:"#f5f5f5" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Settings</div>
      </div>
      <div style={{ padding:16 }}>
        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:10, color:"#bbb", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>Profile</div>
          {editingName ? (
            <div style={{ display:"flex", gap:8 }}>
              <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSaveName()} autoFocus style={{ ...inp, flex:1, fontSize:14 }} />
              <button onClick={handleSaveName} style={{ padding:"7px 14px", background:"#0a0a0a", color:"#fff", border:"none", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>Save</button>
              <button onClick={()=>{setEditingName(false);setNameInput(user);}} style={{ padding:"7px 10px", background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#bbb", fontFamily:"inherit", fontSize:13, cursor:"pointer" }}>✕</button>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#0a0a0a" }}>{user}</div>
              <button onClick={()=>setEditingName(true)} style={{ background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#888", fontSize:12, fontFamily:"inherit", fontWeight:600, padding:"5px 11px", cursor:"pointer" }}>Change name</button>
            </div>
          )}
        </div>

        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>Show RIR selector</div>
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Reps in reserve on each set</div>
            </div>
            <div onClick={() => onUpdate(user, "showRIR", !userSettings[user]?.showRIR)} style={{ width:44, height:24, borderRadius:12, background:userSettings[user]?.showRIR?"#16a34a":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s" }}>
              <div style={{ position:"absolute", top:3, left:userSettings[user]?.showRIR?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        </div>

        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>Auto-log workouts</div>
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Log session automatically after inactivity</div>
            </div>
            <div onClick={() => onUpdate(user, "autoLog", userSettings[user]?.autoLog === false ? true : false)} style={{ width:44, height:24, borderRadius:12, background:userSettings[user]?.autoLog!==false?"#16a34a":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s" }}>
              <div style={{ position:"absolute", top:3, left:userSettings[user]?.autoLog!==false?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
          {userSettings[user]?.autoLog !== false && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, color:"#bbb", marginBottom:8, fontWeight:600 }}>Log after</div>
              <div style={{ display:"flex", gap:8 }}>
                {[2, 4, 8, 12].map(h => {
                  const active = (userSettings[user]?.autoLogHours || 4) === h;
                  return (
                    <button key={h} onClick={() => onUpdate(user, "autoLogHours", h)}
                      style={{ flex:1, padding:"7px 0", background:active?"#0a0a0a":"#f5f5f5", color:active?"#fff":"#888", border:`1.5px solid ${active?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button onClick={handleSignOut} style={{ display:"block", width:"100%", padding:"13px 16px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:12, color:"#bbb", fontSize:12, fontWeight:600, fontFamily:"inherit", cursor:"pointer", textAlign:"left" }}>
          Sign out / switch user
        </button>
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
  const [ex, setEx] = useState({ id:uid(), name:"", isSuperset:false, supersetNameA:"", supersetNameB:"", sets:3, hasDrop:false, trackingType:"reps", exType:"compound", target:"", notes:"" });
  const track = TRACK.find(t => t.key === ex.trackingType) || TRACK[0];
  const canNext = [
    ex.isSuperset ? (ex.supersetNameA.trim().length > 0 && ex.supersetNameB.trim().length > 0) : ex.name.trim().length > 0,
    true, true, true, true,
  ];

  const toggleSuperset = () => setEx(x => {
    const on = !x.isSuperset;
    return { ...x, isSuperset:on, supersetNameA: on ? (x.name||x.supersetNameA) : x.supersetNameA, name: on ? (x.supersetNameA||x.name) : x.supersetNameA };
  });

  const steps = [
    // Step 0 — Name (+ optional superset)
    <div>
      <div style={{ fontSize:15, fontWeight:800, marginBottom:4, color:"#0a0a0a" }}>What's the exercise called?</div>
      <div style={{ fontSize:12, color:"#bbb", marginBottom:12 }}>Type the full name</div>
      <input
        value={ex.isSuperset ? ex.supersetNameA : ex.name}
        onChange={e => {
          const v = e.target.value;
          ex.isSuperset
            ? setEx(x => ({ ...x, supersetNameA:v, name:`${v} / ${x.supersetNameB}` }))
            : setEx(x => ({ ...x, name:v }));
        }}
        placeholder={ex.isSuperset ? "First exercise name" : "e.g. Cable Lateral Raise"}
        autoFocus
        style={{ ...inp, marginBottom:14 }}
      />
      <label onClick={toggleSuperset} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom: ex.isSuperset ? 14 : 0 }}>
        <div style={{ width:36, height:20, borderRadius:10, background:ex.isSuperset?"#0a0a0a":"#d1d5db", position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ position:"absolute", top:2, left:ex.isSuperset?18:2, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
        </div>
        <span style={{ fontSize:13, color:"#555", fontWeight:600 }}>Superset — pair with another exercise</span>
      </label>
      {ex.isSuperset && (
        <input
          value={ex.supersetNameB}
          onChange={e => setEx(x => ({ ...x, supersetNameB:e.target.value, name:`${x.supersetNameA} / ${e.target.value}` }))}
          placeholder="Second exercise name"
          style={{ ...inp }}
        />
      )}
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

function EditorScreen({ split, onSave, onBack, currentUser }) {
  const [scope, setScope] = useState("self");
  const [editDays, setEditDays] = useState(() => [...(split?.days || [])]);
  const [activeDay, setActiveDay] = useState(() => (split?.days || [])[0] || null);
  const [prog, setProg] = useState(() => copy(split?.program || {}));
  const [showAdd, setShowAdd] = useState(false);
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayName, setNewDayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const refs = useRef({});
  const curDay = activeDay && prog[activeDay];
  const exs    = curDay?.exercises || [];
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

  const handleAddDay = () => {
    const name = newDayName.trim();
    if (!name) return;
    setEditDays(d => [...d, name]);
    setProg(p => ({ ...p, [name]: { label: name, subtitle: "", exercises: [] } }));
    setActiveDay(name);
    setNewDayName(""); setShowAddDay(false);
  };

  const handleDeleteDay = (dk) => {
    const remaining = editDays.filter(x => x !== dk);
    setEditDays(remaining);
    setProg(p => { const n = {...p}; delete n[dk]; return n; });
    if (activeDay === dk) setActiveDay(remaining[0] || null);
  };

  const doSave = async () => {
    setSaving(true);
    const updatedSplit = { ...split, days: editDays, program: prog };
    const targets = scope === "both" ? USERS : [currentUser];
    await onSave(updatedSplit, targets);
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); onBack(); }, 900);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", fontFamily:"Barlow,sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Edit Program</div>
          <div style={{ fontSize:11, color:"#bbb" }}>{split?.name} · Hold ⠿ to drag exercises</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px", paddingBottom:100 }}>
        {USERS.includes(currentUser) && (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#15803d", marginBottom:8, letterSpacing:"0.08em", textTransform:"uppercase" }}>Apply changes to</div>
            <div style={{ display:"flex", gap:8 }}>
              {[{k:"self",l:"Just me"},{k:"both",l:"Both Josh & AJ"}].map(s => (
                <button key={s.k} onClick={()=>setScope(s.k)} style={{ padding:"6px 12px", background:scope===s.k?"#15803d":"#fff", color:scope===s.k?"#fff":"#15803d", border:`1.5px solid ${scope===s.k?"#15803d":"#bbf7d0"}`, borderRadius:7, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>{s.l}</button>
              ))}
            </div>
          </div>
        )}

        {/* Day tabs with × delete */}
        <div style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:10, flexWrap:"nowrap", paddingBottom:4 }}>
          {editDays.map(dk => (
            <div key={dk} style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
              <button onClick={()=>setActiveDay(dk)} style={{ background:activeDay===dk?"#0a0a0a":"#f5f5f5", color:activeDay===dk?"#fff":"#888", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderTopLeftRadius:8, borderBottomLeftRadius:8, borderTopRightRadius:0, borderBottomRightRadius:0, padding:"5px 10px", fontSize:11, fontFamily:"inherit", fontWeight:activeDay===dk?700:500, cursor:"pointer", whiteSpace:"nowrap", borderRight:"none" }}>{dk}</button>
              <button onClick={()=>handleDeleteDay(dk)} style={{ background:activeDay===dk?"#333":"#f5f5f5", color:activeDay===dk?"#aaa":"#ccc", border:`1.5px solid ${activeDay===dk?"#0a0a0a":"#e8e8e8"}`, borderTopRightRadius:8, borderBottomRightRadius:8, borderTopLeftRadius:0, borderBottomLeftRadius:0, padding:"5px 7px", fontSize:12, cursor:"pointer", lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>

        {/* Add day */}
        {showAddDay ? (
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input value={newDayName} onChange={e=>setNewDayName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddDay()} placeholder="Day name (e.g. Push Day)" autoFocus style={{ ...inp, flex:1 }} />
            <button onClick={handleAddDay} style={{ padding:"7px 14px", background:"#0a0a0a", color:"#fff", border:"none", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>Add</button>
            <button onClick={()=>{setShowAddDay(false);setNewDayName("");}} style={{ padding:"7px 10px", background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#bbb", fontFamily:"inherit", fontSize:13, cursor:"pointer" }}>✕</button>
          </div>
        ) : (
          <button onClick={()=>setShowAddDay(true)} style={{ width:"100%", padding:"8px 11px", background:"transparent", border:"1.5px dashed #d0d0d0", borderRadius:9, color:"#aaa", fontSize:12, fontFamily:"inherit", fontWeight:600, cursor:"pointer", marginBottom:14, textAlign:"left" }}>+ Add workout day</button>
        )}

        {curDay ? <>
          {curDay?.label && curDay.label !== activeDay && <div style={{ fontSize:11, color:"#bbb", marginBottom:10, fontStyle:"italic" }}>{curDay.label}</div>}
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
        </> : editDays.length === 0 ? null : (
          <div style={{ textAlign:"center", padding:"30px 20px", color:"#bbb", fontSize:13 }}>Select a day above to edit its exercises.</div>
        )}
      </div>

      <div style={{ borderTop:"1px solid #e8e8e8", padding:"12px 14px 16px", background:"#fff", flexShrink:0 }}>
        <button onClick={doSave} disabled={saving} style={{ width:"100%", padding:14, background:saved?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, fontFamily:"inherit", cursor:"pointer", letterSpacing:"0.06em" }}>
          {saving ? "SAVING..." : saved ? "✓ SAVED!" : `SAVE — ${scope==="both"?"Both Josh & AJ":"Just me"}`}
        </button>
      </div>

      {showAdd && <AddModal onAdd={ex=>{setExs([...exs,ex]);setShowAdd(false);}} onClose={()=>setShowAdd(false)} />}
    </div>
  );
}

// ── Reconciliation Modal ────────────────────────────────────────────────────

function ReconciliationModal({ sharedSession, loggedEntries, userDayExercises, day, onConfirm, onSaveAsSolo }) {
  // sharedSession.exercises = initiator's exercise list for this day
  // loggedEntries = what this user entered (keyed by their own exercise IDs)
  // userDayExercises = this user's own program exercises for the day

  // Build display list: user's own exercises first, then shared-only extras
  const userIds = new Set((userDayExercises || []).map(e => e.id));
  const sharedExercises = sharedSession?.exercises || [];

  // Match shared exercises to user exercises by name (case-insensitive)
  const matchName = (sharedName) =>
    (userDayExercises || []).find(e => e.name.toLowerCase() === sharedName.toLowerCase());

  // Build rows: for each user exercise, check if it's in the shared list (by name)
  // Then append any shared exercises NOT in user's program
  const rows = [];
  (userDayExercises || []).forEach(ex => {
    const sharedMatch = sharedExercises.find(s => s.name.toLowerCase() === ex.name.toLowerCase());
    rows.push({ id: ex.id, name: ex.name, userEx: ex, sharedEx: sharedMatch || null, isExtra: false });
  });
  sharedExercises.forEach(sex => {
    const alreadyIn = rows.some(r => r.name.toLowerCase() === sex.name.toLowerCase());
    if (!alreadyIn) rows.push({ id: sex.id, name: sex.name, userEx: null, sharedEx: sex, isExtra: true });
  });

  const initSelected = {};
  rows.forEach(r => { initSelected[r.id] = !!loggedEntries[r.id]; });
  const [selected, setSelected] = useState(initSelected);
  const toggle = id => setSelected(s => ({ ...s, [id]: !s[id] }));

  const handleConfirm = () => {
    const confirmed = {};
    rows.forEach(r => {
      if (!selected[r.id]) return;
      const entry = loggedEntries[r.id];
      if (!entry) return;
      confirmed[r.id] = entry;
    });
    onConfirm(confirmed);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", maxHeight:"82vh", display:"flex", flexDirection:"column", paddingBottom:"env(safe-area-inset-bottom,16px)" }}>
        <div style={{ padding:"20px 20px 14px", borderBottom:"1px solid #f0f0f0", flexShrink:0 }}>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:4 }}>Review shared session</div>
          <div style={{ fontSize:12, color:"#888" }}>Select exercises to count toward your history. Uncheck any you skipped.</div>
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {rows.map(r => {
            const hasData = !!loggedEntries[r.id];
            const isSel = selected[r.id];
            return (
              <div key={r.id} onClick={() => hasData && toggle(r.id)}
                style={{ display:"flex", alignItems:"center", padding:"13px 20px", borderBottom:"1px solid #f5f5f5", opacity:hasData?1:0.45, cursor:hasData?"pointer":"default" }}>
                <div style={{ width:22, height:22, borderRadius:"50%", border:`2px solid ${isSel&&hasData?"#16a34a":"#d0d0d0"}`, background:isSel&&hasData?"#16a34a":"transparent", marginRight:14, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", fontWeight:800 }}>
                  {isSel && hasData ? "✓" : ""}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#0a0a0a" }}>{r.name}</div>
                  <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>
                    {hasData ? `${loggedEntries[r.id]?.sets?.filter(s=>s.weight||s.reps||s.laps).length||0} sets logged` : "Not logged"}
                    {r.isExtra && <span style={{ color:"#ea580c", marginLeft:6, fontWeight:600 }}>· New exercise</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding:"14px 20px", borderTop:"1px solid #f0f0f0", display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
          <button onClick={handleConfirm} style={{ width:"100%", padding:14, background:"#ea580c", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer" }}>
            Confirm — Log shared session
          </button>
          <button onClick={onSaveAsSolo} style={{ width:"100%", padding:11, background:"transparent", color:"#888", border:"1.5px solid #e8e8e8", borderRadius:12, fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            Save as solo instead
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Share Split Modal ─────────────────────────────────────────────────────────

function ShareSplitModal({ split, currentUser, onShare, onClose }) {
  const [targetUser, setTargetUser] = useState("");
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);

  const handleShare = async () => {
    const t = targetUser.trim();
    if (!t || t === currentUser) return;
    setSharing(true);
    await onShare(split, t);
    setDone(true);
    setTimeout(onClose, 1600);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px 40px" }}>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Share split</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:20, lineHeight:1.5 }}>
          <strong>"{split?.name}"</strong> will be copied to the recipient as their own independent split. Changes you make after sharing won't sync automatically.
        </div>
        <input value={targetUser} onChange={e=>setTargetUser(e.target.value)}
          placeholder="Recipient username" autoCorrect="off" autoCapitalize="words" spellCheck={false}
          style={{ ...inp, width:"100%", boxSizing:"border-box", marginBottom:12, fontSize:15, padding:"11px 14px" }} />
        <button onClick={handleShare} disabled={!targetUser.trim()||sharing||done}
          style={{ width:"100%", padding:13, background:done?"#16a34a":"#0a0a0a", color:"#fff", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor:"pointer" }}>
          {done ? "✓ Sent!" : sharing ? "Sharing..." : "Share split"}
        </button>
      </div>
    </div>
  );
}

// ── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ user, userDoc, loadingSplits, onSelectSplit, onCreateSplit, onSettings, onPerformance, onDeleteSplit }) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const submit = () => {
    const n = newName.trim();
    if (!n) return;
    onCreateSplit(n);
    setShowNew(false);
    setNewName("");
  };

  return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", padding:"52px 20px 40px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ maxWidth:340, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:40 }}>
          <div>
            <div style={{ fontSize:44, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em", lineHeight:1, marginBottom:8 }}>STACK</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#888" }}>Hey, {user}</div>
          </div>
          <button onClick={onSettings} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:"6px 0 0 0" }}>⚙️</button>
        </div>

        {/* Splits label */}
        <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>Your splits</div>

        {/* Split cards */}
        {loadingSplits ? (
          <div style={{ padding:"28px 0 8px", color:"#bbb", fontSize:13, fontWeight:600 }}>Loading...</div>
        ) : userDoc.splits.length === 0 && !showNew ? (
          <div style={{ padding:"28px 0 8px", color:"#bbb", fontSize:13, fontWeight:600 }}>No splits yet — create one below</div>
        ) : null}
        {userDoc.splits.map(split => {
          const isActive = split.id === userDoc.activeSplitId;
          const isConfirming = confirmDelete === split.id;
          return (
            <div key={split.id} style={{ display:"flex", alignItems:"stretch", gap:8, marginBottom:10 }}>
              <button onClick={() => { onSelectSplit(split.id); setConfirmDelete(null); }}
                style={{ flex:1, padding:"18px 20px",
                  background: isActive ? "#0a0a0a" : "#fff",
                  border: isActive ? "1.5px solid #0a0a0a" : "1.5px solid #e8e8e8",
                  borderRadius:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit",
                  boxShadow: isActive ? "0 4px 16px rgba(0,0,0,0.15)" : "none" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:16, fontWeight:900, color: isActive ? "#fff" : "#0a0a0a", letterSpacing:"-0.01em" }}>{split.name}</div>
                  {isActive && <div style={{ fontSize:10, fontWeight:800, color:"#555", letterSpacing:"0.1em" }}>ACTIVE</div>}
                </div>
                <div style={{ fontSize:12, fontWeight:600, color: isActive ? "#666" : "#bbb", marginTop:5 }}>
                  {split.days.length} {split.days.length === 1 ? "day" : "days"}
                </div>
              </button>
              <button
                onClick={() => {
                  if (isConfirming) { onDeleteSplit(split.id); setConfirmDelete(null); }
                  else setConfirmDelete(split.id);
                }}
                onBlur={() => setTimeout(() => setConfirmDelete(c => c === split.id ? null : c), 150)}
                style={{ padding:"0 14px", background: isConfirming ? "#fee2e2" : "#fff", border: isConfirming ? "1.5px solid #fca5a5" : "1.5px solid #e8e8e8", borderRadius:16, cursor:"pointer", fontSize: isConfirming ? 11 : 16, color: isConfirming ? "#dc2626" : "#ccc", flexShrink:0, fontFamily:"inherit", fontWeight:700, transition:"all .15s", minWidth:44 }}>
                {isConfirming ? "Remove?" : "✕"}
              </button>
            </div>
          );
        })}

        {/* Create new split */}
        {showNew ? (
          <div style={{ marginBottom:10, padding:"16px 18px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:16 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setShowNew(false); setNewName(""); } }}
              placeholder="Name your split..."
              style={{ width:"100%", border:"none", outline:"none", fontSize:15, fontWeight:700, fontFamily:"inherit", background:"transparent", color:"#0a0a0a" }} />
            <div style={{ fontSize:11, color:"#bbb", marginTop:6 }}>Enter to create · Esc to cancel</div>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)}
            style={{ display:"block", width:"100%", marginBottom:10, padding:"16px 18px", background:"transparent", border:"1.5px dashed #d8d8d8", borderRadius:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:"#bbb", fontSize:14, fontWeight:700 }}>
            + New split
          </button>
        )}

        {/* Performance */}
        <button onClick={onPerformance}
          style={{ display:"block", width:"100%", marginTop:16, padding:"16px 18px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
          <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>📊 Performance</div>
          <div style={{ fontSize:12, color:"#bbb", marginTop:3 }}>PR board · 1RM calculator</div>
        </button>

      </div>
    </div>
  );
}

// ── Partner Session Modal ─────────────────────────────────────────────────────

function PartnerSessionModal({ activeSplit, activeDays, currentUser, onShareSplit, onStartSession, onClose }) {
  const [partner, setPartner] = useState("");
  const [mode, setMode] = useState(null); // "share" | "session"
  const [selectedDay, setSelectedDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const partnerTrimmed = partner.trim();
  const valid = partnerTrimmed && partnerTrimmed.toLowerCase() !== currentUser.toLowerCase();

  const handleShare = async () => {
    if (!valid) return;
    setBusy(true);
    await onShareSplit(partnerTrimmed, activeSplit);
    setDone(true);
    setTimeout(onClose, 1600);
  };

  const handleStartSession = async () => {
    if (!valid || !selectedDay) return;
    setBusy(true);
    await onStartSession(partnerTrimmed, selectedDay);
    // onStartSession navigates away, so no need to close
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px", paddingBottom:"max(32px,env(safe-area-inset-bottom,32px))", fontFamily:"Barlow,sans-serif" }}>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Partner training</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:18, lineHeight:1.5 }}>
          Train with anyone on STACK — share a split or start a live shared session.
        </div>

        {/* Partner input */}
        <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.1em", marginBottom:6 }}>PARTNER USERNAME</div>
        <input
          value={partner}
          onChange={e => { setPartner(e.target.value); setMode(null); setSelectedDay(null); setDone(false); }}
          placeholder="Their name..."
          autoCorrect="off" autoCapitalize="words" spellCheck={false}
          style={{ ...inp, width:"100%", boxSizing:"border-box", marginBottom:16, fontSize:15, padding:"11px 14px" }}
        />

        {/* Mode picker */}
        <div style={{ display:"flex", gap:8, marginBottom:18 }}>
          <button onClick={() => { setMode("share"); setSelectedDay(null); }}
            style={{ flex:1, padding:"12px 10px", background: mode === "share" ? "#0a0a0a" : "#f5f5f5", color: mode === "share" ? "#fff" : "#555", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>
            Share split
          </button>
          <button onClick={() => setMode("session")}
            style={{ flex:1, padding:"12px 10px", background: mode === "session" ? "#0a0a0a" : "#f5f5f5", color: mode === "session" ? "#fff" : "#555", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>
            Start session
          </button>
        </div>

        {/* Share split mode */}
        {mode === "share" && (
          <>
            <div style={{ fontSize:12, color:"#888", marginBottom:14, lineHeight:1.5 }}>
              <strong>"{activeSplit?.name}"</strong> will be copied to {partnerTrimmed || "them"} as their own independent split. Changes after sharing won't sync.
            </div>
            <button onClick={handleShare} disabled={!valid || busy || done}
              style={{ width:"100%", padding:13, background: done ? "#16a34a" : valid ? "#0a0a0a" : "#e8e8e8", color: valid ? "#fff" : "#bbb", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor: valid && !busy && !done ? "pointer" : "default" }}>
              {done ? "✓ Sent!" : busy ? "Sharing..." : "Share split →"}
            </button>
          </>
        )}

        {/* Start session mode */}
        {mode === "session" && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.1em", marginBottom:8 }}>PICK A DAY</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
              {activeDays.map(dk => (
                <button key={dk} onClick={() => setSelectedDay(dk)}
                  style={{ padding:"8px 14px", background: selectedDay === dk ? "#0a0a0a" : "#f5f5f5", color: selectedDay === dk ? "#fff" : "#555", border:"none", borderRadius:20, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  {dk}
                </button>
              ))}
            </div>
            <button onClick={handleStartSession} disabled={!valid || !selectedDay || busy}
              style={{ width:"100%", padding:13, background: valid && selectedDay ? "#ea580c" : "#e8e8e8", color: valid && selectedDay ? "#fff" : "#bbb", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor: valid && selectedDay && !busy ? "pointer" : "default" }}>
              {busy ? "Starting..." : "Start shared session →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Day Select Screen ────────────────────────────────────────────────────────

function DaySelectScreen({ activeSplit, activeDays, activeProgram, onSelectDay, onEditor, onReorderDays, onBack, currentUser, onShareSplitWith, onStartSessionWith, joinableSession, onJoinSharedSession }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const dayRefs = useRef({});

  useEffect(() => {
    if (dragIdx === null) return;
    const move = cy => {
      let target = activeDays.length - 1;
      for (let i = 0; i < activeDays.length; i++) {
        const el = dayRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (cy < r.top + r.height / 2) { target = i; break; }
      }
      setOverIdx(target);
    };
    const mm = e => move(e.clientY);
    const tm = e => { e.preventDefault(); move(e.touches[0].clientY); };
    const end = () => {
      if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
        const d = [...activeDays]; const [item] = d.splice(dragIdx, 1); d.splice(overIdx, 0, item);
        onReorderDays(d);
      }
      setDragIdx(null); setOverIdx(null);
    };
    window.addEventListener("mousemove", mm); window.addEventListener("touchmove", tm, { passive:false });
    window.addEventListener("mouseup", end); window.addEventListener("touchend", end);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("touchmove", tm); window.removeEventListener("mouseup", end); window.removeEventListener("touchend", end); };
  }, [dragIdx, overIdx, activeDays, onReorderDays]);

  const displayDays = dragIdx !== null && overIdx !== null && dragIdx !== overIdx ? (() => {
    const d = [...activeDays]; const [item] = d.splice(dragIdx, 1); d.splice(overIdx, 0, item); return d;
  })() : activeDays;

  return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", padding:"48px 20px 40px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ maxWidth:340, margin:"0 auto" }}>

        {/* Back */}
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#888", fontSize:13, fontWeight:800, cursor:"pointer", padding:"0 0 28px 0", fontFamily:"inherit", letterSpacing:"0.06em", display:"block" }}>← STACK</button>

        {/* Split title */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>Today's workout</div>
          <div style={{ fontSize:26, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.02em", lineHeight:1.1 }}>{activeSplit?.name || "No split selected"}</div>
        </div>

        {/* Join banner — pending shared session invite */}
        {joinableSession && (
          <div style={{ background:"#fff7ed", border:"1.5px solid #fed7aa", borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:800, color:"#ea580c", letterSpacing:"0.06em", marginBottom:4 }}>SHARED SESSION WAITING</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#0a0a0a", marginBottom:10 }}>
              {joinableSession.initiator} started a session · {joinableSession.day}
            </div>
            <button onClick={() => onJoinSharedSession(joinableSession)}
              style={{ width:"100%", padding:"11px 14px", background:"#ea580c", color:"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>
              Join session →
            </button>
          </div>
        )}

        {/* Day cards */}
        {activeDays.length > 0 ? displayDays.map(dk => {
          const origIdx = activeDays.indexOf(dk);
          const isDragging = dragIdx === origIdx;
          return (
            <div key={dk} ref={el => dayRefs.current[origIdx] = el}
              style={{ display:"flex", alignItems:"center", marginBottom:10, opacity:isDragging ? 0.4 : 1 }}>
              <div onMouseDown={() => setDragIdx(origIdx)} onTouchStart={() => setDragIdx(origIdx)}
                style={{ cursor:"grab", color:"#ccc", fontSize:18, padding:"0 10px 0 2px", touchAction:"none", userSelect:"none", flexShrink:0 }}>⠿</div>
              <button onClick={() => onSelectDay(dk)}
                style={{ flex:1, padding:"14px 16px", background:"#fff", border:`1.5px solid ${overIdx === origIdx && dragIdx !== origIdx ? "#888" : "#e8e8e8"}`, borderRadius:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>{dk}</div>
                <div style={{ fontSize:12, color:"#bbb", marginTop:2 }}>
                  {DAY_META[dk] ? `${DAY_META[dk].day} · ${DAY_META[dk].sub}` : (activeProgram[dk]?.subtitle || "")}
                </div>
              </button>
            </div>
          );
        }) : (
          <div style={{ textAlign:"center", padding:"48px 20px", color:"#bbb" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#888", marginBottom:8 }}>No workout days yet</div>
            <div style={{ fontSize:13 }}>Tap "Edit program" to add days to this split.</div>
          </div>
        )}

        <button onClick={onEditor}
          style={{ display:"block", width:"100%", marginTop:10, padding:"13px 16px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:"#bbb", fontSize:13, fontWeight:700 }}>
          ✏️  Edit program
        </button>

        <button onClick={() => setShowPartnerModal(true)}
          style={{ display:"block", width:"100%", marginTop:10, padding:"13px 16px", background:"transparent", border:"1.5px solid #e8e8e8", borderRadius:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:"#888", fontSize:13, fontWeight:700 }}>
          Partner training →
        </button>

      </div>

      {showPartnerModal && (
        <PartnerSessionModal
          activeSplit={activeSplit}
          activeDays={activeDays}
          currentUser={currentUser}
          onShareSplit={async (partner, split) => { await onShareSplitWith(partner, split); }}
          onStartSession={async (partner, dayKey) => { setShowPartnerModal(false); await onStartSessionWith(partner, dayKey); }}
          onClose={() => setShowPartnerModal(false)}
        />
      )}
    </div>
  );
}

// ── Onboard Screen ──────────────────────────────────────────────────────────

function OnboardScreen({ onSave }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    await onSave(trimmed);
  };

  return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ width:"100%", maxWidth:340 }}>
        <div style={{ marginBottom:40 }}>
          <div style={{ fontSize:48, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em", lineHeight:1 }}>STACK</div>
        </div>
        <div style={{ fontSize:13, color:"#888", fontWeight:600, marginBottom:20 }}>What's your name?</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          placeholder="Your name"
          autoFocus
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          style={{ ...inp, fontSize:16, padding:"12px 14px", marginBottom:12 }}
        />
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          style={{ display:"block", width:"100%", padding:"14px 18px", background:name.trim()?"#0a0a0a":"#e8e8e8", border:"none", borderRadius:12, color:name.trim()?"#fff":"#bbb", fontSize:15, fontWeight:800, fontFamily:"inherit", cursor:name.trim()?"pointer":"default", transition:"background .2s, color .2s" }}
        >
          {saving ? "..." : "Let's go →"}
        </button>
      </div>
    </div>
  );
}

// ── App Root ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen]       = useState("loading");
  const [uid, setUid]             = useState(null);
  const [user, setUser]           = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [splitsData, setSplitsData] = useState({});   // { [userName]: { activeSplitId, splits[] } }
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [userSettings, setUserSettings] = useState({});
  const [relationships, setRelationships] = useState([]);
  const [sharedSession, setSharedSession] = useState(null);
  const [joinableSession, setJoinableSession] = useState(null);
  const [pendingReconciliation, setPendingReconciliation] = useState(null);

  const currentUser  = viewingUser || user;
  const isReadOnly   = !!viewingUser;
  const otherUser    = USERS.find(u => u !== user);

  // Derived from active user's splits doc
  const userDoc      = splitsData[currentUser] || { activeSplitId: null, splits: [] };
  const activeSplit  = userDoc.splits.find(s => s.id === userDoc.activeSplitId) || userDoc.splits[0] || null;
  const activeProgram = activeSplit?.program || {};
  const activeDays   = activeSplit?.days || [];

  // Anonymous Auth
  useEffect(() => {
    const cached = localStorage.getItem("stack_user_name");
    if (cached) { setUser(canonicalName(cached)); setScreen("home"); }
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUid(firebaseUser.uid);
        if (!cached) {
          const profile = await fbLoadUserProfile(firebaseUser.uid);
          if (profile?.name) { setUser(canonicalName(profile.name)); setScreen("home"); }
          else setScreen("onboard");
        }
      } else {
        signInAnonymously(auth).catch(() => { if (!cached) setScreen("onboard"); });
      }
    });
    const timeout = setTimeout(() => setScreen(s => s === "loading" ? "onboard" : s), 6000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  // Load splits + settings when active user changes
  useEffect(() => {
    if (!currentUser) return;
    setLoadingSplits(true);
    const isNewUser = !USERS.includes(currentUser);
    Promise.all([fbLoadSplits(currentUser, isNewUser), fbLoadSettings(currentUser)]).then(async ([sd, s]) => {
      const migrated = await migrateExerciseNotes(currentUser, sd);
      setSplitsData(prev => ({ ...prev, [currentUser]: migrated }));
      setUserSettings(prev => ({ ...prev, [currentUser]: s }));
      setLoadingSplits(false);
    });
  }, [currentUser]);

  // Load relationships + seed Josh↔AJ when logged-in user is known
  useEffect(() => {
    if (!user) return;
    fbEnsureRelationship({ users: ["Josh", "AJ"], type: "training-partner" });
    fbLoadRelationships(user).then(setRelationships);
  }, [user]);

  // Listen for joinable shared sessions (invites where current user is in invitees)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "sharedSessions"), where("invitees", "array-contains", user), where("status", "==", "pending"));
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setJoinableSession(docs.length > 0 ? docs[0] : null);
    });
    return () => unsub();
  }, [user]);

  const handleOnboard = async (name) => {
    const normalized = canonicalName(name);
    await fbSaveUserProfile(uid, normalized);
    setUser(normalized); setScreen("home");
  };

  const handleChangeName = async (name) => {
    const normalized = canonicalName(name);
    await fbSaveUserProfile(uid, normalized);
    setUser(normalized); setScreen("home");
  };

  const handleSwitchSplit = (splitId) => {
    setSplitsData(prev => {
      const ud = prev[user] || { activeSplitId: null, splits: [] };
      const newDoc = { ...ud, activeSplitId: splitId };
      fbSaveSplits(user, newDoc);
      return { ...prev, [user]: newDoc };
    });
    setActiveDay(null);
  };

  const handleCreateSplit = (name) => {
    const id = newSplitId();
    setSplitsData(prev => {
      const ud = prev[user] || { activeSplitId: null, splits: [] };
      const newDoc = { activeSplitId: id, splits: [...ud.splits, { id, name, days: [], program: {} }] };
      fbSaveSplits(user, newDoc);
      return { ...prev, [user]: newDoc };
    });
    setActiveDay(null);
  };

  // Called by EditorScreen when saving — updates the split for each target user
  const handleSaveSplit = async (updatedSplit, targets) => {
    // Fetch any target user's data that isn't in local state yet — prevents overwriting their Firestore doc
    const freshData = {};
    for (const targetUser of targets) {
      if (!splitsData[targetUser]) {
        freshData[targetUser] = await fbLoadSplits(targetUser, !USERS.includes(targetUser));
      }
    }
    const merged = { ...splitsData, ...freshData };
    if (Object.keys(freshData).length > 0) setSplitsData(prev => ({ ...prev, ...freshData }));

    for (const targetUser of targets) {
      const ud = merged[targetUser] || { activeSplitId: updatedSplit.id, splits: [] };
      const splits = ud.splits.length === 0
        ? [{ ...updatedSplit, id: ud.activeSplitId || updatedSplit.id }]
        : ud.splits.map(s => {
            const matches = targetUser === user ? s.id === ud.activeSplitId : s.name.toLowerCase() === updatedSplit.name.toLowerCase();
            if (!matches) return s;
            const program = targetUser === user ? updatedSplit.program : remapProgramIds(updatedSplit.program, s.program);
            return { ...s, days: updatedSplit.days, program };
          });
      const newDoc = { activeSplitId: ud.activeSplitId || updatedSplit.id, splits };
      await fbSaveSplits(targetUser, newDoc);
      setSplitsData(prev => ({ ...prev, [targetUser]: newDoc }));
    }
  };

  const handleReorderDays = (newDays) => {
    if (!activeSplit) return;
    setSplitsData(prev => {
      const ud = prev[user];
      const splits = ud.splits.map(s => s.id === ud.activeSplitId ? { ...s, days: newDays } : s);
      const newDoc = { ...ud, splits };
      fbSaveSplits(user, newDoc);
      return { ...prev, [user]: newDoc };
    });
  };

  const handleUpdateSetting = async (u, key, val) => {
    const next = { ...userSettings[u], [key]: val };
    setUserSettings(prev => ({ ...prev, [u]: next }));
    await fbSaveSettings(u, next);
  };

  // Delete a split from the current user's program
  const handleDeleteSplit = (splitId) => {
    setSplitsData(prev => {
      const ud = prev[user] || { activeSplitId: null, splits: [] };
      const splits = ud.splits.filter(s => s.id !== splitId);
      const activeSplitId = ud.activeSplitId === splitId ? (splits[0]?.id || null) : ud.activeSplitId;
      const newDoc = { ...ud, activeSplitId, splits };
      fbSaveSplits(user, newDoc);
      return { ...prev, [user]: newDoc };
    });
  };

  // Start a shared session for a specific day with any partner
  const handleStartSessionWith = async (partner, dayKey) => {
    if (!activeSplit) return;
    const dayExercises = (activeProgram[dayKey]?.exercises || []);
    const id = await fbCreateSharedSession({
      initiator: user,
      invitees: [canonicalName(partner)],
      day: dayKey,
      splitName: activeSplit.name,
      exercises: dayExercises,
      status: "pending",
    });
    if (id) {
      setSharedSession({ id, initiator: user, invitees: [canonicalName(partner)], day: dayKey, exercises: dayExercises, status: "active" });
      await fbUpdateSharedSession(id, { status: "active" });
      setActiveDay(dayKey);
      setScreen("workout");
    }
  };

  // Join a pending shared session invite
  const handleJoinSharedSession = async (session) => {
    await fbUpdateSharedSession(session.id, { status: "active" });
    setSharedSession({ ...session, status: "active" });
    setActiveDay(session.day);
    setJoinableSession(null);
    setScreen("workout");
  };

  // Called by WorkoutScreen "REVIEW & LOG SESSION" when in shared mode
  const handleSharedSave = (entries, sessions, day) => {
    const userDayExercises = activeProgram[day]?.exercises || [];
    setPendingReconciliation({ entries, sessions, day, userDayExercises });
  };

  // Reconciliation confirmed — merge selected exercises and log
  const handleReconciliationConfirm = async (confirmedEntries) => {
    const { sessions, day } = pendingReconciliation;
    const d = new Date();
    const dateStr = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    const nextSessions = [...sessions, { date: dateStr, entries: confirmedEntries, source: "shared" }];
    await fbSaveSessions(user, day, nextSessions);
    await fbClearDraft(user, day);
    if (sharedSession?.id) await fbUpdateSharedSession(sharedSession.id, { status: "done" });
    setSharedSession(null);
    setPendingReconciliation(null);
    setScreen("dayselect");
  };

  // Save as solo — ignore shared context, log only user's own entries
  const handleSaveAsSolo = async () => {
    const { entries, sessions, day } = pendingReconciliation;
    const d = new Date();
    const dateStr = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    const nextSessions = [...sessions, { date: dateStr, entries, source: "solo" }];
    await fbSaveSessions(user, day, nextSessions);
    await fbClearDraft(user, day);
    setSharedSession(null);
    setPendingReconciliation(null);
    setScreen("dayselect");
  };

  // Share a split as a one-time template copy to any user (from PartnerSessionModal)
  const handleShareSplitWith = async (targetUser, split) => {
    await fbShareSplitAsTemplate(user, split, canonicalName(targetUser));
  };

  const font = <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />;

  // ── Loading screen
  if (screen === "loading") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", background:"#f5f5f5" }}>
      {font}<div style={{ fontSize:48, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em" }}>STACK</div>
    </div>
  );

  if (screen === "onboard") return <OnboardScreen onSave={handleOnboard} />;

  if (screen === "home") return (
    <div style={{ height:"100dvh" }}>{font}
      <HomeScreen
        user={user} userDoc={userDoc} loadingSplits={loadingSplits}
        onSelectSplit={id => { handleSwitchSplit(id); setScreen("dayselect"); }}
        onCreateSplit={name => { handleCreateSplit(name); setScreen("dayselect"); }}
        onSettings={() => setScreen("settings")}
        onPerformance={() => setScreen("performance")}
        onDeleteSplit={handleDeleteSplit}
      />
    </div>
  );

  if (screen === "settings") return (
    <div style={{ height:"100dvh" }}>{font}
      <SettingsScreen user={user} userSettings={userSettings} onUpdate={handleUpdateSetting} onBack={()=>setScreen("home")} onChangeName={handleChangeName} />
    </div>
  );

  if (screen === "dayselect") return (
    <div style={{ height:"100dvh" }}>{font}
      <DaySelectScreen
        activeSplit={activeSplit}
        activeDays={activeDays} activeProgram={activeProgram}
        onSelectDay={dk => { setActiveDay(dk); setScreen("workout"); }}
        onEditor={() => setScreen("editor")}
        onReorderDays={handleReorderDays}
        onBack={() => setScreen("home")}
        currentUser={user}
        onShareSplitWith={handleShareSplitWith}
        onStartSessionWith={handleStartSessionWith}
        joinableSession={joinableSession}
        onJoinSharedSession={handleJoinSharedSession}
      />
    </div>
  );

  if (screen === "performance") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <PerformanceScreen user={user} program={activeProgram} onBack={()=>setScreen("home")} />
    </div>
  );

  if (screen === "editor") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <EditorScreen split={activeSplit} currentUser={user} onSave={handleSaveSplit} onBack={()=>setScreen("dayselect")} />
    </div>
  );

  // ── Workout screen
  return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      {loadingSplits ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", color:"#bbb" }}>Loading...</div>
      ) : (
        <WorkoutScreen
          user={currentUser}
          readOnly={isReadOnly}
          program={activeProgram}
          days={activeDays}
          showRIR={userSettings[currentUser]?.showRIR !== false}
          autoLog={userSettings[currentUser]?.autoLog !== false}
          autoLogHours={userSettings[currentUser]?.autoLogHours || 4}
          onBack={() => { setSharedSession(null); setScreen("dayselect"); setViewingUser(null); }}
          otherUser={otherUser}
          onViewOther={() => isReadOnly ? setViewingUser(null) : setViewingUser(otherUser)}
          initDay={activeDay}
          sharedSession={sharedSession}
          onSharedSave={handleSharedSave}
        />
      )}

      {/* Reconciliation modal — shown after shared session "REVIEW & LOG SESSION" */}
      {pendingReconciliation && (
        <ReconciliationModal
          sharedSession={sharedSession}
          loggedEntries={pendingReconciliation.entries}
          userDayExercises={pendingReconciliation.userDayExercises}
          day={pendingReconciliation.day}
          onConfirm={handleReconciliationConfirm}
          onSaveAsSolo={handleSaveAsSolo}
        />
      )}

    </div>
  );
}
