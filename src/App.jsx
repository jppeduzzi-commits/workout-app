import { useState, useEffect, useCallback } from "react";
import { storageSet, storageGet } from "./storage";

const USERS = ["Josh", "AJ"];

const PROGRAM = {
  "Upper A": {
    label: "Monday — Upper A",
    subtitle: "Chest Priority",
    exercises: [
      { id: "UA1", name: "Incline Smith Machine Press", sets: 2, reps: "8–12", notes: "Lead movement, chest priority" },
      { id: "UA2", name: "Single Arm Lat Pulldown", sets: 2, reps: "10–12 ea", notes: "Diagonal pull, controlled" },
      { id: "UA3", name: "DB Flat Press", sets: 2, reps: "8–12", notes: "Wrist neutral, modify if needed" },
      { id: "UA4", name: "Bent Over Barbell Row", sets: 2, reps: "8–12", notes: "Standard mid back path" },
      { id: "UA5", name: "Cable Lateral Raise", sets: "2+drop", reps: "12–15 ea", notes: "Single arm, 50% drop on set 2" },
      { id: "UA6", name: "Straight Bar Cable Tricep Pushdown", sets: "2+drop", reps: "10–15", notes: "50% drop on set 2, elbows locked" },
      { id: "UA7", name: "Standing / Seated DB Bicep Curl", sets: 3, reps: "10–12", notes: "Stay within pain free range" },
    ],
    cardio: "15–20 min",
  },
  "Lower A": {
    label: "Tuesday — Lower A",
    subtitle: "Athletic",
    exercises: [
      { id: "LA1", name: "Trap Bar Deadlift", sets: 2, reps: "6–10", notes: "Explosive intent on the way up" },
      { id: "LA2", name: "Walking Lunges", sets: "3 laps", reps: "—", notes: "20lb DBs, to end and back = 1 lap" },
      { id: "LA3", name: "Leg Extension", sets: 2, reps: "12–15", notes: "Controlled" },
      { id: "LA4", name: "Sled Pull + Push", sets: 2, reps: "Turf length", notes: "Pull down, push back = 1 set" },
      { id: "LA5", name: "Suitcase Carry", sets: 2, reps: "Turf length ea side", notes: "Left hand down, right hand back = 1 set" },
      { id: "LA6", name: "Abs", sets: "—", reps: "—", notes: "Your choice" },
    ],
    cardio: null,
  },
  "Upper B": {
    label: "Wednesday — Upper B",
    subtitle: "Shoulder Priority",
    exercises: [
      { id: "UB1", name: "Smith Machine Shoulder Press", sets: 2, reps: "8–12", notes: "Lead movement, shoulder priority" },
      { id: "UB2", name: "Supported Bent Over DB Row", sets: 2, reps: "10–12 ea", notes: "One hand on bench, both feet planted" },
      { id: "UB3", name: "DB Lateral Raise", sets: "2+drop", reps: "12–15", notes: "Both arms, 50% drop on set 2" },
      { id: "UB4", name: "Straight Bar Lat Pulldown", sets: 2, reps: "10–12", notes: "Full stretch at top" },
      { id: "UB5", name: "Overhead DB Tricep Extension", sets: "2+drop", reps: "10–12 ea", notes: "Single arm, 50% drop on set 2" },
      { id: "UB6", name: "Machine Preacher Curl", sets: 3, reps: "10–12", notes: "Light, stay pain free" },
    ],
    cardio: "15–20 min",
  },
  "Lower B": {
    label: "Thursday — Lower B",
    subtitle: "Athletic · Power Focus",
    exercises: [
      { id: "LB1", name: "Plyometric Complex", sets: 2, reps: "3–5 loops", notes: "Box jump over → lateral bound → broad jump → repeat other side" },
      { id: "LB2", name: "Conventional Deadlift", sets: 2, reps: "5–8", notes: "Power intent, not grinding" },
      { id: "LB3", name: "Bulgarian Split Squat", sets: 2, reps: "8–10 ea", notes: "Bodyweight or light DB, rest between legs" },
      { id: "LB4", name: "Seated Hamstring Curl", sets: 2, reps: "10–12", notes: "Controlled, full range" },
      { id: "LB5", name: "Farmers Carry", sets: 2, reps: "Turf length", notes: "Both hands, heavy" },
      { id: "LB6", name: "Hanging Leg Raise", sets: "2–3", reps: "10–15", notes: "Controlled, no swinging" },
    ],
    cardio: null,
  },
  "Accessory": {
    label: "Fri / Sat — Solo",
    subtitle: "Accessory · Injury Phase",
    exercises: [
      { id: "AC1", name: "DB Lateral Raise", sets: "2+drop", reps: "12–15", notes: "Slow, full range, 50% drop on set 2" },
      { id: "AC2", name: "Cable Rear Delt Fly", sets: "2+drop", reps: "12–15", notes: "Light, 50% drop on set 2" },
      { id: "AC3", name: "JM Press / Overhead DB Tricep Extension", sets: "2+drop", reps: "10–12", notes: "Whichever wrist position is pain free" },
      { id: "AC4", name: "Hammer Curl / Pain Free Curl Variation", sets: 3, reps: "10–12", notes: "Whatever angle doesn't aggravate" },
    ],
    cardio: null,
  },
};

