// Distance and Height are measurements taken *during* a rep, not a rep count
// themselves (e.g. a broad jump: how far, and how many jumps) — pairWithReps
// adds a fixed companion Reps column automatically, no extra setup needed.
export const TRACK = [
  { key: "reps",     label: "Reps",     ph: "e.g. 10" },
  { key: "laps",     label: "Laps",     ph: "e.g. 3" },
  { key: "time",     label: "Time",     ph: "e.g. 45 sec" },
  { key: "distance", label: "Distance", ph: "e.g. 8 ft", pairWithReps: true },
  { key: "height",   label: "Height",   ph: "e.g. 24 in", pairWithReps: true },
];
export const EX_TYPES = [
  { key: "compound",     label: "Compound" },
  { key: "isolation",   label: "Isolation" },
  { key: "carries",     label: "Carries" },
  { key: "plyometric",  label: "Plyometric" },
  { key: "conditioning",label: "Cardio / Conditioning" },
];
export const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Legs", "Arms", "Core", "Other"];

// Best-effort default for exercises that predate the muscle group field (or
// skip picking one) — keyword match against the name. Always overridable;
// this just saves a tap for the common case instead of defaulting to "Other".
const MUSCLE_GROUP_KEYWORDS = [
  { group: "Chest",     words: ["bench", "chest", "fly", "flye", "pec", "incline press", "decline press", "dip"] },
  { group: "Back",      words: ["row", "pulldown", "pull-down", "pullup", "pull-up", "chinup", "chin-up", "lat ", "lat-", "deadlift", "rdl", "shrug", "pullover"] },
  { group: "Shoulders", words: ["shoulder", "ohp", "overhead press", "military press", "lateral raise", "rear delt", "face pull", "upright row", "delt"] },
  { group: "Legs",      words: ["squat", "leg", "lunge", "calf", "hamstring", "quad", "glute", "hip thrust", "step-up", "step up"] },
  { group: "Arms",      words: ["curl", "tricep", "bicep", "skull", "pushdown", "push-down", "forearm"] },
  { group: "Core",      words: ["ab", "core", "crunch", "plank", "sit-up", "situp", "woodchop", "oblique"] },
];
export const inferMuscleGroup = name => {
  const n = (name || "").toLowerCase();
  for (const { group, words } of MUSCLE_GROUP_KEYWORDS) {
    if (words.some(w => n.includes(w))) return group;
  }
  return "Other";
};
export const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const TODAY = () => { const d = new Date(); return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
export const TODAYFMT = () => { const d = new Date(); return `${DAYS[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
export const parseDateStr = str => {
  if (!str) return null;
  const [m,d,y] = str.split("/");
  return new Date(2000+parseInt(y), parseInt(m)-1, parseInt(d));
};
export const fmtDate = str => {
  const dt = parseDateStr(str);
  if (!dt) return null;
  const [m,d,y] = str.split("/");
  return `${DAYS[dt.getDay()]} ${m}/${d}/${y}`;
};
export const copy = x => JSON.parse(JSON.stringify(x));
export const uid = () => `ex_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
export const newSplitId = () => `sp_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
export const roundTo = (n, step) => Math.round(n / step) * step;
export const PCTS = [95, 90, 85, 80, 75, 70, 65];
export const AUTO_LOG_HOURS = 3;

// Per-word title case for user-typed titles (splits, days, exercises) — leaves
// already-all-caps tokens (DB, RDL, OHP) alone.
export const titleCase = name => (name || "").trim().split(/\s+/).map(w => {
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}).join(" ");

// Deterministic exercise catalog id derived from the name — same exercise name
// always resolves to the same id, across splits, devices, and shared copies.
export const slugify = name => (name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exercise";

export const inp = {
  background:"#f8f8f8", border:"1px solid #e8e8e8", borderRadius:7,
  padding:"7px 9px", color:"#0a0a0a", fontSize:13, fontFamily:"Barlow,sans-serif",
  outline:"none", width:"100%", boxSizing:"border-box",
};