const DAY_KEYS = ["Upper A", "Lower A", "Upper B", "Lower B", "Accessory"];

const T = {
  bg: "#f5f5f5",
  card: "#ffffff",
  border: "#e8e8e8",
  text: "#0a0a0a",
  sub: "#888888",
  hint: "#bbbbbb",
  accent: "#0a0a0a",
  accentText: "#ffffff",
  pr: "#16a34a",
  prBg: "#dcfce7",
  sub2: "#ea580c",
  sub2Bg: "#fff7ed",
  input: "#f8f8f8",
};

const TODAY = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
};

const storageKey = (user, day) => `log-${user}-${day}`.replace(/\s/g, "_");

async function saveLog(user, day, sessions) {
  try { await storageSet(storageKey(user, day), JSON.stringify(sessions)); }
  catch (e) { console.error(e); }
}

async function loadLog(user, day) {
  try {
    const r = await storageGet(storageKey(user, day));
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}

const inputStyle = {
  background: T.input,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  padding: "7px 9px",
  color: T.text,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function Tag({ children, color, bg }) {
  return (
    <span style={{
      background: bg, color,
      border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 7px",
      fontSize: 9, fontWeight: 800,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>{children}</span>
  );
}

function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{
      width: 34, height: 19, borderRadius: 10,
      background: on ? T.sub2 : T.border,
      position: "relative", cursor: "pointer",
      transition: "background .2s", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 2.5,
        left: on ? 15 : 2.5,
        width: 14, height: 14, borderRadius: "50%",
        background: "#fff", transition: "left .2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </div>
  );
}

function ExerciseRow({ ex, entry, prevEntry, onChange, readOnly }) {
  const [expanded, setExpanded] = useState(false);
  const isSub = entry?.isSub;
  const hasDrop = String(ex.sets).includes("drop");
  const numSets = typeof ex.sets === "number" ? ex.sets : ex.sets === "3 laps" ? 3 : ex.sets === "2–3" ? 3 : 2;
  const totalRows = hasDrop ? numSets + 1 : numSets; // extra row for drop set
  const sets = entry?.sets || Array.from({ length: totalRows }, () => ({ weight: "", reps: "" }));

  const hasPR = !isSub && prevEntry && !prevEntry.isSub && sets.some(s => s.weight) && (() => {
    const cur = Math.max(...sets.map(s => (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0)));
    const prev = Math.max(...(prevEntry.sets || []).map(s => (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0)));
    return cur > prev && prev > 0;
  })();

  const prevSets = (!prevEntry?.isSub && prevEntry?.sets) || [];

  const updateSet = (i, field, val) => {
    const next = sets.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
    onChange({ ...entry, sets: next });
  };

  const logged = sets.some(s => s.weight);

  return (
    <div style={{
      background: T.card,
      border: `1.5px solid ${expanded ? "#0a0a0a33" : T.border}`,
      borderRadius: 12, marginBottom: 8, overflow: "hidden",
      boxShadow: expanded ? "0 2px 16px rgba(0,0,0,0.07)" : "none",
      transition: "all .2s",
    }}>
      <div onClick={() => setExpanded(e => !e)} style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "13px 14px", cursor: "pointer",
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: logged ? T.pr : T.border,
          flexShrink: 0, transition: "background .2s",
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{ex.name}</span>
            {hasPR && <Tag color={T.pr} bg={T.prBg}>PR</Tag>}
            {isSub && <Tag color={T.sub2} bg={T.sub2Bg}>Sub</Tag>}
          </div>
          <div style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>{ex.sets} sets · {ex.reps}</div>
        </div>
        <span style={{ color: T.hint, fontSize: 18, fontWeight: 300 }}>{expanded ? "−" : "+"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, color: T.hint, margin: "10px 0 12px", fontStyle: "italic" }}>{ex.notes}</div>

          <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr", gap: "6px 8px", marginBottom: 10, alignItems: "center" }}>
            {["#", "WEIGHT", "REPS", "LAST"].map(h => (
              <div key={h} style={{ fontSize: 10, color: T.hint, fontWeight: 700 }}>{h}</div>
            ))}
            {sets.map((s, i) => {
              const isDrop = hasDrop && i === sets.length - 1;
              const prev = prevSets[i];
              const prevStr = prev ? `${prev.weight || "—"}×${prev.reps || "—"}` : "—";
              return [
                <div key={`n${i}`} style={{
                  fontSize: isDrop ? 10 : 12,
                  color: isDrop ? "#92400e" : T.sub,
                  fontWeight: isDrop ? 700 : 400,
                  paddingTop: 1,
                }}>
                  {isDrop ? "↓" : i + 1}
                </div>,
                <input key={`w${i}`} disabled={readOnly} value={s.weight}
                  onChange={e => updateSet(i, "weight", e.target.value)}
                  placeholder={isDrop ? "drop lbs" : "lbs"}
                  style={{
                    ...inputStyle,
                    background: isDrop ? "#fffbeb" : T.input,
                    border: isDrop ? "1px solid #fde68a" : `1px solid ${T.border}`,
                    color: isDrop ? "#92400e" : T.text,
                  }} />,
                <input key={`r${i}`} disabled={readOnly} value={s.reps}
                  onChange={e => updateSet(i, "reps", e.target.value)}
                  placeholder={isDrop ? "to fail" : "reps"}
                  style={{
                    ...inputStyle,
                    background: isDrop ? "#fffbeb" : T.input,
                    border: isDrop ? "1px solid #fde68a" : `1px solid ${T.border}`,
                    color: isDrop ? "#92400e" : T.text,
                  }} />,
                <div key={`p${i}`} style={{ fontSize: 12, color: isDrop ? "#d97706" : T.hint }}>{prevStr}</div>,
              ];
            })}
          </div>

          {hasDrop && (
            <div style={{
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 7, padding: "6px 10px",
              fontSize: 11, color: "#92400e", marginBottom: 10,
            }}>
              ↓ Drop row = 50% of set 2 weight, log reps to failure
            </div>
          )}

          {!readOnly && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 8 }}>
                <Toggle on={isSub} onToggle={() => onChange({ ...entry, sets, isSub: !isSub, subNote: entry?.subNote || "" })} />
                <span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>Mark as substitution</span>
              </label>
              {isSub && (
                <input value={entry?.subNote || ""}
                  onChange={e => onChange({ ...entry, sets, isSub: true, subNote: e.target.value })}
                  placeholder="e.g. sub dumbbell lateral raise — cables taken"
                  style={{ ...inputStyle, marginBottom: 8, fontSize: 12 }} />
              )}
              <textarea value={entry?.note || ""}
                onChange={e => onChange({ ...entry, sets, note: e.target.value })}
                placeholder="Session note..." rows={2}
                style={{ ...inputStyle, resize: "none", fontSize: 12, fontFamily: "inherit" }} />
            </>
          )}
          {readOnly && entry?.note && (
            <div style={{ fontSize: 12, color: T.sub, fontStyle: "italic", marginTop: 6 }}>"{entry.note}"</div>
          )}
        </div>
      )}
    </div>
  );
}

function DayView({ dayKey, user, readOnly }) {
  const day = PROGRAM[dayKey];
  const [sessions, setSessions] = useState([]);
  const [current, setCurrent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadLog(user, dayKey).then(s => { setSessions(s); setLoading(false); });
  }, [user, dayKey]);

  const getPrevEntry = (exId) => {
    for (let i = sessions.length - 1; i >= 0; i--) {
      const e = sessions[i]?.entries?.[exId];
      if (e && !e.isSub) return e;
    }
    return null;
  };

  const lastSession = sessions[sessions.length - 1] || null;

  const handleSave = async () => {
    setSaving(true);
    const next = [...sessions, { date: TODAY(), entries: current }];
    await saveLog(user, dayKey, next);
    setSessions(next);
    setCurrent({});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return <div style={{ textAlign: "center", color: T.hint, padding: 40 }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: T.hint, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>{day.subtitle}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: T.text, letterSpacing: "-0.03em" }}>{day.label}</div>
        {lastSession && <div style={{ fontSize: 11, color: T.hint, marginTop: 3 }}>Last logged: {lastSession.date}</div>}
      </div>

      {day.exercises.map(ex => (
        <ExerciseRow key={ex.id} ex={ex}
          entry={readOnly ? (lastSession?.entries?.[ex.id] || null) : (current[ex.id] || null)}
          prevEntry={readOnly ? (sessions[sessions.length - 2]?.entries?.[ex.id] || null) : getPrevEntry(ex.id)}
          onChange={readOnly ? () => {} : (val) => { setCurrent(c => ({ ...c, [ex.id]: val })); setSaved(false); }}
          readOnly={readOnly}
        />
      ))}

      {day.cardio && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 10, padding: "10px 14px",
          fontSize: 13, color: "#15803d", fontWeight: 600,
          marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
        }}>
          🏃 Cardio — {day.cardio}
        </div>
      )}

      {!readOnly && (
        <button onClick={handleSave} disabled={saving} style={{
          width: "100%", marginTop: 14, padding: "15px",
          background: saved ? T.pr : T.accent,
          color: T.accentText, border: "none", borderRadius: 12,
          fontSize: 14, fontWeight: 800, fontFamily: "inherit",
          cursor: saving ? "wait" : "pointer",
          letterSpacing: "0.06em", transition: "background .3s",
        }}>
          {saving ? "SAVING..." : saved ? "✓ SESSION SAVED" : "LOG SESSION"}
        </button>
      )}
    </div>
  );
}

const DAY_META = {
  "Upper A":   { day: "Monday",    subtitle: "Chest Priority" },
  "Lower A":   { day: "Tuesday",   subtitle: "Athletic" },
  "Upper B":   { day: "Wednesday", subtitle: "Shoulder Priority" },
  "Lower B":   { day: "Thursday",  subtitle: "Athletic · Power" },
  "Accessory": { day: "Fri / Sat", subtitle: "Solo · Accessory" },
};

function ProgramEditor({ onClose }) {
  const [prog, setProg] = useState(() => JSON.parse(JSON.stringify(PROGRAM)));
  const [saving, setSaving] = useState(false);

  const updateName = (dk, id, name) => {
    setProg(p => ({
      ...p,
      [dk]: { ...p[dk], exercises: p[dk].exercises.map(e => e.id === id ? { ...e, name } : e) },
    }));
  };

  const addExercise = (dk) => {
    const newId = `${dk.replace(/\s/g,"")}_${Date.now()}`;
    setProg(p => ({
      ...p,
      [dk]: { ...p[dk], exercises: [...p[dk].exercises, { id: newId, name: "", sets: 2, reps: "10–12", notes: "" }] },
    }));
  };

  const removeExercise = (dk, id) => {
    setProg(p => ({
      ...p,
      [dk]: { ...p[dk], exercises: p[dk].exercises.filter(e => e.id !== id) },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    // Persist to shared storage
    try { await storageSet("program-v1", JSON.stringify(prog)); } catch (e) { console.error(e); }
    // Update live PROGRAM object
    Object.keys(prog).forEach(dk => { PROGRAM[dk].exercises = prog[dk].exercises; });
    setSaving(false);
    onClose();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.hint, fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>Edit Program</div>
          <div style={{ fontSize: 11, color: T.hint }}>Changes apply to both Josh and AJ</div>
        </div>
      </div>

      {DAY_KEYS.map(dk => (
        <div key={dk} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: T.sub, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
            {prog[dk].label}
          </div>
          {prog[dk].exercises.map(ex => (
            <div key={ex.id} style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "center" }}>
              <input
                value={ex.name}
                onChange={e => updateName(dk, ex.id, e.target.value)}
                placeholder="Exercise name"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => removeExercise(dk, ex.id)} style={{
                background: "none", border: `1px solid ${T.border}`,
                borderRadius: 7, color: T.hint, fontSize: 16,
                width: 34, height: 34, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>
          ))}
          <button onClick={() => addExercise(dk)} style={{
            width: "100%", padding: "9px", background: "transparent",
            border: `1.5px dashed ${T.border}`, borderRadius: 8,
            color: T.hint, fontSize: 12, fontFamily: "inherit",
            fontWeight: 600, cursor: "pointer",
          }}>+ Add exercise</button>
        </div>
      ))}

      <button onClick={handleSave} disabled={saving} style={{
        width: "100%", padding: 14, background: T.accent,
        color: T.accentText, border: "none", borderRadius: 12,
        fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
        letterSpacing: "0.06em",
      }}>
        {saving ? "SAVING..." : "SAVE PROGRAM"}
      </button>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("select");
  const [user, setUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [activeDay, setActiveDay] = useState("Upper A");

  const currentUser = viewingUser || user;
  const isReadOnly = viewingUser !== null;
  const otherUser = USERS.find(u => u !== user);

  if (screen === "select") {
    return (
      <div style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
        <div style={{ width: "100%", maxWidth: 360, padding: "0 24px" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontSize: 11, color: T.hint, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Phase 1</div>
            <div style={{ fontSize: 38, fontWeight: 900, color: T.text, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
              Athletic<br />Hypertrophy<br />Split
            </div>
            <div style={{ fontSize: 13, color: T.hint, marginTop: 10 }}>Upper · Lower · Upper · Lower + Solo</div>
          </div>
          <div style={{ fontSize: 11, color: T.hint, marginBottom: 14, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
            Who's logging?
          </div>
          {USERS.map(u => (
            <button key={u}
              onClick={() => { setUser(u); setViewingUser(null); setScreen("dayselect"); }}
              style={{
                display: "block", width: "100%", marginBottom: 10,
                padding: "16px 20px", background: T.card,
                border: `1.5px solid ${T.border}`, borderRadius: 12,
                color: T.text, fontSize: 17, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer",
                textAlign: "left", transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
            >{u}</button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === "dayselect") {
    return (
      <div style={shell}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
        <div style={{ maxWidth: 360, margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <button onClick={() => setScreen("select")}
              style={{ background: "none", border: "none", color: T.hint, fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{user}</div>
              <div style={{ fontSize: 11, color: T.hint }}>Select today's workout</div>
            </div>
          </div>
          {DAY_KEYS.map(dk => (
            <button key={dk}
              onClick={() => { setActiveDay(dk); setScreen("main"); }}
              style={{
                display: "block", width: "100%", marginBottom: 10,
                padding: "14px 18px", background: T.card,
                border: `1.5px solid ${T.border}`, borderRadius: 12,
                cursor: "pointer", textAlign: "left",
                transition: "all .15s", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{dk}</div>
              <div style={{ fontSize: 12, color: T.hint, marginTop: 2 }}>{DAY_META[dk].day} · {DAY_META[dk].subtitle}</div>
            </button>
          ))}
          <button onClick={() => setScreen("editor")} style={{
            display: "block", width: "100%", marginTop: 16,
            padding: "12px 18px", background: "transparent",
            border: `1.5px dashed ${T.border}`, borderRadius: 12,
            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
            color: T.hint, fontSize: 13, fontWeight: 600,
          }}>✏️  Edit program</button>
        </div>
      </div>
    );
  }

  if (screen === "editor") {
    return (
      <div style={shell}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 60px" }}>
          <ProgramEditor onClose={() => setScreen("dayselect")} />
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>

        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 12px", borderBottom: `1px solid ${T.border}`,
          background: T.card, position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { setScreen("dayselect"); setViewingUser(null); }}
              style={{ background: "none", border: "none", color: T.hint, fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{currentUser}</span>
                {isReadOnly && <Tag color={T.sub2} bg={T.sub2Bg}>Viewing</Tag>}
              </div>
              <div style={{ fontSize: 10, color: T.hint }}>Phase 1 · Athletic Hypertrophy</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {isReadOnly
              ? <button onClick={() => setViewingUser(null)} style={pillBtn}>Back to {user}</button>
              : <button onClick={() => setViewingUser(otherUser)} style={pillBtn}>View {otherUser}</button>
            }
          </div>
        </div>

        {/* Day tabs */}
        <div style={{
          display: "flex", gap: 6, padding: "10px 16px",
          overflowX: "auto", scrollbarWidth: "none",
          borderBottom: `1px solid ${T.border}`, background: T.card,
        }}>
          {DAY_KEYS.map(dk => (
            <button key={dk} onClick={() => setActiveDay(dk)} style={{
              background: activeDay === dk ? T.accent : T.bg,
              color: activeDay === dk ? T.accentText : T.sub,
              border: `1.5px solid ${activeDay === dk ? T.accent : T.border}`,
              borderRadius: 8, padding: "6px 14px", fontSize: 12,
              fontFamily: "inherit", fontWeight: activeDay === dk ? 700 : 500,
              cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s",
            }}>{dk}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "16px 16px 100px", overflowY: "auto", background: T.bg }}>
          <DayView
            key={`${currentUser}-${activeDay}`}
            dayKey={activeDay}
            user={currentUser}
            readOnly={isReadOnly}
          />
        </div>
      </div>
      <FloatingTimer />
    </div>
  );
}

function FloatingTimer() {
  const [mode, setMode] = useState("stopwatch"); // stopwatch | countdown
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // ms
  const [countdownTarget, setCountdownTarget] = useState(180); // seconds
  const [remaining, setRemaining] = useState(180);
  const [expanded, setExpanded] = useState(false);
  const [settingTime, setSettingTime] = useState(false);
  const [inputMin, setInputMin] = useState("3");
  const [inputSec, setInputSec] = useState("00");
  const intervalRef = useState(null);
  const startRef = useState(null);
  const elapsedRef = useState(elapsed);

  useEffect(() => { elapsedRef[0] = elapsed; }, [elapsed]);

  const tick = useCallback(() => {
    if (mode === "stopwatch") {
      setElapsed(e => e + 100);
    } else {
      setRemaining(r => {
        if (r <= 100) {
          clearInterval(intervalRef[0]);
          setRunning(false);
          return 0;
        }
        return r - 100;
      });
    }
  }, [mode]);

  useEffect(() => {
    if (running) {
      intervalRef[0] = setInterval(tick, 100);
    } else {
      clearInterval(intervalRef[0]);
    }
    return () => clearInterval(intervalRef[0]);
  }, [running, tick]);

  const handleStartStop = () => setRunning(r => !r);

  const handleReset = () => {
    setRunning(false);
    clearInterval(intervalRef[0]);
    setElapsed(0);
    setRemaining(countdownTarget * 1000);
  };

  const handleModeSwitch = (m) => {
    setRunning(false);
    clearInterval(intervalRef[0]);
    setElapsed(0);
    setRemaining(countdownTarget * 1000);
    setMode(m);
  };

  const handleSetTime = () => {
    const mins = parseInt(inputMin) || 0;
    const secs = parseInt(inputSec) || 0;
    const total = (mins * 60 + secs);
    setCountdownTarget(total);
    setRemaining(total * 1000);
    setRunning(false);
    setElapsed(0);
    setSettingTime(false);
  };

  const formatTime = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const tenth = Math.floor((ms % 1000) / 100);
    if (mode === "stopwatch") return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${tenth}`;
    return `${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const displayMs = mode === "stopwatch" ? elapsed : remaining;
  const progress = mode === "countdown" ? (remaining / (countdownTarget * 1000)) : null;
  const isWarning = mode === "countdown" && remaining < 10000 && remaining > 0;
  const isDone = mode === "countdown" && remaining === 0;

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          position: "fixed", bottom: 20, right: 16, zIndex: 100,
          background: running ? (isWarning ? "#ef4444" : "#0a0a0a") : T.card,
          border: `2px solid ${running ? "transparent" : T.border}`,
          borderRadius: 50, padding: "10px 16px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          transition: "all .2s",
        }}
      >
        <span style={{ fontSize: 16 }}>⏱</span>
        <span style={{
          fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums",
          color: running ? "#fff" : T.text, letterSpacing: "0.02em",
        }}>
          {formatTime(displayMs)}
        </span>
        {running && <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#fff", animation: "pulse 1s infinite",
        }} />}
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <div style={{
        position: "fixed", bottom: 16, right: 16, left: 16,
        maxWidth: 360, margin: "0 auto",
        zIndex: 100,
        background: T.card,
        border: `1.5px solid ${T.border}`,
        borderRadius: 20,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        overflow: "hidden",
        fontFamily: "'Barlow', sans-serif",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px 8px",
          borderBottom: `1px solid ${T.border}`,
        }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 6 }}>
            {["stopwatch", "countdown"].map(m => (
              <button key={m} onClick={() => handleModeSwitch(m)} style={{
                background: mode === m ? T.accent : T.bg,
                color: mode === m ? T.accentText : T.sub,
                border: `1.5px solid ${mode === m ? T.accent : T.border}`,
                borderRadius: 6, padding: "4px 10px",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer", textTransform: "capitalize",
              }}>{m}</button>
            ))}
          </div>
          <button onClick={() => setExpanded(false)} style={{
            background: "none", border: "none", color: T.hint,
            fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1,
          }}>−</button>
        </div>

        {/* Time display */}
        <div style={{
          textAlign: "center", padding: "20px 16px 12px",
          background: isDone ? "#fef2f2" : isWarning ? "#fff7ed" : "#fff",
        }}>
          {/* Countdown progress bar */}
          {mode === "countdown" && (
            <div style={{
              height: 4, background: T.border, borderRadius: 2,
              marginBottom: 16, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${(progress || 0) * 100}%`,
                background: isWarning ? "#ef4444" : "#0a0a0a",
                transition: "width .1s linear, background .3s",
              }} />
            </div>
          )}

          <div style={{
            fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em",
            fontVariantNumeric: "tabular-nums",
            color: isDone ? "#ef4444" : isWarning ? "#ea580c" : T.text,
            lineHeight: 1,
          }}>
            {formatTime(displayMs)}
          </div>
          {isDone && <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 700, marginTop: 6 }}>Time's up!</div>}

          {/* Set countdown time */}
          {mode === "countdown" && !running && (
            settingTime ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}>
                <input value={inputMin} onChange={e => setInputMin(e.target.value)}
                  style={{ ...inputStyle, width: 52, textAlign: "center", fontSize: 16, fontWeight: 700 }}
                  placeholder="min" />
                <span style={{ color: T.sub, fontWeight: 700 }}>:</span>
                <input value={inputSec} onChange={e => setInputSec(e.target.value)}
                  style={{ ...inputStyle, width: 52, textAlign: "center", fontSize: 16, fontWeight: 700 }}
                  placeholder="sec" />
                <button onClick={handleSetTime} style={{
                  background: T.accent, color: T.accentText, border: "none",
                  borderRadius: 7, padding: "7px 12px", fontSize: 12,
                  fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                }}>Set</button>
              </div>
            ) : (
              <button onClick={() => setSettingTime(true)} style={{
                marginTop: 8, background: "none", border: "none",
                color: T.hint, fontSize: 12, cursor: "pointer",
                fontFamily: "inherit", textDecoration: "underline",
              }}>
                Set time ({Math.floor(countdownTarget/60)}:{String(countdownTarget%60).padStart(2,"0")})
              </button>
            )
          )}
        </div>

        {/* Controls */}
        <div style={{
          display: "flex", gap: 10, padding: "12px 16px 16px",
          borderTop: `1px solid ${T.border}`,
        }}>
          <button onClick={handleStartStop} style={{
            flex: 1, padding: "13px",
            background: running ? "#ef4444" : T.accent,
            color: "#fff", border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 800, fontFamily: "inherit",
            cursor: "pointer", letterSpacing: "0.05em",
            transition: "background .2s",
          }}>
            {running ? "STOP" : "START"}
          </button>
          <button onClick={handleReset} style={{
            padding: "13px 20px",
            background: T.bg, color: T.sub,
            border: `1.5px solid ${T.border}`,
            borderRadius: 12, fontSize: 15, fontWeight: 800,
            fontFamily: "inherit", cursor: "pointer",
          }}>
            RESET
          </button>
        </div>
      </div>
    </>
  );
}

const shell = { minHeight: "100dvh", background: "#f5f5f5", fontFamily: "'Barlow', sans-serif", color: "#0a0a0a" };
const pillBtn = {
  background: "#f5f5f5", border: "1.5px solid #e8e8e8", borderRadius: 7,
  color: "#888", fontSize: 11, fontFamily: "inherit", fontWeight: 700,
  padding: "5px 11px", cursor: "pointer",
};
